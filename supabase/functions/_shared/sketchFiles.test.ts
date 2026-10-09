// Run:  node --experimental-strip-types supabase/functions/_shared/sketchFiles.test.ts
// (Not imported by any Edge Function, so it is never bundled or deployed.)
import { cleanAssetName, contentTypeForAsset, normalizeParts, validateSketchFiles } from './sketchFiles.ts';
const eq = (a: unknown, b: unknown, m: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('FAIL', m, JSON.stringify(a), '!=', JSON.stringify(b)); process.exitCode = 1; } else console.log('ok  ', m); };
eq(cleanAssetName('Casino Table.jpg'), 'Casino Table.jpg', 'spaces ok');
eq(cleanAssetName('C:\\fakepath\\turtle.PNG'), 'turtle.PNG', 'strips path');
eq(cleanAssetName('../../etc/passwd'), null, 'traversal / no ext');
eq(cleanAssetName('evil.svg'), null, 'svg rejected');
eq(cleanAssetName('.hidden.png'), null, 'dotfile rejected');
eq(cleanAssetName('a<b>.png'), null, 'angle brackets rejected');
eq(cleanAssetName('x'.repeat(120) + '.png'), null, 'too long');
eq(cleanAssetName('font1.vlw'), 'font1.vlw', 'vlw ok');
eq(cleanAssetName('ship (2).png'), 'ship (2).png', 'parens ok');
eq(cleanAssetName('mario.mp3'), null, 'audio unsupported');
eq(contentTypeForAsset('a.JPEG'), 'image/jpeg', 'case-insensitive ext');
eq(validateSketchFiles([]), { error: 'There is no code to turn in.' }, 'empty');
eq(validateSketchFiles([{ filename: 'x', content: '   ' }]), { error: 'There is no code to turn in.' }, 'blank only');
eq(validateSketchFiles([{ filename: 'My Game.pde', content: 'void setup(){}' }]), { files: [{ filename: 'My_Game.pde', content: 'void setup(){}' }] }, 'name normalized');
eq(validateSketchFiles([{ filename: 'A', content: 'x' }, { filename: 'a.pde', content: 'y' }]), { error: 'Two tabs are both named a.pde.' }, 'dup tab (case-insens)');
eq((validateSketchFiles([{ filename: '9lives', content: 'x' }]) as any).files[0].filename, '_9lives.pde', 'leading digit');
eq(validateSketchFiles('nope' as any), { error: 'There is no code to turn in.' }, 'not an array');
eq((validateSketchFiles(Array.from({ length: 13 }, (_, i) => ({ filename: 't' + i, content: 'x' }))) as any).error, 'A sketch can have at most 12 tabs.', 'too many tabs');

// ---- programs
const ids = ['p1', 'p2'];
eq(validateSketchFiles([{ part: 'p2', filename: 'Sketch', content: 'b' }, { part: 'p1', filename: 'Sketch', content: 'a' }], ids),
  { files: [{ part: 'p1', filename: 'p1/Sketch.pde', content: 'a' }, { part: 'p2', filename: 'p2/Sketch.pde', content: 'b' }] }, 'same tab name in two programs, ordered by program');
eq(validateSketchFiles([{ filename: 'Sketch', content: 'a' }], ids), { error: 'One of the tabs belongs to a program that does not exist.' }, 'tab with no part rejected');
eq(validateSketchFiles([{ part: 'zzz', filename: 'Sketch', content: 'a' }], ids), { error: 'One of the tabs belongs to a program that does not exist.' }, 'unknown part rejected');
eq(validateSketchFiles([{ part: 'p1', filename: 'A', content: 'x' }, { part: 'p1', filename: 'a.pde', content: 'y' }], ids), { error: 'Two tabs are both named a.pde.' }, 'dup tab within one program');
eq(validateSketchFiles([{ part: 'p1', filename: 'Sketch', content: ' ' }, { part: 'p2', filename: 'Sketch', content: '' }], ids), { error: 'There is no code to turn in.' }, 'all blank');
eq(validateSketchFiles([{ part: 'p1', filename: 'Sketch', content: 'a' }], undefined), { files: [{ filename: 'Sketch.pde', content: 'a' }] }, 'a part field is ignored with no programs');
eq(validateSketchFiles([{ part: 'p1', filename: 'Sketch', content: 'a' }], []), { files: [{ filename: 'Sketch.pde', content: 'a' }] }, 'empty parts list = single program');
// ---- normalizeParts
eq(normalizeParts('x'), [], 'not an array');
eq(normalizeParts([{ id: 'keep_1', title: ' Ball ', description: 'd', points: '5' }]), [{ id: 'keep_1', title: 'Ball', description: 'd', points: 5 }], 'keeps a sound id, trims, numeric points');
const gen = normalizeParts([{ title: '' }, { id: 'bad id!', title: 'B', points: -2 }, { id: 'dup', title: 'C' }, { id: 'dup', title: 'D' }]);
eq(gen.map((p) => p.title), ['Program 1', 'B', 'C', 'D'], 'blank title defaulted');
eq(new Set(gen.map((p) => p.id)).size, 4, 'ids unique');
eq(gen[1].points, null, 'negative points dropped');
eq(normalizeParts(Array.from({ length: 40 }, (_, i) => ({ title: 't' + i }))).length, 30, 'capped at 30');
