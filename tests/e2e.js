// Speelt een volledige quiz na in testmodus: quizmaster + drie teams in één browser.
// Gebruik: npm run serve (in een ander venster), daarna npm run e2e
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8080';
const SHOTS = process.env.SHOTS || 'screenshots';
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
const open = async (path) => {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => { errors.push(`${path}: ${e.message}`); console.log('PAGEERROR', path, e.message); });
  p.on('dialog', (d) => d.accept());
  await p.goto(`${BASE}/${path}`);
  return p;
};
const shot = (p, name) => p.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const check = (cond, msg) => { if (!cond) throw new Error(msg); console.log('✓', msg); };

const host = await open('host.html?local&quiz=e2e');
await host.evaluate(() => localStorage.clear());
await host.reload();
await host.click('#setup summary');
await host.setInputFiles('#csv-file', 'voorbeeld-vragen.csv');
await host.waitForSelector('#setup-status.ok', { state: 'attached' });
check((await host.textContent('#setup-status')).includes('10 vragen'), 'vragen geladen uit CSV');

const players = [];
for (const name of ['Jan & Piet', 'Els', 'De Tappers']) {
  const p = await open('index.html?local&quiz=e2e');
  await p.fill('#name', name);
  await p.click('#join button');
  await p.waitForSelector('text=Welkom');
  players.push(p);
}
await shot(players[0], '01-speler-wachten');
await host.waitForSelector('text=3 teams aangemeld').catch(async (e) => { console.log(await host.textContent('#panel')); throw e; });
await shot(host, '02-quizmaster-aanmelden');
check(true, 'drie teams aangemeld');

// Ronde 1, vraag 1 (mc, goed = Hop)
await host.click('[data-act=start]');
for (const p of players) await p.waitForSelector('.option').catch(async (e) => { console.log('HOST', await host.textContent('#panel')); console.log('P', await p.textContent('body')); throw e; });
await shot(players[0], '03-speler-mc-vraag');
await players[0].click('.option:nth-child(2)');
await players[0].click('#submit');
await players[1].click('.option:nth-child(1)');
await players[1].click('#submit');
await players[2].click('.option:nth-child(2)'); // niet verstuurd: telt zonder bonus
await host.waitForSelector('.progress-count >> text=3');
await shot(host, '04-quizmaster-vraag');
await host.click('[data-act=close]');
await players[0].waitForSelector('.result.correct');
await players[2].waitForSelector('.result.correct');
await players[1].waitForSelector('.result.wrong');
await shot(players[0], '05-speler-uitslag');
check(true, 'meerkeuze: goed/fout correct en niet-verstuurd concept telt mee');

// Vraag 2 (open, 1516)
await host.click('text=Volgende vraag');
await players[0].waitForSelector('.answer');
await players[0].fill('.answer', '1516');
await players[0].click('#submit');
await players[1].fill('.answer', 'in 1516');
await players[1].click('#submit');
await players[2].fill('.answer', '1600');
await players[2].click('#submit');
await host.waitForSelector('text=Iedereen heeft ingeleverd');
await host.click('[data-act=close]');
await host.waitForSelector('.group.doubt');
await players[1].waitForSelector('.result.doubt');
await shot(host, '06-quizmaster-beoordelen');
await host.click('.group.doubt');
await players[1].waitForSelector('.result.correct');
check(true, 'twijfelgeval goedgekeurd door quizmaster');

// Vraag 3 en 4 snel door, laat tijd verlengen testen
await host.click('text=Volgende vraag');
await players[0].waitForSelector('.option');
await host.click('[data-act=extend]');
await host.click('[data-act=close]');
await host.click('text=Volgende vraag');
await players[0].waitForSelector('.answer');
await players[0].fill('.answer', 'india pail ale');
await players[0].click('#submit');
await host.click('[data-act=close]');
await host.click('text=Toon tussenstand');
for (const p of players) await p.waitForSelector('.standings');
await shot(players[1], '07-speler-tussenstand');
const top = await players[0].textContent('.standings li:first-child .name');
check(top === 'Jan & Piet', `Jan & Piet staat bovenaan (${top})`);

// Ronde 2: blok van 5 vragen
await host.click('[data-act=start]');
await players[0].waitForSelector('.qnum');
check((await players[0].locator('.question').count()) === 5, 'blok toont 5 vragen tegelijk');
await players[0].fill('.answer[data-q=r2q1]', 'gerst');
await players[0].fill('.answer[data-q=r2q2]', 'koolzuur');
await players[0].click('.option[data-q=r2q3][data-i="1"]');
await shot(players[0], '08-speler-blok');
await players[0].click('#submit');
await players[1].fill('.answer[data-q=r2q1]', 'gerst');
await host.click('[data-act=close]');
await players[1].waitForSelector('.result');
check((await players[1].locator('.result.correct').count()) === 1, 'concept in blok telt mee na sluiten');
await host.click('text=Toon tussenstand');
await host.click('[data-act=start]');
// Finale
await players[2].waitForSelector('.answer');
await players[2].fill('.answer', 'mout, hop, gist en water');
await players[2].click('#submit');
await host.click('[data-act=close]');
await host.waitForSelector('.group');
await host.click('.group');
await host.click('[data-act=photos]');
for (const p of players) await p.waitForSelector('.collage');
await players[0].waitForTimeout(2200);
await shot(players[0], '09a-speler-fotocollage');
await shot(host, '09b-quizmaster-fotocollage');
check((await players[0].locator('.polaroid img').count()) === 4, 'fotocollage op alle telefoons');
await host.click('[data-act=winner]');
for (const p of players) await p.waitForSelector('.winner-name');
await players[0].waitForTimeout(2800);
await shot(players[0], '09c-speler-winnaar');
await shot(host, '09d-quizmaster-winnaar');
check((await host.textContent('.winner-name')) === 'Jan & Piet', 'winnaar met vuurwerk en confetti');
await host.click('text=Toon eindstand');
for (const p of players) await p.waitForSelector('.podium');
await shot(players[2], '09-speler-eindstand');
await shot(host, '10-quizmaster-eindstand');
check(true, 'eindstand met podium op alle telefoons');

// Herladen behoudt team
await players[1].reload();
await players[1].waitForSelector('.podium');
check(true, 'speler blijft ingelogd na herladen');

check(errors.length === 0, `geen JavaScript-fouten${errors.length ? ': ' + errors.join('; ') : ''}`);
await browser.close();
