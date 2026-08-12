#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, 'artifacts', 'fawri', 'src');
const TRANSLATIONS = path.join(FRONTEND, 'lib', 'translations');
const ADMIN_TRANSLATIONS = path.join(FRONTEND, 'lib', 'admin-translations.ts');
const UI_COMPONENTS = path.join(FRONTEND, 'components', 'ui');

const STRING_ATTRIBUTES = new Set([
  'title',
  'placeholder',
  'aria-label',
  'description',
  'label',
]);
const TOAST_METHODS = new Set(['success', 'error', 'warning', 'info']);
const HUMAN_TEXT = /[A-Za-z\u0600-\u06ff]/u;

function normalize(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function meaningful(value) {
  const text = normalize(value);
  return text.length >= 2 && HUMAN_TEXT.test(text);
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function shouldScan(file) {
  if (!file.endsWith('.tsx')) return false;
  if (file === ADMIN_TRANSLATIONS) return false;
  if (isInside(TRANSLATIONS, file)) return false;
  if (isInside(UI_COMPONENTS, file)) return false;
  return true;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(target, out);
    else if (shouldScan(target)) out.push(target);
  }
  return out;
}

function location(sourceFile, node) {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

function add(findings, sourceFile, node, kind, value) {
  const text = normalize(value);
  if (!meaningful(text)) return;
  const { line, column } = location(sourceFile, node);
  findings.push({ line, column, kind, value: text });
}

function collectRenderedStringLiterals(findings, sourceFile, expression, kind) {
  if (!expression) return;

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    add(findings, sourceFile, expression, kind, expression.text);
    return;
  }

  if (ts.isConditionalExpression(expression)) {
    collectRenderedStringLiterals(findings, sourceFile, expression.whenTrue, kind);
    collectRenderedStringLiterals(findings, sourceFile, expression.whenFalse, kind);
    return;
  }

  if (ts.isParenthesizedExpression(expression)) {
    collectRenderedStringLiterals(findings, sourceFile, expression.expression, kind);
    return;
  }

  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    collectRenderedStringLiterals(findings, sourceFile, expression.left, kind);
    collectRenderedStringLiterals(findings, sourceFile, expression.right, kind);
  }
}

function scanFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const findings = [];

  function visit(node) {
    if (ts.isJsxText(node)) {
      add(findings, sourceFile, node, 'jsx-text', node.getText(sourceFile));
    } else if (ts.isJsxExpression(node)) {
      collectRenderedStringLiterals(findings, sourceFile, node.expression, 'jsx-expression');
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (STRING_ATTRIBUTES.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          add(findings, sourceFile, node, `attribute:${name}`, node.initializer.text);
        } else if (ts.isJsxExpression(node.initializer)) {
          collectRenderedStringLiterals(
            findings,
            sourceFile,
            node.initializer.expression,
            `attribute-expression:${name}`,
          );
        }
      }
    } else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      const method = node.expression.name.text;
      if (
        ts.isIdentifier(target) &&
        target.text === 'toast' &&
        TOAST_METHODS.has(method) &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        add(findings, sourceFile, node.arguments[0], `toast:${method}`, node.arguments[0].text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

const files = walk(FRONTEND).sort();
const result = [];
let total = 0;
for (const file of files) {
  const findings = scanFile(file);
  if (!findings.length) continue;
  total += findings.length;
  result.push({
    file: path.relative(ROOT, file).split(path.sep).join('/'),
    findings,
  });
}

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify({ count: total, files: result }, null, 2)}\n`);
} else {
  console.log(`count=${total}`);
  for (const entry of result) {
    for (const finding of entry.findings) {
      console.log(`${entry.file}:${finding.line}:${finding.column}: ${finding.kind}: ${finding.value}`);
    }
  }
}
