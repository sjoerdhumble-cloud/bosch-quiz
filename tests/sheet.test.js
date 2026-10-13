import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, buildQuiz, sheetCsvUrl, imageUrl } from '../js/sheet.js';

test('example sheet loads without errors', () => {
  const { quiz, errors } = buildQuiz(parseCSV(readFileSync(new URL('../voorbeeld-vragen.csv', import.meta.url), 'utf8')));
  assert.deepEqual(errors, []);
  assert.equal(Object.keys(quiz.questions).length, 10);
  // Ronde 2 is één blok van 5 vragen.
  assert.equal(quiz.partOrder.length, 6);
  const block = quiz.parts[quiz.partOrder[4]];
  assert.equal(block.qids.length, 5);
  assert.equal(block.seconds, 150);
  assert.equal(quiz.rounds[2].name, 'Snelle vijf');
  assert.equal(quiz.questions.r1q1.correct, 1);
  assert.equal(quiz.questions.r1q3.correct, 1);
});

test('semicolon CSV and errors with line numbers', () => {
  const { errors } = buildQuiz(parseCSV('ronde;vraag;opties;antwoord\n1;Vraag?;A|B;C\nx;Nog een;;ja\n'));
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Regel 2/);
  assert.match(errors[1], /Regel 3/);
});

test('sheet and drive links are converted', () => {
  assert.equal(sheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_1/edit#gid=42'), 'https://docs.google.com/spreadsheets/d/abc_1/gviz/tq?tqx=out:csv&headers=1&gid=42');
  assert.match(sheetCsvUrl('https://docs.google.com/spreadsheets/d/e/XYZ/pubhtml'), /output=csv/);
  assert.equal(imageUrl('https://drive.google.com/file/d/FILE123/view?usp=sharing'), 'https://lh3.googleusercontent.com/d/FILE123');
});
