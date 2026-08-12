#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, 'artifacts/api-server/src/routes');
const SOURCE_PATH = path.join(ROUTES_DIR, 'auth.ts');
const MAX_LINES = 1799;
const TARGET_CONTENT_LINES = 1050;
const ROUTER_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'use']);

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.writeFileSync(file, content.replace(/\r\n/g, '\n').replace(/\s+$/u, '') + '\n', 'utf8');
}

function lineCount(text) {
  return text.split(/\r?\n/).length;
}

function statementText(source, statement) {
  return source.slice(statement.getFullStart(), statement.end).trim();
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

function importedBindings(imports) {
  const names = new Set();
  for (const statement of imports) {
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) {
      names.add(bindings.name.text);
    } else {
      for (const element of bindings.elements) names.add(element.name.text);
    }
  }
  return names;
}

function isDeclarationIdentifier(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isClassDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent)) &&
    parent.name === node
  ) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent)) &&
    parent.name === node
  ) return true;
  if (ts.isLabeledStatement(parent) && parent.label === node) return true;
  return false;
}

function isDirectWrite(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isBinaryExpression(parent) && parent.left === node) {
    return parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
  }
  return (
    (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) &&
    (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)
  );
}

function refsForStatement(statement, localNames) {
  const refs = new Set();
  const writes = new Set();
  function visit(node) {
    if (ts.isIdentifier(node) && localNames.has(node.text) && !isDeclarationIdentifier(node)) {
      refs.add(node.text);
      if (isDirectWrite(node)) writes.add(node.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(statement);
  const own = declarationInfo(statement);
  for (const name of own.values) refs.delete(name);
  for (const name of own.types) refs.delete(name);
  return { refs, writes };
}

function hasExportModifier(statement) {
  return Boolean(statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function exportStatementText(source, statement) {
  const text = statementText(source, statement);
  if (hasExportModifier(statement)) return text;
  if (
    ts.isVariableStatement(statement) ||
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement)
  ) {
    return `export ${text}`;
  }
  return text;
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

function buildNameIndex(statements) {
  const byName = new Map();
  const kindByName = new Map();
  statements.forEach((statement, index) => {
    const info = declarationInfo(statement);
    for (const name of info.values) {
      byName.set(name, index);
      kindByName.set(name, info.types.has(name) ? 'both' : 'value');
    }
    for (const name of info.types) {
      if (!byName.has(name)) byName.set(name, index);
      if (!kindByName.has(name)) kindByName.set(name, 'type');
    }
  });
  return { byName, kindByName };
}

function sourceLinesForStatement(source, statement) {
  return lineCount(source.slice(statement.getFullStart(), statement.end));
}

function tryPartition(source, statements, targetLines, externalNames = new Set()) {
  const { byName, kindByName } = buildNameIndex(statements);
  const localNames = new Set(byName.keys());
  const refs = statements.map((statement) => refsForStatement(statement, localNames));
  const parts = [];
  let currentPart = 0;
  let currentLines = 0;

  for (let index = 0; index < statements.length; index += 1) {
    const lines = sourceLinesForStatement(source, statements[index]);
    if (lines > MAX_LINES - 150) {
      throw new Error(`single auth statement is too large: ${lines} lines`);
    }
    if (currentLines > 0 && currentLines + lines > targetLines) {
      currentPart += 1;
      currentLines = 0;
    }
    parts[index] = currentPart;
    currentLines += lines;
  }

  let changed = true;
  let guard = 0;
  while (changed && guard < 100) {
    changed = false;
    guard += 1;

    for (let index = 0; index < statements.length; index += 1) {
      for (const name of refs[index].refs) {
        const declarationIndex = byName.get(name);
        if (declarationIndex === undefined) continue;
        if (parts[declarationIndex] > parts[index]) {
          parts[index] = parts[declarationIndex];
          changed = true;
        }
      }
      for (const name of refs[index].writes) {
        const declarationIndex = byName.get(name);
        if (declarationIndex === undefined) continue;
        const target = Math.max(parts[index], parts[declarationIndex]);
        if (parts[index] !== target || parts[declarationIndex] !== target) {
          parts[index] = target;
          parts[declarationIndex] = target;
          changed = true;
        }
      }
    }

    let lastSideEffectPart = 0;
    for (let index = 0; index < statements.length; index += 1) {
      if (!statementIsSideEffectful(statements[index])) continue;
      if (parts[index] < lastSideEffectPart) {
        parts[index] = lastSideEffectPart;
        changed = true;
      }
      lastSideEffectPart = parts[index];
    }
  }

  if (guard >= 100) throw new Error('auth partition dependency convergence failed');

  for (let index = 0; index < statements.length; index += 1) {
    for (const name of refs[index].refs) {
      const declarationIndex = byName.get(name);
      if (declarationIndex !== undefined && parts[declarationIndex] > parts[index]) {
        return null;
      }
    }
    for (const name of refs[index].writes) {
      const declarationIndex = byName.get(name);
      if (declarationIndex !== undefined && parts[declarationIndex] !== parts[index]) {
        return null;
      }
    }
  }

  const groups = [];
  for (let index = 0; index < statements.length; index += 1) {
    const part = parts[index];
    groups[part] ||= [];
    groups[part].push(index);
  }

  return { groups: groups.filter(Boolean), refs, byName, kindByName, externalNames };
}

function partitionStatements(source, statements, externalNames = new Set()) {
  for (const target of [TARGET_CONTENT_LINES, 900, 750, 600, 450, 320]) {
    const result = tryPartition(source, statements, target, externalNames);
    if (!result) continue;
    const largest = Math.max(...result.groups.map((group) =>
      group.reduce((sum, index) => sum + sourceLinesForStatement(source, statements[index]), 0),
    ));
    if (largest <= 1450) return result;
  }
  throw new Error('could not partition auth statements below safe module size');
}

function importLinesForPart({
  partIndex,
  group,
  statements,
  partition,
  modulePrefix,
  extraExternalModule,
  externalKindByName,
}) {
  const needed = new Map();
  const ownNames = new Set();
  for (const statementIndex of group) {
    const info = declarationInfo(statements[statementIndex]);
    for (const name of info.values) ownNames.add(name);
    for (const name of info.types) ownNames.add(name);
  }

  for (const statementIndex of group) {
    for (const name of partition.refs[statementIndex].refs) {
      if (ownNames.has(name)) continue;
      const declarationIndex = partition.byName.get(name);
      if (declarationIndex !== undefined) {
        const declarationPart = partition.groups.findIndex((candidate) => candidate.includes(declarationIndex));
        if (declarationPart >= 0 && declarationPart < partIndex) {
          const kind = partition.kindByName.get(name) || 'value';
          needed.set(name, { module: `./${modulePrefix}${declarationPart + 1}`, kind });
        }
      } else if (extraExternalModule && externalKindByName?.has(name)) {
        needed.set(name, { module: extraExternalModule, kind: externalKindByName.get(name) });
      }
    }
  }

  const byModule = new Map();
  for (const [name, info] of needed) {
    if (!byModule.has(info.module)) byModule.set(info.module, { value: [], type: [] });
    const bucket = byModule.get(info.module);
    if (info.kind === 'type') bucket.type.push(name);
    else bucket.value.push(name);
  }

  const lines = [];
  for (const [module, bucket] of [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (bucket.value.length) lines.push(`import { ${bucket.value.sort().join(', ')} } from '${module}';`);
    if (bucket.type.length) lines.push(`import type { ${bucket.type.sort().join(', ')} } from '${module}';`);
  }
  return lines;
}

function emitPartition({
  source,
  statements,
  partition,
  originalImports,
  modulePrefix,
  extraExternalModule,
  externalKindByName,
  chainSideEffects = false,
}) {
  const outputs = [];

  partition.groups.forEach((group, partIndex) => {
    const dependencyImports = importLinesForPart({
      partIndex,
      group,
      statements,
      partition,
      modulePrefix,
      extraExternalModule,
      externalKindByName,
    });
    const chainImport = chainSideEffects && partIndex > 0
      ? [`import './${modulePrefix}${partIndex}';`]
      : [];
    const body = group.map((index) => exportStatementText(source, statements[index])).join('\n\n');
    const text = [originalImports, ...chainImport, ...dependencyImports, '', body].filter((value, index, array) =>
      value !== '' || (index > 0 && array[index - 1] !== ''),
    ).join('\n');
    if (lineCount(text) > MAX_LINES) {
      throw new Error(`${modulePrefix}${partIndex + 1}.ts remains too large: ${lineCount(text)} lines`);
    }
    outputs.push(text);
  });

  return outputs;
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error('auth.ts not found');
  const source = read(SOURCE_PATH);
  const sourceFile = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const originalImports = imports.map((statement) => statement.getText(sourceFile)).join('\n');
  const importNames = importedBindings(imports);

  const nonImports = sourceFile.statements.filter((statement) => !ts.isImportDeclaration(statement));
  const firstRouteIndex = nonImports.findIndex(isRouterRegistration);
  if (firstRouteIndex < 0) throw new Error('first auth router registration not found');

  const defaultExportIndex = nonImports.findIndex(isDefaultRouterExport);
  if (defaultExportIndex < 0) throw new Error('auth default router export not found');

  const runtimeStatements = nonImports.slice(0, firstRouteIndex);
  const routeStatements = nonImports.slice(firstRouteIndex, defaultExportIndex);
  if (!routeStatements.some(isRouterRegistration)) throw new Error('auth route registrations not found');

  const runtimePartition = partitionStatements(source, runtimeStatements);
  const runtimeOutputs = emitPartition({
    source,
    statements: runtimeStatements,
    partition: runtimePartition,
    originalImports,
    modulePrefix: 'authRuntimePart',
  });

  const runtimeIndex = buildNameIndex(runtimeStatements);
  const runtimeNames = new Set(runtimeIndex.byName.keys());
  for (const name of importNames) runtimeNames.delete(name);

  const routePartition = partitionStatements(source, routeStatements, runtimeNames);
  const routeOutputs = emitPartition({
    source,
    statements: routeStatements,
    partition: routePartition,
    originalImports,
    modulePrefix: 'authRoutesPart',
    extraExternalModule: './authRuntime',
    externalKindByName: runtimeIndex.kindByName,
    chainSideEffects: true,
  });

  runtimeOutputs.forEach((text, index) => write(path.join(ROUTES_DIR, `authRuntimePart${index + 1}.ts`), text));

  const runtimeBarrel = runtimeOutputs.map((_, index) => `export * from './authRuntimePart${index + 1}';`).join('\n');
  write(path.join(ROUTES_DIR, 'authRuntime.ts'), runtimeBarrel);

  routeOutputs.forEach((text, index) => write(path.join(ROUTES_DIR, `authRoutesPart${index + 1}.ts`), text));

  const exportedNames = [];
  for (const statement of runtimeStatements) {
    if (!hasExportModifier(statement)) continue;
    const info = declarationInfo(statement);
    for (const name of info.values) exportedNames.push(name);
  }

  if (!runtimeIndex.byName.has('router')) throw new Error('router declaration not found in runtime');
  const lastRouteModule = `./authRoutesPart${routeOutputs.length}`;
  const wrapper = [
    `import { router } from './authRuntime';`,
    `import '${lastRouteModule}';`,
    exportedNames.length ? `export { ${[...new Set(exportedNames)].sort().join(', ')} } from './authRuntime';` : '',
    '',
    'export default router;',
  ].filter(Boolean).join('\n');
  write(SOURCE_PATH, wrapper);

  const generated = [
    ['auth.ts', wrapper],
    ['authRuntime.ts', runtimeBarrel],
    ...runtimeOutputs.map((text, index) => [`authRuntimePart${index + 1}.ts`, text]),
    ...routeOutputs.map((text, index) => [`authRoutesPart${index + 1}.ts`, text]),
  ];

  for (const [name, text] of generated) {
    const lines = lineCount(text);
    console.log(`${name}=${lines}`);
    if (lines >= 1800) throw new Error(`${name} remains critical: ${lines} lines`);
  }

  console.log(`AUTH_RUNTIME_PARTS=${runtimeOutputs.length}`);
  console.log(`AUTH_ROUTE_PARTS=${routeOutputs.length}`);
  console.log('AUTH_STRUCTURE_REFACTORED');
}

main();
