// Run:  node src/lib/processing/programs.test.js
import { partIdOf, baseName, groupFilesByPart, partsTotalPoints, sumPartScores } from './programs.js';

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
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
