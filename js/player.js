import { connect } from './backend.js';
import { scorePart, cutoff } from './scoring.js';
import { esc, quizCode, timerHtml, partLabel, photoHtml, standingsHtml } from './common.js';

const code = quizCode();
const base = `q/${code}`;
const app = document.getElementById('app');
const offline = document.getElementById('offline');
const be = await connect();

// In testmodus delen alle tabbladen dezelfde opslag; dan krijgt elk tabblad een eigen team.
const store = be.kind === 'local' ? sessionStorage : localStorage;
const TEAM_KEY = `quiz:${code}:team`;
let teamId = store.getItem(TEAM_KEY);
let teams = {}, live = null, meta = {}, judgments = {}, entry = null;
let entryPart = null, unsubEntry = null;
let draft = {}, lastChange = 0, saveTimer = null;
let screenKey = '';
const preloaded = new Set();

be.onConnected((ok) => offline.hidden = ok);
be.on(`${base}/meta`, (v) => { meta = v || {}; document.title = meta.title || 'Brouwerij Bosch'; render(); });
be.on(`${base}/teams`, (v) => { teams = v || {}; render(); });
be.on(`${base}/live`, (v) => { if (lastChange) flushDraft(); live = v; watchEntry(); preload(); render(); });
watchJudgments();

function watchJudgments() {
  if (!teamId) return;
  be.on(`${base}/judgments/${teamId}`, (v) => { judgments = v || {}; render(); });
}

// Volg het eigen antwoord van het huidige onderdeel (ook na herladen van de pagina).
function watchEntry() {
  const pid = live?.partId;
  if (!teamId || pid === entryPart) return;
  unsubEntry?.();
  entryPart = pid;
  entry = null;
  draft = loadDraft(pid);
  if (!pid) return;
  unsubEntry = be.on(`${base}/answers/${pid}/${teamId}`, (v) => {
    entry = v;
    if (v?.a && !Object.keys(draft).length) draft = { ...v.a };
    render();
  });
}

function preload() {
  for (const url of live?.preload || []) {
    if (preloaded.has(url)) continue;
    preloaded.add(url);
    new Image().src = url;
  }
}

const draftKey = (pid) => `quiz:${code}:draft:${pid}`;
function loadDraft(pid) {
  try { return JSON.parse(store.getItem(draftKey(pid))) || {}; } catch { return {}; }
}

const team = () => (teamId ? teams[teamId] : null);
const expired = () => live && be.now() > live.endsAt;
const locked = () => !!entry?.done || expired() || live?.phase !== 'question';

function render() {
  if (!teamId || !team()) return show('join', joinHtml);
  if (!live || live.phase === 'lobby') return show(`lobby:${team().name}:${Object.keys(teams).length}`, lobbyHtml);
  if (live.phase === 'question') return show(`q:${live.partId}:${locked()}`, questionHtml, tick);
  if (live.phase === 'closed') return show(`c:${live.partId}:${JSON.stringify([entry, judgments])}`, closedHtml);
  if (live.phase === 'standings' || live.phase === 'final') return show(`s:${JSON.stringify(live.standings)}`, standingsScreen);
}

// Alleen opnieuw tekenen als het scherm echt verandert, zodat invoer niet verdwijnt.
function show(key, html, after) {
  if (key !== screenKey) {
    screenKey = key;
    app.innerHTML = html();
  }
  after?.();
}

function header() {
  return `<header class="top"><span class="brand">${esc(meta.title || 'Brouwerij Bosch')}</span><span class="team-tag">${esc(team()?.name || '')}</span></header>`;
}

function joinHtml() {
  return `<header class="top"><span class="brand">${esc(meta.title || 'Brouwerij Bosch')}</span></header>
  <main class="card center">
    <h1>Doe mee!</h1>
    <p>Speel je samen met je buurman of -vrouw? Vul één teamnaam in en speel op één telefoon.</p>
    <form id="join">
      <input id="name" maxlength="30" autocomplete="off" placeholder="Teamnaam, bijv. Jan & Piet" required>
      <button class="primary big">Meedoen</button>
    </form>
  </main>`;
}

function lobbyHtml() {
  const n = Object.keys(teams).length;
  return `${header()}<main class="card center">
    <h1>Welkom, ${esc(team().name)}!</h1>
    <p>De quizmaster start zo de eerste vraag. Houd deze pagina open.</p>
    <p class="muted">${n} ${n === 1 ? 'team doet' : 'teams doen'} mee</p>
    <button class="link" id="leave">Andere teamnaam kiezen</button>
  </main>`;
}

function questionHtml() {
  const single = live.questions.length === 1;
  const isLocked = locked();
  const qs = live.questions.map((q, i) => {
    const val = draft[q.id];
    const input = q.type === 'mc'
      ? `<div class="options">${q.options.map((o, oi) => `<button class="option ${Number(val) === oi && val !== undefined && val !== '' ? 'selected' : ''}" data-q="${q.id}" data-i="${oi}" ${isLocked ? 'disabled' : ''}><b>${String.fromCharCode(65 + oi)}</b> ${esc(o)}</button>`).join('')}</div>`
      : `<input class="answer" data-q="${q.id}" value="${esc(val ?? '')}" placeholder="Jouw antwoord" autocomplete="off" ${isLocked ? 'disabled' : ''}>`;
    return `<section class="question">
      ${single ? '' : `<div class="qnum">Vraag ${i + 1}</div>`}
      <h2>${esc(q.text)}</h2>${photoHtml(q)}${input}</section>`;
  }).join('');
  let footer;
  if (entry?.done) footer = '<p class="sent">Verstuurd ✓ Wacht op de anderen…</p>';
  else if (isLocked) footer = '<p class="sent">De tijd is om. Je ingevulde antwoorden tellen mee.</p>';
  else footer = `<button class="primary big" id="submit">${single ? 'Verstuur' : 'Inleveren'}</button>`;
  return `${header()}<div class="sub">${partLabel(live)}</div><div id="timer"></div>
    <main>${qs}<div class="footer">${footer}</div></main>`;
}

function tick() {
  const t = document.getElementById('timer');
  if (t) t.innerHTML = timerHtml(live, be.now());
  if (expired() && lastChange) flushDraft();
}

function closedHtml() {
  const run = { startedAt: live.startedAt, endsAt: live.endsAt, closedAt: live.closedAt, dur: live.dur };
  const part = { qids: live.questions.map((q) => q.id) };
  const res = scorePart({ part, questions: live.reveal, run, entry, judgments, bonusPct: meta.bonusPct });
  const late = entry && entry.t > cutoff(run);
  const items = part.qids.map((qid) => {
    const q = live.reveal[qid];
    const given = entry?.a?.[qid];
    const givenText = given === undefined || given === '' ? '—' : q.type === 'mc' ? q.options[given] : given;
    const st = res.perQuestion[qid] || { status: 'wrong', pts: 0 };
    const label = { correct: `Goed! +${st.pts}`, wrong: 'Helaas', doubt: 'Quizmaster beoordeelt…' }[st.status];
    return `<section class="question result ${st.status}">
      <h2>${esc(q.text)}</h2>
      <p>Goed antwoord: <b>${esc(q.answer)}</b></p>
      <p>Jullie antwoord: ${esc(givenText)}</p>
      <span class="chip">${label}</span></section>`;
  }).join('');
  return `${header()}<div class="sub">${partLabel(live)}</div>
    <main>${late ? '<p class="warn">Jullie antwoord kwam na de tijd binnen en telt helaas niet mee.</p>' : ''}${items}
    <p class="muted center">Wacht op de quizmaster…</p></main>`;
}

function standingsScreen() {
  const s = live.standings || { list: [] };
  const me = s.list.find((r) => r.id === teamId);
  const mine = me ? `<p class="mine">Jullie staan op plek <b>${me.rank}</b> met <b>${me.score}</b> punten</p>` : '';
  return `${header()}<main class="card">
    <h1>${esc(s.title || 'Tussenstand')}</h1>${mine}
    ${standingsHtml(s.list, { highlight: teamId, limit: 10, final: live.phase === 'final' })}</main>`;
}

// --- Invoer ---

app.addEventListener('submit', (e) => {
  if (e.target.id !== 'join') return;
  e.preventDefault();
  const name = uniqueName(document.getElementById('name').value.trim().slice(0, 30));
  if (!name) return;
  teamId = 't' + Math.random().toString(36).slice(2, 10);
  store.setItem(TEAM_KEY, teamId);
  teams = { ...teams, [teamId]: { name, joinedAt: be.now() } };
  be.set(`${base}/teams/${teamId}`, { name, joinedAt: be.now() });
  watchJudgments();
  watchEntry();
  render();
});

function uniqueName(name) {
  if (!name) return '';
  const taken = new Set(Object.values(teams).map((t) => t.name.toLowerCase()));
  let n = name, i = 2;
  while (taken.has(n.toLowerCase())) n = `${name} (${i++})`;
  return n;
}

app.addEventListener('click', (e) => {
  const opt = e.target.closest('.option');
  if (opt && !locked()) {
    draft[opt.dataset.q] = Number(opt.dataset.i);
    opt.parentElement.querySelectorAll('.option').forEach((b) => b.classList.toggle('selected', b === opt));
    changed(0);
  }
  if (e.target.id === 'submit' && !locked()) submit();
  if (e.target.id === 'leave') {
    be.remove(`${base}/teams/${teamId}`);
    store.removeItem(TEAM_KEY);
    teamId = null;
    render();
  }
});

app.addEventListener('input', (e) => {
  if (!e.target.matches('.answer') || locked()) return;
  draft[e.target.dataset.q] = e.target.value;
  changed(800);
});

function changed(delay) {
  lastChange = be.now();
  store.setItem(draftKey(entryPart), JSON.stringify(draft));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushDraft, delay);
}

function cleanDraft() {
  const a = {};
  for (const [k, v] of Object.entries(draft)) if (v !== '' && v != null) a[k] = typeof v === 'string' ? v.trim().slice(0, 200) : v;
  return a;
}

// Tussentijds opslaan: ook niet-verstuurde antwoorden tellen mee (zonder snelheidsbonus).
function flushDraft() {
  clearTimeout(saveTimer);
  if (!lastChange || entry?.done || !entryPart) return;
  const a = cleanDraft();
  entry = { a, t: lastChange, done: false };
  be.set(`${base}/answers/${entryPart}/${teamId}`, entry);
  lastChange = 0;
}

function submit() {
  const qs = live.questions;
  const a = cleanDraft();
  const missing = qs.filter((q) => a[q.id] === undefined).length;
  if (missing === qs.length) return alert('Vul eerst een antwoord in.');
  if (missing && !confirm(`Je hebt ${missing} ${missing === 1 ? 'vraag' : 'vragen'} nog niet ingevuld. Toch inleveren?`)) return;
  clearTimeout(saveTimer);
  entry = { a, t: be.now(), done: true };
  be.set(`${base}/answers/${entryPart}/${teamId}`, entry);
  render();
}

setInterval(() => live?.phase === 'question' && render(), 250);
render();
