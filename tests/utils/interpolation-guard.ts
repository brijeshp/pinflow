import ts from 'typescript';

/**
 * Syntax-aware replacement for the regex structural export guard
 * (0.4.1 review #10 / post-merge F7). The regex recognised only dotted access
 * on seven hard-coded roots and silently skipped anything it could not parse —
 * six distinct green bypasses were demonstrated (aliases, destructuring,
 * `Math.` cloaks, `.length` cloaks, object-literal braces, nested templates).
 *
 * This walks the real TypeScript AST with the type checker and FAILS CLOSED:
 * every template interpolation must be provably safe, and anything the
 * classifier does not recognise is an offender. "Safe" means one of:
 *   - a literal, or an expression whose TYPE is numeric / boolean / a union of
 *     string literals (validated enums like status; numbers cannot inject);
 *   - a call to a named escaper (`inline`, `attr`, `quoted`);
 *   - a call to a module-local function whose every return is itself safe
 *     (computed as a fixpoint, so helpers may call each other);
 *   - structure over safe parts: templates, ternaries, `&&`/`||`/`??`/`+`,
 *     arrays, `Math.*`, element-preserving methods on safe receivers,
 *     `.map()` whose callback returns safe values, `.join()`/`.replace()`
 *     with safe content-contributing arguments;
 *   - a `const` whose initialiser is safe — and, for arrays, whose every
 *     `.push()`/`.unshift()` in the module pushes safe values (the mutation
 *     path a pure initialiser check would miss).
 * Aliases of untrusted fields, `let` reassignment, parameters of string type,
 * and destructured strings are all UNSAFE by construction.
 */

export interface GuardOptions {
  escapers: readonly string[];
  /** Functions whose interior templates are the trust boundary itself (the
   *  escapers), or reviewed non-markdown output (e.g. a filename builder). */
  exemptFunctions?: readonly string[];
}

const ELEMENT_PRESERVING = new Set([
  'sort',
  'filter',
  'slice',
  'reverse',
  'flat',
  'trim',
  'toLowerCase',
  'toUpperCase',
  'repeat',
]);
const CONTENT_ARGS = new Set(['join', 'replace', 'concat', 'padStart', 'padEnd']);

export function findUnescapedInterpolations(entryFile: string, options: GuardOptions): string[] {
  const program = ts.createProgram([entryFile], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: false,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const sf = program.getSourceFile(entryFile);
  if (!sf) throw new Error(`guard: cannot load ${entryFile}`);

  const escapers = new Set(options.escapers);
  const exempt = new Set([...options.escapers, ...(options.exemptFunctions ?? [])]);

  const fns = new Map<string, ts.FunctionDeclaration>();
  sf.forEachChild((n) => {
    if (ts.isFunctionDeclaration(n) && n.name) fns.set(n.name.text, n);
  });

  function collectReturns(fn: ts.Node, out: ts.Expression[]): void {
    const visit = (n: ts.Node): void => {
      if (ts.isReturnStatement(n)) {
        if (n.expression) out.push(n.expression);
        return;
      }
      if (ts.isFunctionLike(n)) return; // nested functions return elsewhere
      n.forEachChild(visit);
    };
    if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) out.push(fn.body);
    else (fn as ts.FunctionDeclaration).body?.forEachChild(visit);
  }

  function typeIsSafe(t: ts.Type): boolean {
    if (
      t.flags &
      (ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.Undefined |
        ts.TypeFlags.Null |
        ts.TypeFlags.StringLiteral)
    )
      return true;
    if (t.isUnion()) return t.types.every(typeIsSafe);
    return false;
  }

  const clean = new Set<string>();
  const classifying = new Set<ts.Symbol>();

  function safeCallback(a: ts.Expression): boolean {
    if (ts.isIdentifier(a)) return escapers.has(a.text) || clean.has(a.text);
    if (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) {
      const returns: ts.Expression[] = [];
      collectReturns(a, returns);
      return returns.length > 0 && returns.every(safe);
    }
    return false;
  }

  function pushesSafe(sym: ts.Symbol): boolean {
    let ok = true;
    const visit = (n: ts.Node): void => {
      if (
        ok &&
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        (n.expression.name.text === 'push' || n.expression.name.text === 'unshift') &&
        ts.isIdentifier(n.expression.expression) &&
        checker.getSymbolAtLocation(n.expression.expression) === sym
      ) {
        if (!n.arguments.every((a) => (ts.isSpreadElement(a) ? safe(a.expression) : safe(a))))
          ok = false;
      }
      n.forEachChild(visit);
    };
    sf!.forEachChild(visit);
    return ok;
  }

  function safeIdentifier(e: ts.Identifier): boolean {
    const sym = checker.getSymbolAtLocation(e);
    const decl = sym?.valueDeclaration;
    if (!sym || !decl || classifying.has(sym)) return false;
    if (
      ts.isVariableDeclaration(decl) &&
      decl.initializer &&
      ts.isVariableDeclarationList(decl.parent) &&
      decl.parent.flags & ts.NodeFlags.Const
    ) {
      classifying.add(sym);
      try {
        return safe(decl.initializer) && pushesSafe(sym);
      } finally {
        classifying.delete(sym);
      }
    }
    return false; // parameters, `let`, destructured bindings: unsafe
  }

  function safe(e: ts.Expression): boolean {
    if (ts.isStringLiteral(e) || ts.isNumericLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
      return true;
    if (typeIsSafe(checker.getTypeAtLocation(e))) return true;
    if (ts.isParenthesizedExpression(e)) return safe(e.expression);
    if (ts.isTemplateExpression(e)) return e.templateSpans.every((s) => safe(s.expression));
    if (ts.isConditionalExpression(e)) return safe(e.whenTrue) && safe(e.whenFalse);
    if (ts.isBinaryExpression(e)) {
      const k = e.operatorToken.kind;
      if (
        k === ts.SyntaxKind.AmpersandAmpersandToken ||
        k === ts.SyntaxKind.BarBarToken ||
        k === ts.SyntaxKind.QuestionQuestionToken ||
        k === ts.SyntaxKind.PlusToken
      )
        return safe(e.left) && safe(e.right);
      return false;
    }
    if (ts.isArrayLiteralExpression(e))
      return e.elements.every((el) => (ts.isSpreadElement(el) ? safe(el.expression) : safe(el)));
    if (ts.isCallExpression(e)) {
      const callee = e.expression;
      if (ts.isIdentifier(callee)) return escapers.has(callee.text) || clean.has(callee.text);
      if (ts.isPropertyAccessExpression(callee)) {
        const m = callee.name.text;
        const recv = callee.expression;
        if (ts.isIdentifier(recv) && recv.text === 'Math') return e.arguments.every(safe);
        if (m === 'map') return e.arguments.length > 0 && e.arguments.every(safeCallback);
        if (ELEMENT_PRESERVING.has(m)) return safe(recv);
        if (CONTENT_ARGS.has(m)) return safe(recv) && e.arguments.every(safe);
        return false;
      }
      return false;
    }
    if (ts.isIdentifier(e)) return safeIdentifier(e);
    return false; // fail closed: unrecognised shapes are offenders
  }

  // Fixpoint over module-local helpers: a function is clean when every one of
  // its returns is safe under the current clean set.
  let grew = true;
  while (grew) {
    grew = false;
    for (const [name, fn] of fns) {
      if (clean.has(name) || exempt.has(name)) continue;
      const returns: ts.Expression[] = [];
      collectReturns(fn, returns);
      if (returns.length > 0 && returns.every(safe)) {
        clean.add(name);
        grew = true;
      }
    }
  }

  function insideExempt(n: ts.Node): boolean {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isFunctionDeclaration(p) && p.name && exempt.has(p.name.text)) return true;
    }
    return false;
  }

  const offenders: string[] = [];
  const seen = new Set<number>();
  const visit = (n: ts.Node): void => {
    if (ts.isTemplateExpression(n) && !insideExempt(n)) {
      for (const span of n.templateSpans) {
        if (!safe(span.expression) && !seen.has(span.expression.pos)) {
          seen.add(span.expression.pos);
          const { line } = sf!.getLineAndCharacterOfPosition(span.expression.pos);
          offenders.push(`${line + 1}: \${${span.expression.getText(sf)}}`);
        }
      }
    }
    n.forEachChild(visit);
  };
  sf.forEachChild(visit);
  return offenders;
}
