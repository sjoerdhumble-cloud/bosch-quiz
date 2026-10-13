// Inlezen van de vragenlijst (Google Sheet of CSV) en omzetten naar quizonderdelen.

export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  const sep = detectSeparator(text);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

// Excel in het Nederlands exporteert CSV met puntkomma's.
function detectSeparator(text) {
  const first = text.split(/\r?\n/)[0];
  return (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
}

const COLUMNS = {
  ronde: ['ronde', 'round'],
  rondenaam: ['rondenaam', 'naam ronde', 'ronde naam', 'thema'],
  blok: ['blok', 'block'],
  type: ['type', 'soort'],
  vraag: ['vraag', 'question'],
  opties: ['opties', 'antwoordopties', 'keuzes', 'options'],
  antwoord: ['antwoord', 'goed antwoord', 'juiste antwoord', 'answer'],
  alternatieven: ['alternatieven', 'ook goed', 'alternatief'],
  punten: ['punten', 'points'],
  seconden: ['seconden', 'tijd', 'sec', 'seconds'],
  foto: ['foto', 'afbeelding', 'plaatje', 'image'],
};

export const DEFAULT_POINTS = 10;
export const DEFAULT_SECONDS = 60;

const splitList = (s) => {
  s = String(s || '').trim();
  if (!s) return [];
  return s.split(s.includes('|') ? '|' : ';').map((x) => x.trim()).filter(Boolean);
};

// Zet een Google Drive-deellink om naar een directe afbeeldingslink.
export function imageUrl(url) {
  url = String(url || '').trim();
  if (!url) return '';
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/);
  return m ? `https://lh3.googleusercontent.com/d/${m[1]}` : url;
}

const norm = (s) => String(s).trim().toLowerCase();

// rows: uitkomst van parseCSV. Geeft { quiz, errors } terug.
export function buildQuiz(rows) {
  const errors = [];
  if (!rows.length) return { quiz: null, errors: ['De vragenlijst is leeg.'] };
  const header = rows[0].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(COLUMNS)) col[key] = header.findIndex((h) => names.includes(h));
  if (col.vraag < 0) errors.push('Kolom "vraag" ontbreekt in de eerste regel.');
  if (col.ronde < 0) errors.push('Kolom "ronde" ontbreekt in de eerste regel.');
  if (errors.length) return { quiz: null, errors };

  const get = (r, key) => (col[key] >= 0 ? String(r[col[key]] ?? '').trim() : '');
  const questions = {}, parts = {}, partOrder = [], rounds = {};
  const roundCounters = {};
  let lastPart = null;

  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const text = get(r, 'vraag');
    if (!text) return;
    const round = parseInt(get(r, 'ronde'), 10);
    if (!(round > 0)) { errors.push(`Regel ${line}: "ronde" moet een getal zijn.`); return; }
    if (!rounds[round]) rounds[round] = { name: '' };
    if (!rounds[round].name && get(r, 'rondenaam')) rounds[round].name = get(r, 'rondenaam');

    const options = splitList(get(r, 'opties'));
    let type = norm(get(r, 'type'));
    if (['meerkeuze', 'multiple choice', 'multiplechoice', 'keuze'].includes(type)) type = 'mc';
    if (!type) type = options.length ? 'mc' : 'open';
    if (type !== 'mc' && type !== 'open') { errors.push(`Regel ${line}: type "${type}" ken ik niet, gebruik "mc" of "open".`); return; }

    const answer = get(r, 'antwoord');
    if (!answer) { errors.push(`Regel ${line}: het goede antwoord ontbreekt.`); return; }
    roundCounters[round] = (roundCounters[round] || 0) + 1;
    const id = `r${round}q${roundCounters[round]}`;
    const pointsRaw = get(r, 'punten');
    const points = pointsRaw === '' ? DEFAULT_POINTS : Number(pointsRaw.replace(',', '.'));
    if (!(points >= 0)) { errors.push(`Regel ${line}: "punten" moet een getal zijn.`); return; }
    const secRaw = get(r, 'seconden');
    const seconds = secRaw === '' ? DEFAULT_SECONDS : parseInt(secRaw, 10);
    if (!(seconds > 0)) { errors.push(`Regel ${line}: "seconden" moet een getal zijn.`); return; }

    const q = { id, round, type, text, points, photo: imageUrl(get(r, 'foto')) };
    if (type === 'mc') {
      if (options.length < 2) { errors.push(`Regel ${line}: meerkeuzevraag heeft minstens 2 opties nodig (scheiden met |).`); return; }
      let idx = -1;
      if (/^[a-h]$/i.test(answer)) idx = answer.toUpperCase().charCodeAt(0) - 65;
      if (idx < 0 || idx >= options.length) idx = options.findIndex((o) => norm(o) === norm(answer));
      if (idx < 0) { errors.push(`Regel ${line}: antwoord "${answer}" staat niet tussen de opties.`); return; }
      q.options = options;
      q.correct = idx;
      q.answer = options[idx];
    } else {
      q.answer = answer;
      q.alts = splitList(get(r, 'alternatieven'));
    }
    questions[id] = q;

    const block = get(r, 'blok');
    if (block && lastPart && lastPart.round === round && lastPart.block === block) {
      lastPart.qids.push(id);
      lastPart.seconds += seconds;
    } else {
      const pid = `p${String(partOrder.length + 1).padStart(2, '0')}`;
      lastPart = { id: pid, round, block, qids: [id], seconds };
      parts[pid] = lastPart;
      partOrder.push(pid);
    }
  });

  if (!partOrder.length && !errors.length) errors.push('Geen vragen gevonden.');
  for (const n of Object.keys(rounds)) if (!rounds[n].name) rounds[n].name = `Ronde ${n}`;
  return { quiz: { questions, parts, partOrder, rounds }, errors };
}

// Maakt van een gewone Sheet-link een CSV-link die de browser mag ophalen.
export function sheetCsvUrl(url) {
  url = url.trim();
  if (/\/pub(html)?\b/.test(url) || /output=csv/.test(url)) {
    const u = new URL(url.replace('/pubhtml', '/pub'));
    u.searchParams.set('output', 'csv');
    return u.toString();
  }
  const id = url.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id) return url;
  const gid = url.match(/[#&?]gid=(\d+)/)?.[1] || '0';
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=1&gid=${gid}`;
}

// Versie van de vragen zonder antwoorden, voor op de telefoons van spelers.
export function publicQuestion(q) {
  const p = { id: q.id, type: q.type, text: q.text, points: q.points };
  if (q.photo) p.photo = q.photo;
  if (q.options) p.options = q.options;
  return p;
}
