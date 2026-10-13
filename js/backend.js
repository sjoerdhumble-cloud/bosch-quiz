// Gedeelde database: Firebase Realtime Database, of een lokale variant voor testen
// (alle tabbladen in dezelfde browser delen dan de data; open de pagina met ?local).
import { firebaseConfig } from './firebase-config.js';

const FIREBASE_VERSION = '10.12.2';

export async function connect() {
  const params = new URLSearchParams(location.search);
  if (params.has('local') || !firebaseConfig.databaseURL) return localBackend();
  return firebaseBackend();
}

async function firebaseBackend() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fb = await import(`${base}/firebase-database.js`);
  const db = fb.getDatabase(initializeApp(firebaseConfig));
  const ref = (p) => fb.ref(db, p);
  let offset = 0;
  fb.onValue(ref('.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  // Schrijfacties wachten we niet af: zonder bereik zet Firebase ze in de wachtrij.
  const quiet = (p) => { p.catch((e) => console.error(e)); return p; };
  return {
    kind: 'firebase',
    get: async (p) => (await fb.get(ref(p))).val(),
    set: (p, v) => quiet(fb.set(ref(p), v)),
    update: (p, v) => quiet(fb.update(ref(p), v)),
    remove: (p) => quiet(fb.remove(ref(p))),
    on: (p, cb) => fb.onValue(ref(p), (s) => cb(s.val())),
    onConnected: (cb) => fb.onValue(ref('.info/connected'), (s) => cb(!!s.val())),
    now: () => Date.now() + offset,
  };
}

function localBackend() {
  const KEY = 'quiz-local-db';
  const channel = new BroadcastChannel(KEY);
  const listeners = new Set();
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
  let tree = load();

  const parts = (p) => p.split('/').filter(Boolean);
  const read = (p) => parts(p).reduce((node, k) => (node == null ? null : node[k] ?? null), tree);
  const check = (v) => {
    if (v === undefined) throw new Error('undefined mag niet in de database');
    if (v && typeof v === 'object') Object.values(v).forEach(check);
  };
  const prune = (v) => {
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        v[k] = prune(v[k]);
        if (v[k] === null) delete v[k];
      }
      if (!Object.keys(v).length) return null;
    }
    return v;
  };
  const write = (p, v) => {
    check(v);
    const ks = parts(p);
    if (!ks.length) { tree = prune(structuredClone(v)) || {}; return; }
    let node = tree;
    for (const k of ks.slice(0, -1)) {
      if (!node[k] || typeof node[k] !== 'object') node[k] = {};
      node = node[k];
    }
    node[ks.at(-1)] = v === null ? null : structuredClone(v);
    tree = prune(tree) || {};
  };
  const commit = () => {
    localStorage.setItem(KEY, JSON.stringify(tree));
    channel.postMessage('changed');
    notify();
  };
  const notify = () => {
    for (const l of listeners) {
      const json = JSON.stringify(read(l.path));
      if (json !== l.last) { l.last = json; l.cb(JSON.parse(json)); }
    }
  };
  const refresh = () => { tree = load(); notify(); };
  channel.onmessage = refresh;
  addEventListener('storage', (e) => { if (e.key === KEY) refresh(); });

  return {
    kind: 'local',
    get: async (p) => read(p),
    // Eerst opnieuw inlezen: andere tabbladen kunnen intussen geschreven hebben.
    set: async (p, v) => { tree = load(); write(p, v); commit(); },
    update: async (p, obj) => {
      tree = load();
      for (const [k, v] of Object.entries(obj)) write(`${p}/${k}`, v);
      commit();
    },
    remove: async (p) => { tree = load(); write(p, null); commit(); },
    on: (p, cb) => {
      const l = { path: p, cb, last: undefined };
      listeners.add(l);
      queueMicrotask(notify);
      return () => listeners.delete(l);
    },
    onConnected: (cb) => cb(true),
    now: () => Date.now(),
  };
}
