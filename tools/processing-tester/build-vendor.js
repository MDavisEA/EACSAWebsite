// Wraps vendor/processing.min.js in a JS string (vendor/processing-src.js) so the
// page can inject it into the sandboxed iframe even when opened from file://,
// where fetch() of local files is blocked.
// Run after updating vendor/processing.min.js:   node build-vendor.js
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/vendor/processing.min.js', 'utf8');
fs.writeFileSync(__dirname + '/vendor/processing-src.js', 'self.PJS_SRC = ' + JSON.stringify(src) + ';\n');
console.log('wrote vendor/processing-src.js (' + src.length + ' chars)');
