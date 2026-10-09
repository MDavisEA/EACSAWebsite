// Run: node test/zip.test.js   (needs the `unzip` command to verify the archive)
const fs = require('fs'); const os = require('os'); const path = require('path'); const cp = require('child_process');
const { buildZip } = require('../zip.js');
const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001', 'hex');
const zip = buildZip([
  { path: 'My Game/My Game.pde', data: new TextEncoder().encode('void setup() { size(200, 200); }\n') },
  { path: 'My Game/data/ship one.png', data: new Uint8Array(png) },
]);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pjzip-'));
const f = path.join(dir, 'out.zip'); fs.writeFileSync(f, zip);
const t = cp.spawnSync('unzip', ['-t', f], { encoding: 'utf8' });
console.log(t.stdout.trim().split('\n').slice(-4).join('\n'));
if (t.status !== 0) { console.log('FAIL'); process.exit(1); }
const x = cp.spawnSync('unzip', ['-p', f, 'My Game/My Game.pde'], { encoding: 'utf8' });
if (x.stdout !== 'void setup() { size(200, 200); }\n') { console.log('FAIL content'); process.exit(1); }
console.log('zip ok'); fs.rmSync(dir, { recursive: true });
