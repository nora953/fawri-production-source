#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const [originalPathArg] = process.argv.slice(2);
if (!originalPathArg) {
  throw new Error('usage: assert-auth-structure-parity.mjs <original-auth.ts>');
}

const originalPath = path.resolve(originalPathArg);
const routesDir = path.resolve('artifacts/api-server/src/routes');
const wrapperPath = path.join(routesDir, 'auth.ts');
const ROUTER_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'use']);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function parse(file) {
  const source = read(file);
  return {
    source,
    file: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
  };
}

function isRouterRegistration(statement) {
  if (!ts.isExpressionStatement(statement)) return false;
  const expression = statement.expression;
  if (!ts.isCallExpression(expression)) return false;
  const callee = expression.expression;
  return ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'router' &&
    ROUTER_METHODS.has(callee.name.text);
}

function isDefaultRouterExport(statement) {
  return ts.isExportAssignment(statement) &&
    !statement.isExportEquals &&
    ts.isIdentifier(statement.expression) &&
    statement.expression.text === 'router';
}

function statementIsSideEffectful(statement) {
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ) return false;
  return true;
}

function collectBindingNames(name, out) {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue;
      collectBindingNames(element.name, out);
    }
  }
}

function declarationNames(statement) {
  const names = new Set();
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, names);
    }
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    names.add(statement.name.text);
  }
  return names;
}

function hasExportModifier(statement) {
  return Boolean(statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function stripExportModifier(text) {
  return text.replace(/^\s*export\s+/, '').replace(/\s+/g, ' ').trim();
}

function normalizedEntries(file, predicate = () => true) {
  const { source, file: sourceFile } = parse(file);
  return sourceFile.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .filter(predicate)
    .map((statement) => ({
      statement,
      text: stripExportModifier(source.slice(statement.getFullStart(), statement.end)),
    }));
}

function numericFiles(prefix) {
  return fs.readdirSync(routesDir)
    .filter((name) => new RegExp(`^${prefix}\\d+\\.ts$`).test(name))
    .sort((left, right) => {
      const a = Number(left.match(/(\d+)/)?.[1] || 0);
      const b = Number(right.match(/(\d+)/)?.[1] || 0);
      return a - b;
    })
    .map((name) => path.join(routesDir, name));
}

function assertArrayEqual(label, expected, actual) {
  if (expected.length !== actual.length) {
    throw new Error(`${label} count changed: expected ${expected.length}, got ${actual.length}`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      throw new Error(`${label} changed at index ${index + 1}\nEXPECTED: ${expected[index]}\nACTUAL:   ${actual[index]}`);
    }
  }
}

function statementCounts(entries) {
  const counts = new Map();
  for (const entry of entries) counts.set(entry.text, (counts.get(entry.text) || 0) + 1);
  return counts;
}

function assertMultisetEqual(label, expectedEntries, actualEntries) {
  if (expectedEntries.length !== actualEntries.length) {
    throw new Error(`${label} count changed: expected ${expectedEntries.length}, got ${actualEntries.length}`);
  }
  const expected = statementCounts(expectedEntries);
  const actual = statementCounts(actualEntries);
  const all = new Set([...expected.keys(), ...actual.keys()]);
  for (const text of all) {
    const expectedCount = expected.get(text) || 0;
    const actualCount = actual.get(text) || 0;
    if (expectedCount !== actualCount) {
      throw new Error(`${label} statement multiplicity changed\nEXPECTED_COUNT=${expectedCount}\nACTUAL_COUNT=${actualCount}\nSTATEMENT: ${text}`);
    }
  }
}

const original = parse(originalPath);
const nonImports = original.file.statements.filter((statement) => !ts.isImportDeclaration(statement));
const firstRouteIndex = nonImports.findIndex(isRouterRegistration);
const defaultExportIndex = nonImports.findIndex(isDefaultRouterExport);
if (firstRouteIndex < 0 || defaultExportIndex < 0 || defaultExportIndex <= firstRouteIndex) {
  throw new Error('original auth route boundaries are invalid');
}

const originalRuntimeEntries = nonImports.slice(0, firstRouteIndex).map((statement) => ({
  statement,
  text: stripExportModifier(original.source.slice(statement.getFullStart(), statement.end)),
}));
const originalRouteEntries = nonImports.slice(firstRouteIndex, defaultExportIndex).map((statement) => ({
  statement,
  text: stripExportModifier(original.source.slice(statement.getFullStart(), statement.end)),
}));

const generatedRuntimeEntries = numericFiles('authRuntimePart')
  .flatMap((file) => normalizedEntries(file));
const generatedRouteEntries = numericFiles('authRoutesPart')
  .flatMap((file) => normalizedEntries(file));

// Runtime declarations may move across split modules to satisfy dependency
// boundaries. Function/class/type declarations are safe to reorder, but every
// statement must be preserved exactly once and the relative order of all
// side-effectful top-level statements must remain unchanged.
assertMultisetEqual('auth runtime statements', originalRuntimeEntries, generatedRuntimeEntries);
assertArrayEqual(
  'auth runtime side-effect sequence',
  originalRuntimeEntries.filter((entry) => statementIsSideEffectful(entry.statement)).map((entry) => entry.text),
  generatedRuntimeEntries.filter((entry) => statementIsSideEffectful(entry.statement)).map((entry) => entry.text),
);

// Route registration order is behavior and must remain byte-semantically equal
// after whitespace/export normalization.
assertArrayEqual(
  'auth route registration sequence',
  originalRouteEntries.map((entry) => entry.text),
  generatedRouteEntries.map((entry) => entry.text),
);

const originalExports = new Set();
for (const statement of nonImports.slice(0, firstRouteIndex)) {
  if (!hasExportModifier(statement)) continue;
  for (const name of declarationNames(statement)) originalExports.add(name);
}

const wrapper = parse(wrapperPath);
const wrapperExports = new Set();
let wrapperDefaultRouter = false;
for (const statement of wrapper.file.statements) {
  if (isDefaultRouterExport(statement)) wrapperDefaultRouter = true;
  if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
  for (const element of statement.exportClause.elements) {
    wrapperExports.add(element.name.text);
  }
}

assertArrayEqual(
  'auth public named exports',
  [...originalExports].sort(),
  [...wrapperExports].sort(),
);
if (!wrapperDefaultRouter) throw new Error('auth default router export was not preserved');

console.log(`AUTH_RUNTIME_STATEMENTS_PRESERVED=${originalRuntimeEntries.length}`);
console.log(`AUTH_RUNTIME_SIDE_EFFECTS_PRESERVED=${originalRuntimeEntries.filter((entry) => statementIsSideEffectful(entry.statement)).length}`);
console.log(`AUTH_ROUTE_STATEMENTS_PRESERVED=${originalRouteEntries.length}`);
console.log(`AUTH_PUBLIC_EXPORTS_PRESERVED=${originalExports.size}`);
console.log('AUTH_STRUCTURE_PARITY_READY');
