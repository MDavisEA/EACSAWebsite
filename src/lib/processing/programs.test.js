// Run:  node src/lib/processing/programs.test.js
import { partIdOf, baseName, groupFilesByPart, partsTotalPoints, sumPartScores, scoreItems, itemsTotalPoints } from './programs.js';

let failed = 0;
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) { failed++; console.log('FAIL', m, JSON.stringify(a)); } else console.log('ok   ', m);
};
const parts = [{ id: 'p1', title: 'Ball', points: 5 }, { id: 'p2', title: 'Paddle', points: 3 }];
const files = [{ part: 'p2', filename: 'p2/Sketch.pde' }, { part: 'p1', filename: 'p1/Sketch.pde' }, { part: 'p1', filename: 'p1/Util.pde' }, { filename: 'old/x.pde' }];
eq(groupFilesByPart(files, parts).map((g) => [g.title, g.files.length]), [['Ball', 2], ['Paddle', 1], ['Removed program', 1]], 'grouped in the teacher order; a removed program is kept');
eq(groupFilesByPart([{ filename: 'Sketch.pde' }], []).map((g) => [g.title, g.files.length]), [['', 1]], 'a single-program sketch is one untitled group');
eq(groupFilesByPart([{ filename: 'Sketch.pde' }], parts).map((g) => g.title), ['Code'], 'code from before programs existed is labelled Code');
eq(partIdOf({ filename: 'p1/A.pde' }), 'p1', 'program id from the path');
eq(partIdOf({ filename: 'A.pde' }), null, 'no program id on a plain name');
eq(baseName('p1/Sketch.pde'), 'Sketch.pde', 'basename drops the program');
eq(baseName('Sketch.pde'), 'Sketch.pde', 'basename of a plain name');
eq(partsTotalPoints(parts), 8, 'total points');
eq(partsTotalPoints([{ points: 2 }, { points: null }]), null, 'a partial total is not shown');
eq(sumPartScores({ a: '2', b: '', c: '1.5' }), 3.5, 'scores are summed, blanks skipped');
eq(sumPartScores({ a: '' }), null, 'no scores entered is no total');
const proj = {
  questions: [{ id: 'q1', prompt: 'What does setup do?', points: 2 }, { id: 'q2', prompt: 'x'.repeat(80), points: 3 }],
  parts: [{ id: 'p1', title: 'Ball', points: 5 }, { id: 'p9', title: 'Paint', points: 4, optional: true }],
};
const items = scoreItems(proj);
eq(items.map((i) => i.id), ['q1', 'q2', 'p1', 'p9'], 'questions come first, then programs');
eq(items[0].label, 'Q1. What does setup do?', 'question label');
eq(items[1].label.length <= 52, true, 'a long question is shortened');
eq(items[3].label, '2. Paint (bonus)', 'a bonus program says so');
eq(itemsTotalPoints(items), 10, 'a bonus is not part of the total (2+3+5)');
eq(itemsTotalPoints(scoreItems({ questions: [{ id: 'q', prompt: 'a', points: null }], parts: [] })), null, 'a question with no points = no total');
eq(itemsTotalPoints(scoreItems({ parts: [{ id: 'b', title: 'B', points: 3, optional: true }] })), null, 'only bonuses = no total');
eq(scoreItems({}), [], 'nothing to score');
const single = scoreItems({ points_possible: 6, questions: [{ id: 'q1', prompt: 'a', points: 4 }], parts: [] });
eq(single.map((i) => [i.id, i.points]), [['q1', 4], ['main', 6]], 'a single program with questions gets its own score slot');
eq(itemsTotalPoints(single), 10, 'questions + the program total');
eq(scoreItems({ points_possible: 6, parts: [] }), [], 'no questions and no programs: the plain single score, as before');
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
