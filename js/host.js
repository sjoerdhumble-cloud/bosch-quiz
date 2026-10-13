import { connect } from './backend.js';
import { computeStandings, evaluate, normalize, DEFAULT_BONUS } from './scoring.js';
import { parseCSV, buildQuiz, sheetCsvUrl, publicQuestion } from './sheet.js';
import { esc, quizCode, playerUrl, timerHtml, partLabel, photoHtml, standingsHtml } from './common.js';

const code = quizCode();
const base = `q/${code}`;
const be = await connect();
const panel = document.getElementById('panel');
const $ = (id) => document.getElementById(id);
let S = {};
let closing = null; // voorkomt dubbel sluiten van hetzelfde onderdeel

be.onConnected((ok) => $('offline').hidden = ok);
be.on(base, (v) => {
  S = v || {};
  document.title = `Quizmaster · ${S.meta?.title || 'Brouwerij Bosch'}`;
  render();
});

const live = () => S.live || { phase: 'lobby' };
const order = () => S.partOrder || [];
const teamIds = () => Object.keys(S.teams || {});

function render() {
  const l = live();
  const html = {
    lobby: lobbyHtml, question: questionHtml, closed: closedHtml, standings: standingsScreen, final: standingsScreen,
  }[l.phase]?.() ?? '';
  panel.innerHTML = html;
  if (l.phase === 'lobby') drawQr();
  tick();
  renderSetup();
}

function quizSummary() {
  if (!order().length) return 'Nog geen vragen geladen. Open "Vragen en instellingen" hieronder.';
  const rounds = Object.keys(S.rounds || {}).length;
  return `${rounds} ${rounds === 1 ? 'ronde' : 'rondes'}, ${order().length} onderdelen, ${Object.keys(S.questions || {}).length} vragen geladen.`;
}

function lobbyHtml() {
  const url = playerUrl(code);
  const names = teamIds().map((id) => `<li>${esc(S.teams[id].name)} <button class="link remove" data-team="${id}" title="Verwijderen">✕</button></li>`).join('');
  const first = order()[0];
  return `<section class="card center">
    <h1>Aanmelden</h1>
    <div id="qr" class="qr"></div>
    <p class="join-link"><a href="${esc(url)}" target="_blank">${esc(url)}</a></p>
    <button id="copy" class="secondary">Kopieer link</button>
  </section>
  <section class="card">
    <h2>${teamIds().length} teams aangemeld</h2>
    <ul class="teams">${names || '<li class="muted">Nog niemand…</li>'}</ul>
    <p class="muted">${quizSummary()}</p>
    ${first ? `<button class="primary big" data-act="start" data-idx="0">Start ${esc(S.rounds[S.parts[first].round].name)}</button>` : ''}
  </section>`;
}

function drawQr() {
  const el = $('qr');
  if (!el || !window.QRCode) return;
  new window.QRCode(el, { text: playerUrl(code), width: 240, height: 240, correctLevel: window.QRCode.CorrectLevel.M });
}

function answersFor(pid) {
  return S.answers?.[pid] || {};
}

function questionHtml() {
  const l = live();
  const ans = answersFor(l.partId);
  const total = teamIds().length;
  const entries = teamIds().map((id) => ans[id]).filter(Boolean);
  const done = entries.filter((a) => a.done).length;
  const busy = entries.length - done;
  const pct = (n) => (total ? (n / total) * 100 : 0).toFixed(1);
  const qs = l.questions.map((pq) => {
    const q = S.questions[pq.id];
    return `<div class="question"><h2>${esc(q.text)}</h2>${photoHtml(q)}<p class="muted">Antwoord: <b>${esc(q.answer)}</b> · ${q.points} punten</p></div>`;
  }).join('');
  return `<section class="card">
    <div class="sub">${partLabel(l)}</div>
    <div id="timer"></div>
    <div class="progress ${total && done === total ? 'all-done' : ''}">
      <div class="progress-count"><b>${done + busy}</b> / ${total}</div>
      <div class="progress-label">${total && done === total ? 'Iedereen heeft ingeleverd' : 'teams hebben geantwoord'}</div>
      <div class="progress-bar"><span class="done" style="width:${pct(done)}%"></span><span class="busy" style="width:${pct(busy)}%"></span></div>
      <div class="progress-legend"><span><i class="done"></i>${done} ingeleverd</span><span><i class="busy"></i>${busy} bezig</span><span><i></i>${total - done - busy} nog niets</span></div>
    </div>
    <div class="row">
      <button class="secondary" data-act="extend">+30 sec</button>
      <button class="primary" data-act="close">Nu sluiten</button>
    </div>
  </section><section class="card">${qs}</section>`;
}

// Antwoorden per vraag gegroepeerd, met de status zoals die nu meetelt.
function groupsFor(q, pid) {
  const groups = new Map();
  for (const [tid, entry] of Object.entries(answersFor(pid))) {
    if (!S.teams?.[tid]) continue;
    const given = entry.a?.[q.id];
    if (given === undefined) continue;
    const key = q.type === 'mc' ? `mc${given}` : normalize(given);
    if (!groups.has(key)) groups.set(key, { label: q.type === 'mc' ? q.options[given] : String(given), teams: [], given });
    groups.get(key).teams.push(tid);
  }
  return [...groups.values()].map((g) => {
    const statuses = g.teams.map((tid) => evaluate(q, g.given, S.judgments?.[tid]?.[q.id]));
    const status = statuses.includes('doubt') ? 'doubt' : statuses.every((s) => s === 'correct') ? 'correct' : statuses.every((s) => s === 'wrong') ? 'wrong' : 'doubt';
    return { ...g, status };
  }).sort((a, b) => ({ doubt: 0, correct: 1, wrong: 2 })[a.status] - ({ doubt: 0, correct: 1, wrong: 2 })[b.status] || b.teams.length - a.teams.length);
}

function closedHtml() {
  const l = live();
  let doubts = 0;
  const qs = l.questions.map((pq) => {
    const q = S.questions[pq.id];
    const groups = groupsFor(q, l.partId);
    doubts += groups.filter((g) => g.status === 'doubt').length;
    const rows = groups.map((g) => `<li class="group ${g.status}" data-q="${q.id}" data-teams="${g.teams.join(',')}" data-status="${g.status}">
      <span class="ans">${esc(g.label)}</span><span class="count">${g.teams.length}×</span>
      <span class="chip">${{ correct: 'goed', wrong: 'fout', doubt: 'twijfel' }[g.status]}</span></li>`).join('');
    return `<div class="question"><h2>${esc(q.text)}</h2>
      <p>Goed antwoord: <b>${esc(q.answer)}</b>${q.alts?.length ? ` <span class="muted">(ook goed: ${esc(q.alts.join(', '))})</span>` : ''}</p>
      <ul class="groups">${rows || '<li class="muted">Geen antwoorden</li>'}</ul></div>`;
  }).join('');
  return `<section class="card">
    <div class="sub">${partLabel(l)}</div>
    <h1>Antwoorden</h1>
    <p class="muted">Tik op een antwoord om het goed of fout te rekenen.${doubts ? ` <b class="warn-text">${doubts} twijfelgeval${doubts === 1 ? '' : 'len'} nog beoordelen.</b>` : ''}</p>
    ${nextButtons()}
  </section><section class="card">${qs}</section>`;
}

function nextButtons() {
  const l = live();
  const next = order()[l.partIdx + 1];
  const roundEnds = !next || S.parts[next].round !== l.round;
  const btns = [];
  if (!next) btns.push('<button class="primary big" data-act="final">Toon eindstand</button>');
  else if (roundEnds) btns.push('<button class="primary big" data-act="standings">Toon tussenstand</button>', `<button class="secondary" data-act="start" data-idx="${l.partIdx + 1}">Door zonder stand</button>`);
  else btns.push(`<button class="primary big" data-act="start" data-idx="${l.partIdx + 1}">Volgende vraag</button>`, '<button class="secondary" data-act="standings">Toon stand</button>');
  return `<div class="row">${btns.join('')}</div>`;
}

function standingsScreen() {
  const l = live();
  const next = order()[l.partIdx + 1];
  const list = computeStandings(S);
  let btn = '';
  if (l.phase === 'standings') {
    btn = next
      ? `<button class="primary big" data-act="start" data-idx="${l.partIdx + 1}">Start ${S.parts[next].round !== l.round ? esc(S.rounds[S.parts[next].round].name) : 'volgende vraag'}</button>`
      : '<button class="primary big" data-act="final">Toon eindstand</button>';
  }
  const stale = JSON.stringify(list) !== JSON.stringify(l.standings?.list);
  return `<section class="card">
    <h1>${esc(l.standings?.title || '')}</h1>
    <div class="row">${btn}${stale ? `<button class="secondary" data-act="${l.phase === 'final' ? 'final' : 'standings'}">Stand bijwerken</button>` : ''}</div>
    ${standingsHtml(list, { final: l.phase === 'final' })}
  </section>`;
}

function tick() {
  const l = live();
  const t = $('timer');
  if (t && l.phase === 'question') t.innerHTML = timerHtml(l, be.now());
  // Automatisch sluiten als de tijd om is (met een seconde speling).
  if (l.phase === 'question' && be.now() > l.endsAt + 1000) closePart();
}
setInterval(tick, 250);

// --- Acties ---

function startPart(idx) {
  closing = null;
  const pid = order()[idx];
  const part = S.parts[pid];
  const inRound = order().filter((p) => S.parts[p].round === part.round);
  const now = be.now();
  const l = {
    phase: 'question', partIdx: idx, partId: pid, round: part.round, roundName: S.rounds[part.round].name,
    partNo: inRound.indexOf(pid) + 1, partsInRound: inRound.length,
    startedAt: now, endsAt: now + part.seconds * 1000, dur: part.seconds,
    questions: part.qids.map((id) => publicQuestion(S.questions[id])),
    preload: S.live?.preload || [],
  };
  be.update(base, { live: l, [`runs/${pid}`]: { startedAt: l.startedAt, endsAt: l.endsAt, dur: l.dur }, [`answers/${pid}`]: null });
}

function extend() {
  const l = live();
  const endsAt = Math.max(l.endsAt, be.now()) + 30000;
  be.update(base, { 'live/endsAt': endsAt, [`runs/${l.partId}/endsAt`]: endsAt });
}

function closePart() {
  const l = live();
  if (closing === l.partId) return;
  closing = l.partId;
  const closedAt = Math.min(be.now(), l.endsAt);
  const reveal = {};
  for (const pq of l.questions) reveal[pq.id] = S.questions[pq.id];
  be.update(base, { 'live/phase': 'closed', 'live/closedAt': closedAt, 'live/reveal': reveal, [`runs/${l.partId}/closedAt`]: closedAt });
}

function showStandings(final) {
  const l = live();
  const title = final ? 'Eindstand' : `Stand na ${S.rounds[l.round]?.name || 'deze ronde'}`;
  be.update(base, { 'live/phase': final ? 'final' : 'standings', 'live/standings': { title, final, list: computeStandings(S) } });
}

// Tik op een antwoordgroep: wissel tussen goed en fout voor alle teams met dat antwoord.
function toggleGroup(li) {
  const makeCorrect = li.dataset.status !== 'correct';
  const upd = {};
  for (const tid of li.dataset.teams.split(',')) upd[`judgments/${tid}/${li.dataset.q}`] = makeCorrect;
  be.update(base, upd);
}

panel.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b) {
    const act = b.dataset.act;
    if (act === 'start') startPart(Number(b.dataset.idx));
    if (act === 'extend') extend();
    if (act === 'close') closePart();
    if (act === 'standings') showStandings(false);
    if (act === 'final') showStandings(true);
  }
  const g = e.target.closest('.group');
  if (g) toggleGroup(g);
  const rm = e.target.closest('.remove');
  if (rm && confirm(`Team "${S.teams[rm.dataset.team].name}" verwijderen?`)) be.remove(`${base}/teams/${rm.dataset.team}`);
  if (e.target.id === 'copy') {
    navigator.clipboard?.writeText(playerUrl(code)).then(() => { e.target.textContent = 'Gekopieerd ✓'; });
  }
});

// --- Vragen en instellingen ---

function renderSetup() {
  $('summary').textContent = quizSummary();
  if (document.activeElement?.closest('#setup')) return;
  $('title').value = S.meta?.title || '';
  $('bonus').value = Math.round((S.meta?.bonusPct ?? DEFAULT_BONUS) * 100);
  if (S.meta?.sheetUrl && !$('sheet').value) $('sheet').value = S.meta.sheetUrl;
  $('player-link').href = playerUrl(code);
  $('player-link').textContent = playerUrl(code);
}

function status(msg, isError) {
  $('setup-status').innerHTML = msg;
  $('setup-status').className = isError ? 'warn' : 'ok';
}

async function loadQuiz(text, sheetUrl) {
  const { quiz, errors } = buildQuiz(parseCSV(text));
  if (!quiz || errors.length) {
    status(`<b>Niet geladen, verbeter eerst:</b><br>${errors.map(esc).join('<br>')}`, true);
    return;
  }
  const started = Object.keys(S.runs || {}).length > 0;
  if (started && !confirm('De quiz is al begonnen. Nieuwe vragen laden wist alle antwoorden en punten (teams blijven). Doorgaan?')) return;
  const preload = Object.values(quiz.questions).map((q) => q.photo).filter(Boolean);
  await be.update(base, {
    ...quiz,
    'meta/sheetUrl': sheetUrl || S.meta?.sheetUrl || '',
    answers: null, judgments: null, runs: null,
    live: { phase: 'lobby', preload },
  });
  const nq = Object.keys(quiz.questions).length;
  status(`Geladen: ${Object.keys(quiz.rounds).length} rondes, ${quiz.partOrder.length} onderdelen, ${nq} vragen.`);
}

$('load-sheet').addEventListener('click', async () => {
  const url = $('sheet').value.trim();
  if (!url) return status('Plak eerst de link naar je Google Sheet.', true);
  status('Bezig met laden…');
  try {
    const res = await fetch(sheetCsvUrl(url));
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('geen CSV');
    await loadQuiz(text, url);
  } catch (err) {
    status(`Kon de Sheet niet ophalen (${esc(err.message)}). Zet delen op "Iedereen met de link kan bekijken", of gebruik Bestand > Delen > Publiceren op internet en plak die link.`, true);
  }
});

$('csv-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) await loadQuiz(await file.text());
  e.target.value = '';
});

$('save-settings').addEventListener('click', () => {
  const pct = Math.max(0, Math.min(100, Number($('bonus').value) || 0));
  be.update(base, { 'meta/title': $('title').value.trim() || 'Brouwerij Bosch', 'meta/bonusPct': pct / 100 });
  status('Instellingen opgeslagen.');
});

$('reset').addEventListener('click', () => {
  if (!confirm('Alle antwoorden en punten wissen en terug naar het aanmeldscherm? Teams en vragen blijven.')) return;
  be.update(base, { answers: null, judgments: null, runs: null, live: { phase: 'lobby', preload: S.live?.preload || [] } });
  status('Quiz teruggezet naar het begin.');
});

$('reset-teams').addEventListener('click', () => {
  if (!confirm('Alle teams verwijderen? Spelers moeten zich dan opnieuw aanmelden.')) return;
  be.update(base, { teams: null, answers: null, judgments: null, runs: null, live: { phase: 'lobby', preload: S.live?.preload || [] } });
  status('Teams verwijderd.');
});

if (be.kind === 'local') $('mode').hidden = false;
