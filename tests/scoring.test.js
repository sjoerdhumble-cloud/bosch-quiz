import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, matchOpen, evaluate, scorePart, computeStandings, speedBonus } from '../js/scoring.js';

test('normalize strips case, accents, punctuation and articles', () => {
  assert.equal(normalize('  De Tsjechië! '), 'tsjechie');
  assert.equal(normalize('Jan & Piet'), 'jan en piet');
  assert.equal(normalize('1,5'), '1.5');
});

test('open answers: exact, typo, doubt and wrong', () => {
  assert.equal(matchOpen('Gerst', ['gerst']), 'correct');
  assert.equal(matchOpen('gerts', ['gerst']), 'correct');
  assert.equal(matchOpen('India pail ale', ['India Pale Ale']), 'correct');
  assert.equal(matchOpen('heine ken', ['Heineken']), 'correct');
  assert.equal(matchOpen('tarwe', ['gerst']), 'wrong');
  assert.equal(matchOpen('', ['gerst']), 'wrong');
  assert.equal(matchOpen('wit', ['witbier', 'wit']), 'correct');
  assert.equal(matchOpen('ik denk koolzuur', ['koolzuur']), 'doubt');
});

test('numbers must match exactly', () => {
  assert.equal(matchOpen('1516', ['1516']), 'correct');
  assert.equal(matchOpen('1517', ['1516']), 'wrong');
  assert.equal(matchOpen('in 1516', ['1516']), 'doubt');
});

test('judgment overrides automatic result', () => {
  const q = { type: 'open', answer: 'gerst', alts: [] };
  assert.equal(evaluate(q, 'tarwe', true), 'correct');
  assert.equal(evaluate(q, 'gerst', false), 'wrong');
  assert.equal(evaluate({ type: 'mc', correct: 1 }, 1), 'correct');
  assert.equal(evaluate({ type: 'mc', correct: 1 }, 0), 'wrong');
});

const run = { startedAt: 0, endsAt: 60000, dur: 60 };
const questions = { a: { id: 'a', type: 'mc', correct: 0, points: 10 }, b: { id: 'b', type: 'open', answer: 'hop', points: 10 } };
const part = { qids: ['a', 'b'] };

test('speed bonus decreases over time', () => {
  assert.equal(speedBonus(10, run, 0), 5);
  assert.equal(speedBonus(10, run, 30000), 3);
  assert.equal(speedBonus(10, run, 60000), 0);
  assert.equal(speedBonus(10, run, 90000), 0);
});

test('scorePart: submitted gets bonus, drafts do not, late answers count zero', () => {
  const sub = scorePart({ part, questions, run, entry: { a: { a: 0, b: 'Hop' }, t: 0, done: true } });
  assert.equal(sub.points, 30);
  const draft = scorePart({ part, questions, run, entry: { a: { a: 0, b: 'Hop' }, t: 50000, done: false } });
  assert.equal(draft.points, 20);
  const late = scorePart({ part, questions, run: { ...run, closedAt: 20000 }, entry: { a: { a: 0 }, t: 40000, done: true } });
  assert.equal(late.points, 0);
});

test('computeStandings ranks with ties', () => {
  const db = {
    teams: { t1: { name: 'A' }, t2: { name: 'B' }, t3: { name: 'C' } },
    questions, parts: { p1: part }, partOrder: ['p1'], runs: { p1: run },
    answers: { p1: { t1: { a: { a: 0, b: 'hop' }, t: 60000, done: true }, t2: { a: { a: 0, b: 'hop' }, t: 60000, done: true }, t3: { a: { a: 1 }, t: 1000, done: true } } },
    judgments: {},
  };
  const list = computeStandings(db);
  assert.deepEqual(list.map((r) => [r.name, r.score, r.rank]), [['A', 20, 1], ['B', 20, 1], ['C', 0, 3]]);
});
