const fs = require('fs');
const src = fs.readFileSync('assets/js/ui/components.js', 'utf8');
const startToken = 'function hydrateMatchLog(matchLogNode) {';
const start = src.indexOf(startToken);
if (start === -1) throw new Error('start token not found');
let index = start + startToken.length - 1;
let line = src.slice(0, index + 1).split('\n').length;
let depth = 1;
const templateContext = [];
let quote = null;
let escaped = false;
let inLineComment = false;
let inBlockComment = false;
for (index += 1; index < src.length; index += 1) {
  const ch = src[index];
  const next = src[index + 1];
  if (ch === '\n') {
    line += 1;
    inLineComment = false;
    continue;
  }
  if (inLineComment) continue;
  if (inBlockComment) {
    if (ch === '*' && next === '/') {
      inBlockComment = false;
      index += 1;
    }
    continue;
  }
  if (quote) {
    if (quote === '`') {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '$' && next === '{') {
        templateContext.push('template');
        depth += 1;
        index += 1;
        continue;
      }
      if (ch === '`') {
        quote = null;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === quote) {
      quote = null;
    }
    continue;
  }
  if (templateContext.length && templateContext[templateContext.length - 1] === 'template' && ch === '}') {
    depth -= 1;
    if (depth === 0) {
      console.log(`balanced at line ${line}`);
      process.exit(0);
    }
    templateContext.pop();
    continue;
  }
  if (ch === '/' && next === '/') {
    inLineComment = true;
    index += 1;
    continue;
  }
  if (ch === '/' && next === '*') {
    inBlockComment = true;
    index += 1;
    continue;
  }
  if (ch === '"' || ch === '\'' || ch === '`') {
    quote = ch;
    escaped = false;
    continue;
  }
  if (ch === '{') {
    depth += 1;
    continue;
  }
  if (ch === '}') {
    depth -= 1;
    if (depth === 0) {
      console.log(`balanced at line ${line}`);
      process.exit(0);
    }
  }
}
console.log('never balanced');
