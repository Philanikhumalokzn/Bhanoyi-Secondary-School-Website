const fs = require('fs');
const ts = require('typescript');
const filePath = 'assets/js/ui/components.js';
const source = fs.readFileSync(filePath, 'utf8');
const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
console.log(JSON.stringify(sf.parseDiagnostics.map((d) => ({
  code: d.code,
  message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
  start: d.start,
  length: d.length,
  line: sf.getLineAndCharacterOfPosition(d.start).line + 1,
  col: sf.getLineAndCharacterOfPosition(d.start).character + 1,
  text: source.slice(Math.max(0, d.start - 80), Math.min(source.length, d.start + 80))
})), null, 2));
console.log(JSON.stringify(sf.statements.slice(80, 110).map((stmt) => ({
  kind: ts.SyntaxKind[stmt.kind],
  startLine: sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1,
  endLine: sf.getLineAndCharacterOfPosition(stmt.end).line + 1,
  text: source.slice(stmt.getStart(sf), Math.min(stmt.getStart(sf) + 80, stmt.end)).split('\n')[0]
})), null, 2));
const hydrate = sf.statements.find((stmt) => ts.SyntaxKind[stmt.kind] === 'FunctionDeclaration' && stmt.name && stmt.name.text === 'hydrateMatchLog');
if (hydrate && hydrate.body) {
  console.log(JSON.stringify(hydrate.body.statements.slice(-20).map((stmt) => ({
    kind: ts.SyntaxKind[stmt.kind],
    startLine: sf.getLineAndCharacterOfPosition(stmt.getStart(sf)).line + 1,
    endLine: sf.getLineAndCharacterOfPosition(stmt.end).line + 1,
    text: source.slice(stmt.getStart(sf), Math.min(stmt.getStart(sf) + 100, stmt.end)).split('\n')[0]
  })), null, 2));
}
const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
let token = scanner.scan();
const tokens = [];
while (token !== ts.SyntaxKind.EndOfFileToken) {
  const pos = scanner.getTokenPos();
  const lc = sf.getLineAndCharacterOfPosition(pos);
  if (lc.line + 1 >= 5088 && lc.line + 1 <= 5100) {
    tokens.push({ line: lc.line + 1, col: lc.character + 1, token: ts.SyntaxKind[token], text: scanner.getTokenText() });
  }
  token = scanner.scan();
}
console.log(JSON.stringify(tokens, null, 2));
