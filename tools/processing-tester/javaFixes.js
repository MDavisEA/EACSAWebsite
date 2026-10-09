/*
 * javaFixes.js - source-to-source fixes that make Processing (Java) sketches
 * behave the way they do in real Processing when run by Processing.js, which
 * translates Java to JavaScript and so inherits JavaScript's semantics.
 *
 * Pure text in, text out - no DOM - so it also runs under node (see
 * test/javaFixes.test.js).
 *
 * What it fixes:
 *   1. Integer division and int compound assignment.
 *        int a = 1500 / 1000;   Java 1      JS 1.5   -> int(1500 / 1000)
 *        int p = 225; p *= 1.5; Java 337    JS 337.5 -> p = int(p * (1.5))
 *      Only rewritten when the operand types are known for certain, so an
 *      unrecognized expression is left alone rather than risk breaking it.
 *   2. A method and a variable sharing one name (legal Java, a crash in JS):
 *        int ball1 = 0;  void ball1() {...}   -> method becomes ball1__fn
 *   3. import lines (Processing.js cannot load Processing libraries).
 *
 * Everything is heuristic: this is a tokenizer plus an expression-span
 * scanner, not a full Java parser. `notes` reports what was changed so a
 * teacher can see exactly why a sketch was adjusted.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JavaFixes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PRIMS = new Set(['int', 'float', 'double', 'long', 'short', 'byte', 'char', 'boolean']);
  const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'char', 'color']);
  const FLOAT_TYPES = new Set(['float', 'double']);
  const NOT_CALLEE = new Set(['if', 'while', 'for', 'switch', 'return', 'else', 'case', 'catch', 'new', 'do', 'throw']);
  // Processing callbacks / entry points: never rename these.
  const PROTECTED_NAMES = new Set([
    'setup', 'draw', 'settings', 'mousePressed', 'mouseReleased', 'mouseClicked', 'mouseMoved',
    'mouseDragged', 'mouseWheel', 'keyPressed', 'keyReleased', 'keyTyped', 'exit',
  ]);

  const BUILTIN_INT_VARS = new Set(['width', 'height', 'mouseX', 'mouseY', 'pmouseX', 'pmouseY',
    'frameCount', 'keyCode', 'mouseButton', 'key']);
  const BUILTIN_FLOAT_VARS = new Set(['frameRate', 'PI', 'TWO_PI', 'HALF_PI', 'QUARTER_PI', 'TAU']);
  const BUILTIN_INT_FUNCS = new Set(['int', 'round', 'floor', 'ceil', 'millis', 'second', 'minute',
    'hour', 'day', 'month', 'year', 'color', 'red', 'green', 'blue', 'alpha', 'ord', 'parseInt']);
  const BUILTIN_FLOAT_FUNCS = new Set(['float', 'random', 'randomGaussian', 'dist', 'sqrt', 'sin', 'cos',
    'tan', 'asin', 'acos', 'atan', 'atan2', 'pow', 'map', 'lerp', 'noise', 'radians', 'degrees', 'log',
    'exp', 'norm', 'mag', 'textWidth', 'parseFloat']);
  const BUILTIN_ARG_FUNCS = new Set(['min', 'max', 'abs', 'constrain', 'sq']);
  const INT_METHODS = new Set(['length', 'size', 'indexOf', 'lastIndexOf', 'charAt', 'compareTo', 'hashCode']);

  const OPS = ['>>>=', '<<=', '>>=', '>>>', '...', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
    '==', '!=', '<=', '>=', '&&', '||', '<<', '>>'];

  // ---------------------------------------------------------------- tokenizer
  function tokenize(src) {
    const toks = [];
    const n = src.length;
    let i = 0;
    let pre = '';
    while (i < n) {
      const c = src[i];
      if (/\s/.test(c)) {
        let j = i;
        while (j < n && /\s/.test(src[j])) j++;
        pre += src.slice(i, j); i = j; continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        let j = i; while (j < n && src[j] !== '\n') j++;
        pre += src.slice(i, j); i = j; continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2;
        pre += src.slice(i, j); i = j; continue;
      }
      let t, s;
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
        j = Math.min(n, j + 1);
        t = c === '"' ? 'str' : 'chr'; s = src.slice(i, j); i = j;
      } else if (c === '#' && /^#[0-9a-fA-F]{6,8}\b/.test(src.slice(i, i + 10))) {
        s = src.slice(i).match(/^#[0-9a-fA-F]{6,8}/)[0]; t = 'num'; i += s.length;
      } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = src.slice(i).match(/^(0[xX][0-9a-fA-F]+[lL]?|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[fFdDlL]?)/);
        s = m[0]; t = 'num'; i += s.length;
      } else if (/[A-Za-z_$]/.test(c)) {
        let j = i; while (j < n && /[\w$]/.test(src[j])) j++;
        s = src.slice(i, j); t = 'id'; i = j;
      } else {
        s = OPS.find((o) => src.startsWith(o, i)) || c; t = 'op'; i += s.length;
      }
      toks.push({ t, s, pre });
      pre = '';
    }
    return { toks, trailing: pre };
  }

  function matchBrackets(toks) {
    const closeOf = {}; const openOf = {}; const stack = [];
    toks.forEach((tk, i) => {
      if (tk.t !== 'op') return;
      if (tk.s === '(' || tk.s === '[' || tk.s === '{') stack.push(i);
      else if (tk.s === ')' || tk.s === ']' || tk.s === '}') {
        const o = stack.pop();
        if (o !== undefined) { closeOf[o] = i; openOf[i] = o; }
      }
    });
    return { closeOf, openOf };
  }

  // ---------------------------------------------------------------- helpers
  const isOp = (tk, s) => tk && tk.t === 'op' && tk.s === s;
  const isTypeWord = (tk) => tk && tk.t === 'id' && (PRIMS.has(tk.s) || tk.s === 'color' || tk.s === 'void'
    || /^[A-Z]/.test(tk.s));
  const isOperandEnd = (tk) => tk && (tk.t === 'id' || tk.t === 'num' || tk.t === 'str' || tk.t === 'chr'
    || isOp(tk, ')') || isOp(tk, ']') || isOp(tk, '++') || isOp(tk, '--'));

  // ---------------------------------------------------------------- declarations
  /** Walk the tokens once, recording every `Type name` declaration. */
  function collectDeclarations(toks, closeOf) {
    const vars = new Map();    // name -> Set of base types
    const funcs = new Map();   // name -> Set of return types (two classes can each declare area())
    const funcDeclIdx = [];    // token indexes of method-name tokens
    const addVar = (name, type) => {
      if (!vars.has(name)) vars.set(name, new Set());
      vars.get(name).add(type);
    };
    for (let i = 0; i < toks.length - 1; i++) {
      const tk = toks[i];
      if (!isTypeWord(tk)) continue;
      const prev = toks[i - 1];
      if (prev && (isOp(prev, '.') || (prev.t === 'id' && (prev.s === 'new' || prev.s === 'return')))) continue;
      let j = i + 1;
      while (isOp(toks[j], '[') && isOp(toks[j + 1], ']')) j += 2;      // int[] / float[][]
      const nameTok = toks[j];
      if (!nameTok || nameTok.t !== 'id' || NOT_CALLEE.has(nameTok.s)) continue;
      const after = toks[j + 1];
      const base = tk.s;
      if (isOp(after, '(')) {
        // method declaration only if the parenthesis is followed by a body
        const close = closeOf[j + 1];
        const nxt = close === undefined ? null : toks[close + 1];
        if (nxt && (isOp(nxt, '{') || (nxt.t === 'id' && nxt.s === 'throws'))) {
          if (!funcs.has(nameTok.s)) funcs.set(nameTok.s, new Set());
          funcs.get(nameTok.s).add(base);
          funcDeclIdx.push(j);
        }
        continue;
      }
      if (after && after.t === 'op' && ['=', ';', ',', ')', '[', ':'].includes(after.s)) {
        addVar(nameTok.s, base);
        // further declarators:  int a = 1, b, c = 3;
        let depth = 0;
        for (let k = j + 1; k < toks.length; k++) {
          const q = toks[k];
          if (q.t === 'op') {
            if (q.s === '(' || q.s === '[' || q.s === '{') depth++;
            else if (q.s === ')' || q.s === ']' || q.s === '}') { if (depth === 0) break; depth--; }
            else if (q.s === ';' && depth === 0) break;
            else if (q.s === ',' && depth === 0) {
              const nm = toks[k + 1]; const nx = toks[k + 2];
              if (nm && nm.t === 'id' && nx && nx.t === 'op' && ['=', ';', ',', '['].includes(nx.s)) addVar(nm.s, base);
              else break; // a parameter list: next token is a new type word
            }
          }
        }
      }
    }
    return { vars, funcs, funcDeclIdx };
  }

  function classify(base) {
    if (INT_TYPES.has(base)) return 'int';
    if (FLOAT_TYPES.has(base)) return 'float';
    return '?';
  }

  // ---------------------------------------------------------------- name collisions
  function renameCollisions(toks, closeOf, notes) {
    const { vars, funcs, funcDeclIdx } = collectDeclarations(toks, closeOf);

    // Brace depth of every token, so a sketch-level function can be told apart
    // from a method inside a class.
    const depth = new Array(toks.length);
    let d = 0;
    toks.forEach((tk, i) => {
      if (isOp(tk, '}')) d = Math.max(0, d - 1);
      depth[i] = d;
      if (isOp(tk, '{')) d++;
    });
    const topLevelMethods = new Set(funcDeclIdx.filter((i) => depth[i] === 0).map((i) => toks[i].s));
    const classMethods = new Set(funcDeclIdx.filter((i) => depth[i] > 0).map((i) => toks[i].s));
    const qualifiedCalls = new Set();
    toks.forEach((tk, i) => {
      if (tk.t === 'id' && isOp(toks[i - 1], '.') && isOp(toks[i + 1], '(')) qualifiedCalls.add(tk.s);
    });

    // A sketch-level function that shares its name with a variable is legal Java
    // but a crash in JavaScript (one name space, two things). Rename the FUNCTION
    // - and only when that is provably safe: every call to it is unqualified
    // (`name(...)`, never `obj.name(...)`), and no class declares a method of the
    // same name whose own unqualified calls would be swept up in the rename.
    // Anything less certain is left alone rather than risk breaking valid code.
    const clash = [...topLevelMethods].filter(
      (f) => funcs.has(f) && vars.has(f) && !PROTECTED_NAMES.has(f) && !classMethods.has(f) && !qualifiedCalls.has(f)
    );
    if (!clash.length) return;
    const set = new Set(clash);
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t === 'id' && set.has(tk.s) && isOp(toks[i + 1], '(') && !isOp(toks[i - 1], '.')) tk.s += '__fn';
    }
    notes.push('A variable and a method share the name ' + clash.map((c) => c + '()').join(', ')
      + ' (legal in Java, not in JavaScript) - renamed the method(s) behind the scenes.');
  }

  // ---------------------------------------------------------------- expression spans
  function makeAnalyzer(toks, closeOf, openOf, vars, funcs) {
    const symType = (name) => {
      const set = vars.get(name);
      if (set) {
        const kinds = new Set([...set].map(classify));
        return kinds.size === 1 ? [...kinds][0] : '?';
      }
      if (BUILTIN_INT_VARS.has(name)) return 'int';
      if (BUILTIN_FLOAT_VARS.has(name)) return 'float';
      return '?';
    };
    const funcType = (name) => {
      if (funcs.has(name)) {
        // Same method name declared with different return types (say area() in
        // two different classes): which one a call means is unknowable here.
        const kinds = new Set([...funcs.get(name)].map(classify));
        return kinds.size === 1 ? [...kinds][0] : '?';
      }
      if (BUILTIN_INT_FUNCS.has(name)) return 'int';
      if (BUILTIN_FLOAT_FUNCS.has(name)) return 'float';
      return '?';
    };
    const join = (types) => {
      if (types.includes('float')) return 'float';
      if (types.includes('?')) return '?';
      return 'int';
    };

    const isCastAt = (i) => isOp(toks[i], '(') && toks[i + 1] && toks[i + 1].t === 'id'
      && PRIMS.has(toks[i + 1].s) && isOp(toks[i + 2], ')') && closeOf[i] === i + 2
      && toks[i + 3] && !(toks[i + 3].t === 'op' && !['(', '-', '+', '!', '~'].includes(toks[i + 3].s));

    // start index of the primary (name / literal / group, with calls, indexes, members) ending at e
    function primaryStart(e) {
      let i = e;
      for (let guard = 0; guard < 500; guard++) {
        const t = toks[i];
        if (!t) return null;
        if (isOp(t, '++') || isOp(t, '--')) { i--; continue; }
        if (isOp(t, ')') || isOp(t, ']')) {
          const o = openOf[i];
          if (o === undefined) return null;
          i = o;
          const p = toks[i - 1];
          if (p && ((p.t === 'id' && !NOT_CALLEE.has(p.s)) || isOp(p, ')') || isOp(p, ']'))) {
            i -= 1;
            if (toks[i].t !== 'id') continue; // another bracket group: loop
          } else return i;                   // bare parenthesised group
        } else if (!(t.t === 'id' || t.t === 'num' || t.t === 'str' || t.t === 'chr')) return null;
        const p = toks[i - 1];
        const pp = toks[i - 2];
        if (isOp(p, '.') && pp && (pp.t === 'id' || isOp(pp, ')') || isOp(pp, ']'))) { i -= 2; continue; }
        return i;
      }
      return null;
    }

    // full operand ending at e: primary plus any unary / cast prefix
    function operandStart(e) {
      let s = primaryStart(e);
      if (s === null) return null;
      for (;;) {
        const p = toks[s - 1];
        if (p && p.t === 'op' && ['-', '+', '!', '~'].includes(p.s) && !isOperandEnd(toks[s - 2])) { s -= 1; continue; }
        if (isOp(p, ')') && openOf[s - 1] === s - 3 && isCastAt(s - 3) && !isOperandEnd(toks[s - 4])) { s -= 3; continue; }
        return s;
      }
    }

    // start of the multiplicative chain (a * b % c) whose last operand ends at e
    function chainStart(e) {
      let s = operandStart(e);
      while (s !== null) {
        const p = toks[s - 1];
        if (p && p.t === 'op' && ['*', '/', '%'].includes(p.s)) {
          const prevEnd = s - 2;
          const ps = operandStart(prevEnd);
          if (ps === null) return s;
          s = ps;
        } else break;
      }
      return s;
    }

    // end index of the single operand beginning at i
    function operandEnd(i) {
      for (;;) {
        if (toks[i] && toks[i].t === 'op' && ['-', '+', '!', '~'].includes(toks[i].s)) { i++; continue; }
        if (isCastAt(i)) { i += 3; continue; }
        break;
      }
      let t = toks[i];
      if (!t) return null;
      let e;
      if (isOp(t, '(')) e = closeOf[i];
      else if (t.t === 'id' || t.t === 'num' || t.t === 'str' || t.t === 'chr') e = i;
      else return null;
      if (e === undefined) return null;
      for (;;) {
        const nx = toks[e + 1];
        if (isOp(nx, '(') && toks[e].t === 'id' && !NOT_CALLEE.has(toks[e].s)) { e = closeOf[e + 1]; if (e === undefined) return null; continue; }
        if (isOp(nx, '[')) { e = closeOf[e + 1]; if (e === undefined) return null; continue; }
        if (isOp(nx, '.') && toks[e + 2] && toks[e + 2].t === 'id') { e += 2; continue; }
        if (isOp(nx, '++') || isOp(nx, '--')) { e += 1; continue; }
        break;
      }
      return e;
    }

    // ---- typing
    function typeOfRange(a, b) {
      if (a > b) return '?';
      // ternary at depth 0 -> join of the two branches
      let q = -1; let c = -1;
      for (let i = a; i <= b; i++) {
        const tk = toks[i];
        if (tk.t === 'op' && (tk.s === '(' || tk.s === '[' || tk.s === '{')) { i = closeOf[i] === undefined ? b : closeOf[i]; continue; }
        if (isOp(tk, '?') && q < 0) q = i;
        else if (isOp(tk, ':') && q >= 0 && c < 0) c = i;
      }
      if (q >= 0 && c > q) return join([typeOfRange(q + 1, c - 1), typeOfRange(c + 1, b)]);
      // split on binary + - * / %
      const parts = []; let cur = a;
      for (let i = a; i <= b; i++) {
        const tk = toks[i];
        if (tk.t === 'op' && (tk.s === '(' || tk.s === '[' || tk.s === '{')) { i = closeOf[i] === undefined ? b : closeOf[i]; continue; }
        if (tk.t === 'op' && ['+', '-', '*', '/', '%'].includes(tk.s) && i > a && isOperandEnd(toks[i - 1])) {
          parts.push([cur, i - 1]); cur = i + 1;
        } else if (tk.t === 'op' && ['<', '>', '<=', '>=', '==', '!=', '&&', '||', '=', '&', '|', '^', '<<', '>>'].includes(tk.s)) {
          return '?';
        }
      }
      parts.push([cur, b]);
      return join(parts.map(([x, y]) => operandType(x, y)));
    }

    function operandType(a, b) {
      while (a <= b && toks[a].t === 'op' && ['-', '+', '~'].includes(toks[a].s)) a++;
      if (a > b) return '?';
      if (toks[a].t === 'op' && toks[a].s === '!') return '?';
      if (isCastAt(a)) return classify(toks[a + 1].s);
      const t = toks[a];
      if (isOp(t, '(')) {
        if (closeOf[a] === b) return typeOfRange(a + 1, b - 1);
        return '?';
      }
      if (a === b) {
        if (t.t === 'num') {
          if (/^(0[xX]|#)/.test(t.s)) return 'int';
          return /[.eEfFdD]/.test(t.s) ? 'float' : 'int';
        }
        if (t.t === 'chr') return 'int';
        if (t.t === 'id') return symType(t.s);
        return '?';
      }
      if (t.t !== 'id') return '?';
      // name followed by call / index / member chain
      let j = a + 1; let kind = 'var'; let lastMember = null; let isCall = false;
      let callArgs = null;
      while (j <= b) {
        const tk = toks[j];
        if (isOp(tk, '[')) { j = (closeOf[j] === undefined ? b : closeOf[j]) + 1; continue; }
        if (isOp(tk, '(')) { if (kind === 'var' && j === a + 1) { kind = 'call'; callArgs = [j + 1, closeOf[j] - 1]; } else isCall = true; j = (closeOf[j] === undefined ? b : closeOf[j]) + 1; continue; }
        if (isOp(tk, '.') && toks[j + 1] && toks[j + 1].t === 'id') { kind = 'member'; lastMember = toks[j + 1].s; isCall = false; j += 2; continue; }
        return '?';
      }
      if (kind === 'var') return symType(t.s);
      if (kind === 'call') {
        if (BUILTIN_ARG_FUNCS.has(t.s) && !funcs.has(t.s)) {
          const [x, y] = callArgs; const types = [];
          let st = x; let d = 0;
          for (let i = x; i <= y + 1; i++) {
            const tk = toks[i];
            if (i > y || (isOp(tk, ',') && d === 0)) { types.push(typeOfRange(st, i - 1)); st = i + 1; continue; }
            if (tk.t === 'op' && (tk.s === '(' || tk.s === '[')) d++;
            else if (tk.t === 'op' && (tk.s === ')' || tk.s === ']')) d--;
          }
          return types.length ? join(types) : '?';
        }
        return funcType(t.s);
      }
      // member chain
      if (!isCall && lastMember === 'length') return 'int';
      if (isCall && INT_METHODS.has(lastMember)) return 'int';
      return '?';
    }

    return { primaryStart, operandStart, chainStart, operandEnd, typeOfRange, operandType, symType };
  }

  // ---------------------------------------------------------------- main transform
  function textOf(toks, a, b) {
    let out = '';
    for (let i = a; i <= b; i++) out += (i === a ? '' : toks[i].pre) + toks[i].s;
    return out;
  }

  function fixIntegerMath(toks, closeOf, openOf, notes) {
    const { vars, funcs } = collectDeclarations(toks, closeOf);
    const an = makeAnalyzer(toks, closeOf, openOf, vars, funcs);
    const before = {}; const after = {}; // inserted text before / after token index
    const add = (map, i, s) => { map[i] = (map[i] || '') + s; };
    const replaced = {};
    let divs = 0; let compounds = 0;

    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i];
      if (tk.t !== 'op') continue;

      // ---- a / b where both sides are ints
      if (tk.s === '/') {
        if (!isOperandEnd(toks[i - 1])) continue;
        const ls = an.chainStart(i - 1);
        const re = an.operandEnd(i + 1);
        if (ls === null || re === null) continue;
        // right operand type: the operand itself (a cast or unary may precede it)
        const rType = an.typeOfRange(i + 1, re);
        // left chain type: everything before '/' in the chain
        const lType = an.typeOfRange(ls, i - 1);
        if (lType === 'int' && rType === 'int') {
          add(before, ls, 'int('); add(after, re, ')'); divs++;
        }
        continue;
      }

      // ---- int variable  op=  expression
      if (['+=', '-=', '*=', '/='].includes(tk.s)) {
        if (!isOperandEnd(toks[i - 1])) continue;
        const ls = an.primaryStart(i - 1);
        if (ls === null) continue;
        const lhs = textOf(toks, ls, i - 1);
        if (/\+\+|--|\(/.test(lhs)) continue;            // side effects / calls: leave alone
        if (an.typeOfRange(ls, i - 1) !== 'int') continue;
        // right-hand side: to the end of the statement
        let e = i + 1; let depth = 0;
        for (; e < toks.length; e++) {
          const q = toks[e];
          if (q.t === 'op') {
            if (q.s === '(' || q.s === '[' || q.s === '{') depth++;
            else if (q.s === ')' || q.s === ']' || q.s === '}') { if (depth === 0) break; depth--; }
            else if ((q.s === ';' || q.s === ',') && depth === 0) break;
          }
        }
        const rEnd = e - 1;
        if (rEnd <= i) continue;
        const rType = an.typeOfRange(i + 1, rEnd);
        const op = tk.s[0];
        const needs = op === '/' ? (rType === 'int' || rType === 'float') : rType === 'float';
        if (!needs) continue;
        replaced[i] = '= int(' + lhs + ' ' + op + ' (';
        add(after, rEnd, '))');
        compounds++;
      }
    }

    if (!divs && !compounds) return;
    // rebuild the token array so the caller can print it unchanged
    for (let i = 0; i < toks.length; i++) {
      if (replaced[i] !== undefined) { toks[i].s = replaced[i]; if (toks[i + 1]) toks[i + 1].pre = ''; }
      if (before[i]) toks[i].s = before[i] + toks[i].s;
      if (after[i]) toks[i].s = toks[i].s + after[i];
    }
    const bits = [];
    if (divs) bits.push(divs + ' integer division' + (divs > 1 ? 's' : ''));
    if (compounds) bits.push(compounds + ' int compound assignment' + (compounds > 1 ? 's' : ''));
    notes.push('Applied Java integer math to ' + bits.join(' and ') + '.');
  }

  function stripImports(src, notes) {
    const libs = [];
    const out = src.replace(/^[ \t]*import\s+([\w.*]+)\s*;[ \t]*$/gm, (m, lib) => {
      libs.push(lib); return '';
    });
    if (libs.length) notes.push('Ignored import ' + libs.join(', ') + ' - Processing libraries are not available here.');
    return { out, libs };
  }

  /** @returns {{code: string, notes: string[]}} */
  function preprocess(source) {
    const notes = [];
    const { out: noImports } = stripImports(source, notes);
    const { toks, trailing } = tokenize(noImports);
    const { closeOf, openOf } = matchBrackets(toks);
    renameCollisions(toks, closeOf, notes);
    fixIntegerMath(toks, closeOf, openOf, notes);
    const code = toks.map((tk) => tk.pre + tk.s).join('') + trailing;
    return { code, notes };
  }

  return { preprocess, tokenize };
});
