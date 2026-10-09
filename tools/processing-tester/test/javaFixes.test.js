// Run:  node test/javaFixes.test.js
const assert = require('assert');
const { preprocess } = require('../javaFixes.js');

let failed = 0;
function check(name, src, expected) {
  const { code } = preprocess(src);
  try {
    assert.strictEqual(code, expected);
    console.log('ok   ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name, '\n  got:     ' + JSON.stringify(code) + '\n  expected:' + JSON.stringify(expected));
  }
}
function unchanged(name, src) { check(name, src, src); }

// ---- integer division
check('int / int literal', 'int d = 1500 / 1000;', 'int d = int(1500 / 1000);');
check('int var / int', 'int a = 7; int q = a / 2;', 'int a = 7; int q = int(a / 2);');
check('float var / int is untouched', 'float f = 7; float g = f / 2;', 'float f = 7; float g = f / 2;');
check('int / float literal untouched', 'int a = 7; float g = a / 2.0;', 'int a = 7; float g = a / 2.0;');
check('float x = int/int truncates', 'float fd = 7 / 2;', 'float fd = int(7 / 2);');
check('width / 2', 'void setup(){ size(700,700); float x = width/2; }', 'void setup(){ size(700,700); float x = int(width/2); }');
check('chain a*b/c wraps whole chain', 'int a=3,b=4,c=5; int r = a*b/c;', 'int a=3,b=4,c=5; int r = int(a*b/c);');
check('chain a/b/c nests', 'int r = 100/7/2;', 'int r = int(int(100/7)/2);');
check('plus stops the chain', 'int a=3; int r = 1 + a / 2;', 'int a=3; int r = 1 + int(a / 2);');
check('parenthesised', 'int a=3; int r = (a + 1) / 2;', 'int a=3; int r = int((a + 1) / 2);');
check('string concat', 'int c=1500; text("$" + c/1000 + "k", 1, 1);', 'int c=1500; text("$" + int(c/1000) + "k", 1, 1);');
check('ternary with division', 'int p=1500; String s = (p < 1000 ? "" + p : p/1000 + "k");',
  'int p=1500; String s = (p < 1000 ? "" + p : int(p/1000) + "k");');
check('array element', 'int[] v = new int[3]; int r = v[1] / 2;', 'int[] v = new int[3]; int r = int(v[1] / 2);');
check('2d float array element untouched', 'float[][] e = new float[3][3]; float r = e[1][2] / 2;', 'float[][] e = new float[3][3]; float r = e[1][2] / 2;');
check('(float) cast left alone', 'int a=7; float r = (float)a / 2;', 'int a=7; float r = (float)a / 2;');
check('(int) cast then divide', 'float f=7.9; int r = (int)f / 2;', 'float f=7.9; int r = int((int)f / 2);');
check('dist() is float', 'float r = dist(1,2,3,4) / 2;', 'float r = dist(1,2,3,4) / 2;');
check('random() / int is float', 'float r = random(5) / 2;', 'float r = random(5) / 2;');
check('user fn returning int', 'int half(int n){ return n / 2; }', 'int half(int n){ return int(n / 2); }');
check('unknown stays untouched', 'Foo f; int r = f.size / 2;', 'Foo f; int r = f.size / 2;');
check('arr.length / 2', 'int[] a = new int[5]; int m = a.length / 2;', 'int[] a = new int[5]; int m = int(a.length / 2);');
check('min(int,int)/int', 'int m = min(3, 9) / 2;', 'int m = int(min(3, 9) / 2);');
check('min(int,float)/int untouched', 'float m = min(3, 9.5) / 2;', 'float m = min(3, 9.5) / 2;');
unchanged('comment slash', 'int a = 1; // 5 / 2 here\nint b = 2;');
unchanged('string slash', 'String s = "a / b"; int x = 3;');
check('shadowed type ambiguity -> untouched',
  'void a(){ int n = 5; } void b(){ float n = 5; float r = n / 2; }',
  'void a(){ int n = 5; } void b(){ float n = 5; float r = n / 2; }');

// ---- compound assignment
check('int *= float', 'int p = 225; void f(){ p *= 1.5; }', 'int p = 225; void f(){ p = int(p * (1.5)); }');
check('int += float', 'int p = 1; void f(){ p += 0.5; }', 'int p = 1; void f(){ p = int(p + (0.5)); }');
check('int /= int', 'int p = 9; void f(){ p /= 2; }', 'int p = 9; void f(){ p = int(p / (2)); }');
check('int *= int untouched', 'int p = 9; void f(){ p *= 2; }', 'int p = 9; void f(){ p *= 2; }');
check('float *= float untouched', 'float p = 9; void f(){ p *= 1.5; }', 'float p = 9; void f(){ p *= 1.5; }');
check('array elem compound', 'int[] h = new int[4]; void f(){ h[2] *= 1.5; }', 'int[] h = new int[4]; void f(){ h[2] = int(h[2] * (1.5)); }');
check('compound with division inside', 'int p = 9; void f(){ p /= 4 / 2; }', 'int p = 9; void f(){ p = int(p / (int(4 / 2))); }');

// ---- name collisions
check('field and method share a name',
  'int ball1 = 0;\nvoid ball1() { ball1++; }\nvoid draw() { ball1(); }',
  'int ball1 = 0;\nvoid ball1__fn() { ball1++; }\nvoid draw() { ball1__fn(); }');
unchanged('no collision', 'int a = 0;\nvoid go() { a++; }\nvoid draw() { go(); }');
unchanged('callbacks never renamed', 'boolean mousePressed;\nvoid mousePressed() { }');

// ---- imports
check('imports removed', 'import processing.sound.*;\nvoid setup(){}', '\nvoid setup(){}');


// ---- review findings
unchanged('class getter named like a local is NOT renamed',
  'class Stack { int size() { return 3; } }\nStack s;\nvoid setup(){ int size = s.size(); }');
unchanged('this.name() call blocks the rename',
  'int speed = 2;\nclass B { int speed() { return 1; } int go() { return this.speed(); } }');
unchanged('qualified call to a top-level-named method blocks the rename',
  'int count = 0;\nint count() { return 1; }\nvoid f(Foo o){ o.count(); }');
check('same-named methods with different return types are not truncated',
  'class C { float area(){ return 1.5; } void f(){ println(area()/2); } }\nclass R { int area(){ return 2; } void g(){ println(area()/2); } }',
  'class C { float area(){ return 1.5; } void f(){ println(area()/2); } }\nclass R { int area(){ return 2; } void g(){ println(area()/2); } }');
check('a single int method is still truncated',
  'int half(){ return 7; } void f(){ println(half()/2); }',
  'int half(){ return 7; } void f(){ println(int(half()/2)); }');

// ---- whitespace and comments survive
check('comments preserved', '// top\nint a = 5;\n/* c */ int b = a / 2; // end', '// top\nint a = 5;\n/* c */ int b = int(a / 2); // end');

console.log(failed ? '\n' + failed + ' FAILED' : '\nall passed');
process.exit(failed ? 1 : 0);
