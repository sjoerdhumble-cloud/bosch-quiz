export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function quizCode() {
  const raw = new URLSearchParams(location.search).get('quiz') || 'bosch';
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'bosch';
}

// Link voor spelers, met dezelfde quizcode (en testmodus) als de huidige pagina.
export function playerUrl(code) {
  const u = new URL('index.html', location.href);
  u.search = '';
  u.searchParams.set('quiz', code);
  if (new URLSearchParams(location.search).has('local')) u.searchParams.set('local', '');
  return u.toString().replace(/local=$/, 'local').replace(/local=&/, 'local&');
}

export function secondsLeft(live, now) {
  return Math.max(0, Math.ceil((live.endsAt - now) / 1000));
}

export function fmtTime(s) {
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}`;
}

export function timerHtml(live, now) {
  const left = secondsLeft(live, now);
  const frac = Math.max(0, Math.min(1, (live.endsAt - now) / (live.endsAt - live.startedAt)));
  return `<div class="timer ${left <= 10 ? 'urgent' : ''}">
    <div class="timer-bar"><span style="width:${(frac * 100).toFixed(1)}%"></span></div>
    <div class="timer-text">${left ? fmtTime(left) : 'Tijd is om'}</div>
  </div>`;
}

export function partLabel(live) {
  const of = live.partsInRound > 1 ? ` · vraag ${live.partNo} van ${live.partsInRound}` : '';
  return `${esc(live.roundName)}${of}`;
}

export function photoHtml(q) {
  return q.photo ? `<img class="photo" src="${esc(q.photo)}" alt="" loading="eager">` : '';
}

export function standingsHtml(list, { highlight, limit, final } = {}) {
  if (!list?.length) return '<p class="muted">Nog geen teams.</p>';
  const rows = (limit ? list.slice(0, limit) : list).map((r) => rowHtml(r, highlight));
  const me = highlight && list.find((r) => r.id === highlight);
  if (limit && me && list.indexOf(me) >= limit) rows.push('<li class="gap">…</li>', rowHtml(me, highlight));
  const podium = final ? podiumHtml(list) : '';
  return `${podium}<ol class="standings">${rows.join('')}</ol>`;
}

function rowHtml(r, highlight) {
  return `<li class="${r.id === highlight ? 'me' : ''}"><span class="rank">${r.rank}</span><span class="name">${esc(r.name)}</span><span class="score">${r.score}</span></li>`;
}

function podiumHtml(list) {
  const top = [2, 1, 3].map((rank) => list.filter((r) => r.rank === rank));
  return `<div class="podium">${top
    .map((rows, i) => `<div class="step step-${[2, 1, 3][i]}">
      <div class="names">${rows.map((r) => esc(r.name)).join('<br>') || '&nbsp;'}</div>
      <div class="block">${[2, 1, 3][i]}</div></div>`)
    .join('')}</div>`;
}
