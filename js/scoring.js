// Beoordeling van antwoorden en berekening van de stand.
// Werkt zonder browser, zodat het ook met `node --test` getest kan worden.

export const GRACE_MS = 3000; // speling voor klokverschillen tussen telefoons
export const DEFAULT_BONUS = 0.5; // snelheidsbonus: max 50% van de punten

const ARTICLES = /^(de|het|een|the|a|an|'t)\s+/;

export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' en ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/(^|\s)\.+|\.+(\s|$)/g, ' ')
    .trim()
    .replace(ARTICLES, '')
    .replace(/\s+/g, ' ');
}

// Bewerkingsafstand waarbij ook twee verwisselde letters als één fout tellen.
export function levenshtein(a, b) {
  if (a === b) return 0;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const isNumber = (s) => /^-?\d+(\.\d+)?$/.test(s);

// Vergelijkt één antwoord met één goed antwoord: 'correct' | 'doubt' | 'wrong'.
function matchOne(given, correct) {
  if (!given || !correct) return 'wrong';
  if (given === correct) return 'correct';
  if (isNumber(correct)) {
    // Getallen moeten exact kloppen; "in 1516" i.p.v. "1516" is een twijfelgeval.
    if (isNumber(given)) return Number(given) === Number(correct) ? 'correct' : 'wrong';
    const nums = given.match(/-?\d+(\.\d+)?/g) || [];
    return nums.some((n) => Number(n) === Number(correct)) ? 'doubt' : 'wrong';
  }
  const len = correct.length;
  const max = len <= 3 ? 0 : len <= 7 ? 1 : 2;
  const d = levenshtein(given, correct);
  if (d <= max) return 'correct';
  // Zonder spaties vergelijken vangt "heine ken" vs "heineken".
  if (given.replace(/ /g, '') === correct.replace(/ /g, '')) return 'correct';
  if (len > 3 && d <= max + 2) return 'doubt';
  const words = ` ${given} `;
  if (len >= 3 && words.includes(` ${correct} `)) return 'doubt';
  if (given.length >= 4 && ` ${correct} `.includes(` ${given} `)) return 'doubt';
  return 'wrong';
}

const RANK = { correct: 2, doubt: 1, wrong: 0 };

export function matchOpen(given, answers) {
  const g = normalize(given);
  if (!g) return 'wrong';
  let best = 'wrong';
  for (const a of answers) {
    const r = matchOne(g, normalize(a));
    if (RANK[r] > RANK[best]) best = r;
  }
  return best;
}

// Status van een antwoord, rekening houdend met een handmatig oordeel van de quizmaster.
export function evaluate(q, given, judgment) {
  if (judgment === true) return 'correct';
  if (judgment === false) return 'wrong';
  if (given === undefined || given === null || given === '') return 'wrong';
  if (q.type === 'mc') return Number(given) === q.correct ? 'correct' : 'wrong';
  return matchOpen(given, [q.answer, ...(q.alts || [])]);
}

export function cutoff(run) {
  const end = Math.min(run.endsAt, run.closedAt ?? run.endsAt);
  return end + GRACE_MS;
}

export function speedBonus(points, run, t, bonusPct = DEFAULT_BONUS) {
  const frac = 1 - (t - run.startedAt) / (run.dur * 1000);
  return Math.round(points * bonusPct * Math.max(0, Math.min(1, frac)));
}

// Punten van één team voor één onderdeel; geeft ook per vraag de status terug.
export function scorePart({ part, questions, run, entry, judgments, bonusPct }) {
  const result = { points: 0, perQuestion: {} };
  if (!run || !entry || !entry.a) return result;
  if (entry.t > cutoff(run)) return result;
  for (const qid of part.qids) {
    const q = questions[qid];
    const status = evaluate(q, entry.a[qid], judgments?.[qid]);
    let pts = 0;
    if (status === 'correct') pts = q.points + (entry.done ? speedBonus(q.points, run, entry.t, bonusPct) : 0);
    result.perQuestion[qid] = { status, pts };
    result.points += pts;
  }
  return result;
}

// Volledige stand over alle gespeelde onderdelen. Gelijke score = gelijke plek.
export function computeStandings(db) {
  const { teams = {}, questions = {}, parts = {}, partOrder = [], runs = {}, answers = {}, judgments = {}, meta = {} } = db;
  const totals = {};
  for (const tid of Object.keys(teams)) totals[tid] = 0;
  for (const pid of partOrder) {
    const run = runs[pid];
    if (!run) continue;
    for (const tid of Object.keys(teams)) {
      const r = scorePart({ part: parts[pid], questions, run, entry: answers[pid]?.[tid], judgments: judgments[tid], bonusPct: meta.bonusPct ?? DEFAULT_BONUS });
      totals[tid] += r.points;
    }
  }
  const list = Object.keys(teams)
    .map((id) => ({ id, name: teams[id].name, score: totals[id] }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  list.forEach((row, i) => {
    row.rank = i > 0 && list[i - 1].score === row.score ? list[i - 1].rank : i + 1;
  });
  return list;
}
