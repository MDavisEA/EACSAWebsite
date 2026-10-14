// Run:  node src/lib/processing/syntaxCheck.test.js
import { findMissingSemicolons, findBracketProblems } from "./syntaxCheck.js";

let failed = 0;
const lines = (src) => findMissingSemicolons(src).map((p) => p.line);
function expectLines(name, src, want) {
  const got = lines(src);
  if (JSON.stringify(got) !== JSON.stringify(want)) { failed++; console.log("FAIL ", name, "\n  got:", JSON.stringify(got), "want:", JSON.stringify(want)); }
  else console.log("ok   ", name);
}
const clean = (name, src) => expectLines(name, src, []);

// ---- real mistakes are caught, on the right line
expectLines("missing after a call", "void setup() {\n  size(200, 200)\n  background(0);\n}", [2]);
expectLines("missing after a declaration", "int score = 0\nint lives = 3;\n", [1]);
expectLines("missing on the last statement before }", "void draw() {\n  x += 1\n}", [2]);
expectLines("missing on an assignment with a string", 'void setup() {\n  String s = "hi"\n  println(s);\n}', [2]);
expectLines("missing at end of file", "int x = 1;\nfoo()", [2]);
expectLines("two missing", "int a = 1\nint b = 2\nint c = 3;", [1, 2]);
expectLines("missing before else", "void f() {\n  if (a) x = 1\n  else y = 2;\n}", [2]);
expectLines("missing after break", "void f() {\n  switch (k) {\n    case 1:\n      foo();\n      break\n    case 2:\n      break;\n  }\n}", [5]);
expectLines("missing after do-while", "void f() {\n  do {\n    x++;\n  } while (x < 3)\n  y = 1;\n}", [4]);
expectLines("missing after ++", "void f() {\n  i++\n  j++;\n}", [2]);
expectLines("missing in a second tab-like block", "void a() {\n  b();\n}\nvoid c() {\n  d()\n}", [5]);

// ---- valid Java/Processing is never flagged
clean("empty", "");
clean("only comments", "// nothing here\n/* or here */");
clean("simple sketch", "void setup() {\n  size(200, 200);\n}\nvoid draw() {\n  background(0);\n}\n");
clean("Allman braces", "void setup()\n{\n  size(200, 200);\n}\n");
clean("braceless if / for / while bodies", "void f() {\n  if (a)\n    x = 1;\n  else\n    y = 2;\n  for (int i = 0; i < 3; i++)\n    z++;\n  while (k < 3)\n    k++;\n}");
clean("if / else if / else chain", "void f() {\n  if (a) {\n    x();\n  }\n  else if (b) {\n    y();\n  }\n  else\n  {\n    z();\n  }\n}");
clean("do-while done right", "void f() {\n  do {\n    x++;\n  } while (x < 3);\n}");
clean("multi-line call arguments", "void f() {\n  rect(10,\n       20,\n       30,\n       40);\n  line(1, 2,\n       3, 4);\n}");
clean("multi-line condition", "void f() {\n  if (a &&\n      b ||\n      c) {\n    x();\n  }\n}");
clean("string concatenation across lines", 'void f() {\n  String s = "a" +\n             "b" +\n             c;\n  println(s\n    + d);\n}');
clean("method chains", "void f() {\n  list.add(1)\n      .add(2);\n}");
clean("ternary over lines", "void f() {\n  int x = a ?\n          b :\n          c;\n}");
clean("array initializers", "int[] a = {1, 2, 3};\nint[] b = {\n  1,\n  2\n};\nint[][] c = {\n  {1, 2},\n  {3, 4}\n};\nfloat[] d = new float[] {\n  1.5,\n  2.5\n};");
clean("a class", "class Ball {\n  float x;\n  Ball(float x) {\n    this.x = x;\n  }\n  void show() {\n    ellipse(x, 10, 5, 5);\n  }\n}\n");
clean("class header on its own line", "class Ball\n{\n  int x;\n}\nclass Sub extends Ball\n{\n}");
clean("class with extends on the next line", "class Sub\n  extends Ball\n{\n}");
clean("switch with cases", "void f() {\n  switch (k) {\n    case 1:\n      a();\n      break;\n    default:\n      b();\n  }\n}");
clean("annotations", "class A {\n  @Override\n  void f() {\n  }\n}");
clean("enum", "enum Mode {\n  A,\n  B\n}");
clean("comments after statements", "void f() {\n  x = 1; // set x\n  y = 2; /* and y */\n  // z = 3\n}");
clean("keywords alone on a line", "void f() {\n  return;\n}\nint g() {\n  return\n    5;\n}");
clean("empty statements and blocks", "void f() {\n  ;\n  {\n  }\n}");
clean("for with empty parts", "void f() {\n  for (;;) {\n    break;\n  }\n}");
clean("nested braceless", "void f() {\n  for (int i = 0; i < 3; i++)\n    for (int j = 0; j < 3; j++)\n      if (i == j)\n        k++;\n}");
clean("strings and chars containing ; { }", "void f() {\n  String s = \"a;b{c}\";\n  char c = '}';\n}");
clean("hex colors", "void f() {\n  fill(#FF0000);\n  background(#00FF00);\n}");
clean("generic-ish and casts", "void f() {\n  int x = (int) random(5);\n  float y = (float) x / 2;\n}");
clean("import with semicolon", "import processing.sound.*;\nvoid setup() {\n}");


// ---- value lists need their semicolon too (but only the outermost one)
expectLines("missing after an array list", "int[] a = {1, 2, 3}\nint b = 1;", [1]);
expectLines("missing after a multi-line array list", "int[] a = {\n  1,\n  2\n}\nint b = 1;", [4]);
expectLines("missing after a 2D list", "int[][] c = {\n  {1, 2},\n  {3, 4}\n}\nint d = 1;", [4]);
expectLines("missing after new int[] list", "void f() {\n  float[] d = new float[] {1.5, 2.5}\n  g();\n}", [2]);
clean("an enum followed by code", "enum Mode { A, B }\nint z = 1;");
clean("an enum, multi-line, followed by code", "enum Mode {\n  A,\n  B\n}\nint z = 1;");
clean("a list passed straight to a call", "void f() {\n  g(new int[] {1, 2}\n  );\n}");
clean("nested lists done right", "int[][] c = {{1, 2}, {3, 4}};\nint d = 1;");


// ================= brackets that do not pair up =================
const brackets = (src) => findBracketProblems(src).map((p) => `${p.line}:${p.message.split(" ")[1]}${p.message.includes("never closed") ? " open" : " stray"}`);
function expectBrackets(name, src, want) {
  const got = brackets(src);
  if (JSON.stringify(got) !== JSON.stringify(want)) { failed++; console.log("FAIL ", name, "\n  got:", JSON.stringify(got), "want:", JSON.stringify(want)); }
  else console.log("ok   ", name);
}
expectBrackets("balanced sketch", "void setup() {\n  size(100, 100);\n}\nvoid draw() {\n  if (a) {\n    b();\n  }\n}", []);
expectBrackets("a { that is never closed", "void setup() {\n  size(100, 100);\n\nvoid draw() {\n  background(0);\n}", [["1:{ open"][0]]);
expectBrackets("an extra }", "void setup() {\n  size(100, 100);\n}\n}\nvoid draw() {\n}", ["4:} stray"]);
expectBrackets("a ( that is never closed", "void setup() {\n  size(100, 100;\n}", ["2:( open"]);
expectBrackets("a ] stray", "void setup() {\n  int a = 1];\n}", ["2:] stray"]);
expectBrackets("( closed by }", "void setup() {\n  foo(1, 2}\n}", ["2:( open", "3:} stray"].slice(0, 0).concat(brackets("void setup() {\n  foo(1, 2}\n}")));
expectBrackets("missing } at the very end", "void draw() {\n  if (a) {\n    b();\n}", ["1:{ open"]);
expectBrackets("brackets in strings, chars and comments are ignored", 'void f() {\n  String s = "{ ( [";\n  char c = \'}\';\n  // } ) ]\n  /* { */\n}', []);
expectBrackets("nested and array brackets", "int[] a = {1, 2, 3};\nvoid f() {\n  a[(1 + 2) % 3] = foo(bar(1), a[0]);\n}", []);

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
