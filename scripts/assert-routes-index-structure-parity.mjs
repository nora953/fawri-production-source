#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const [originalPathArg] = process.argv.slice(2);
if (!originalPathArg) {
  throw new Error('usage: assert-routes-index-structure-parity.mjs <original-index.ts>');
}

const originalPath = path.resolve(originalPathArg);
const routesDir = path.resolve('artifacts/api-server/src/routes');
const wrapperPath = path.join(routesDir, 'index.ts');

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

function isDefaultRouterExport(statement) {
  return ts.isExportAssignment(statement) &&
    !statement.isExportEquals &&
    ts.isIdentifier(statement.expression) &&
    statement.expression.text === 'router';
}

function hasExportModifier(statement) {
  return Boolean(statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
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

function declarationInfo(statement) {
  const values = new Set();
  const types = new Set();
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, values);
    }
  } else if (ts.isFunctionDeclaration(statement) && statement.name) {
    values.add(statement.name.text);
  } else if (ts.isClassDeclaration(statement) && statement.name) {
    values.add(statement.name.text);
    types.add(statement.name.text);
  } else if (ts.isEnumDeclaration(statement)) {
    values.add(statement.name.text);
    types.add(statement.name.text);
  } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
    types.add(statement.name.text);
  }
  return { values, types };
}

function stripGeneratedExport(text) {
  return text.replace(/^\s*export\s+/, '').replace(/\s+/g, ' ').trim();
}

function entriesFromSource(source, statements) {
  return statements.map((statement) => ({
    statement,
    text: stripGeneratedExport(source.slice(statement.getFullStart(), statement.end)),
  }));
}

function generatedFiles() {
  return fs.readdirSync(routesDir)
    .filter((name) => /^indexModulePart\d+\.ts$/.test(name))
    .sort((left, right) => Number(left.match(/(\d+)/)?.[1] || 0) - Number(right.match(/(\d+)/)?.[1] || 0))
    .map((name) => path.join(routesDir, name));
}

function normalizedEntries(file) {
  const { source, file: sourceFile } = parse(file);
  return sourceFile.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .map((statement) => ({
      statement,
      text: stripGeneratedExport(source.slice(statement.getFullStart(), statement.end)),
    }));
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

function isSideEffectful(statement) {
  return !(
    ts.isFunctionDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  );
}

function isRouterRegistration(statement) {
  if (!ts.isExpressionStatement(statement)) return false;
  const expression = statement.expression;
  if (!ts.isCallExpression(expression)) return false;
  const callee = expression.expression;
  return ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === 'router';
}

const original = parse(originalPath);
const originalNonImports = original.file.statements.filter((statement) => !ts.isImportDeclaration(statement));
const defaultExportIndex = originalNonImports.findIndex(isDefaultRouterExport);
if (defaultExportIndex < 0 || defaultExportIndex !== originalNonImports.length - 1) {
  throw new Error('original routes/index.ts default export boundary is invalid');
}
const originalStatements = originalNonImports.slice(0, defaultExportIndex);
const originalEntries = entriesFromSource(original.source, originalStatements);

const partFiles = generatedFiles();
if (partFiles.length < 2) throw new Error('routes/index.ts was not split into multiple modules');
const generatedEntries = partFiles.flatMap((file) => normalizedEntries(file));

assertMultisetEqual('routes index statements', originalEntries, generatedEntries);
assertArrayEqual(
  'routes index side-effect sequence',
  originalEntries.filter((entry) => isSideEffectful(entry.statement)).map((entry) => entry.text),
  generatedEntries.filter((entry) => isSideEffectful(entry.statement)).map((entry) => entry.text),
);
assertArrayEqual(
  'routes index router registration sequence',
  originalEntries.filter((entry) => isRouterRegistration(entry.statement)).map((entry) => entry.text),
  generatedEntries.filter((entry) => isRouterRegistration(entry.statement)).map((entry) => entry.text),
);

const originalPublicValues = new Set();
const originalPublicTypes = new Set();
for (const statement of originalStatements) {
  if (!hasExportModifier(statement)) continue;
  const info = declarationInfo(statement);
  for (const name of info.values) originalPublicValues.add(name);
  for (const name of info.types) {
    if (!info.values.has(name)) originalPublicTypes.add(name);
  }
}

const wrapper = parse(wrapperPath);
const wrapperPublicValues = new Set();
const wrapperPublicTypes = new Set();
let wrapperDefaultRouter = false;
for (const statement of wrapper.file.statements) {
  if (isDefaultRouterExport(statement)) wrapperDefaultRouter = true;
  if (!ts.isExportDeclaration(statement) || !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
  const typeOnly = statement.isTypeOnly === true;
  for (const element of statement.exportClause.elements) {
    if (typeOnly || element.isTypeOnly === true) wrapperPublicTypes.add(element.name.text);
    else wrapperPublicValues.add(element.name.text);
  }
}

assertArrayEqual('routes index public value exports', [...originalPublicValues].sort(), [...wrapperPublicValues].sort());
assertArrayEqual('routes index public type exports', [...originalPublicTypes].sort(), [...wrapperPublicTypes].sort());
if (!wrapperDefaultRouter) throw new Error('routes/index.ts default router export was not preserved');

console.log(`ROUTES_INDEX_STATEMENTS_PRESERVED=${originalEntries.length}`);
console.log(`ROUTES_INDEX_SIDE_EFFECTS_PRESERVED=${originalEntries.filter((entry) => isSideEffectful(entry.statement)).length}`);
console.log(`ROUTES_INDEX_ROUTER_REGISTRATIONS_PRESERVED=${originalEntries.filter((entry) => isRouterRegistration(entry.statement)).length}`);
console.log(`ROUTES_INDEX_PUBLIC_VALUE_EXPORTS_PRESERVED=${originalPublicValues.size}`);
console.log(`ROUTES_INDEX_PUBLIC_TYPE_EXPORTS_PRESERVED=${originalPublicTypes.size}`);
console.log('ROUTES_INDEX_STRUCTURE_PARITY_READY');
