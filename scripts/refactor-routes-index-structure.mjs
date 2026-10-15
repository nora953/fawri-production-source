#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const ROUTES_DIR = path.join(ROOT, 'artifacts/api-server/src/routes');
const SOURCE_PATH = path.join(ROUTES_DIR, 'index.ts');
const MAX_LINES = 1799;
const TARGET_CONTENT_LINES = 900;

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

function isDefaultRouterExport(statement) {
  return ts.isExportAssignment(statement) &&
    !statement.isExportEquals &&
    ts.isIdentifier(statement.expression) &&
    statement.expression.text === 'router';
}

function statementIsSideEffectful(statement) {
  // Function declarations and erased type declarations can safely cross module
  // boundaries. Everything else keeps source order, including variables,
  // classes, enums, router registrations and runtime initialization calls.
  return !(
    ts.isFunctionDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement)
  );
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

function tryPartition(source, statements, targetLines) {
  const { byName, kindByName } = buildNameIndex(statements);
  const localNames = new Set(byName.keys());
  const refs = statements.map((statement) => refsForStatement(statement, localNames));
  const parts = [];
  let currentPart = 0;
  let currentLines = 0;

  for (let index = 0; index < statements.length; index += 1) {
    const lines = sourceLinesForStatement(source, statements[index]);
    if (lines > MAX_LINES - 120) {
      throw new Error(`single routes/index.ts statement is too large: ${lines} lines`);
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
  while (changed && guard < 200) {
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

  if (guard >= 200) throw new Error('routes index partition dependency convergence failed');

  for (let index = 0; index < statements.length; index += 1) {
    for (const name of refs[index].refs) {
      const declarationIndex = byName.get(name);
      if (declarationIndex !== undefined && parts[declarationIndex] > parts[index]) return null;
    }
    for (const name of refs[index].writes) {
      const declarationIndex = byName.get(name);
      if (declarationIndex !== undefined && parts[declarationIndex] !== parts[index]) return null;
    }
  }

  const groups = [];
  for (let index = 0; index < statements.length; index += 1) {
    const part = parts[index];
    groups[part] ||= [];
    groups[part].push(index);
  }

  return { groups: groups.filter(Boolean), refs, byName, kindByName };
}

function partitionStatements(source, statements) {
  for (const target of [TARGET_CONTENT_LINES, 750, 600, 450, 320, 240]) {
    const result = tryPartition(source, statements, target);
    if (!result) continue;
    const largest = Math.max(...result.groups.map((group) =>
      group.reduce((sum, index) => sum + sourceLinesForStatement(source, statements[index]), 0),
    ));
    if (largest <= 1450) return result;
  }
  throw new Error('could not partition routes/index.ts below safe module size');
}

function importLinesForPart({ partIndex, group, statements, partition, modulePrefix }) {
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
      if (declarationIndex === undefined) continue;
      const declarationPart = partition.groups.findIndex((candidate) => candidate.includes(declarationIndex));
      if (declarationPart < 0 || declarationPart >= partIndex) continue;
      const kind = partition.kindByName.get(name) || 'value';
      needed.set(name, { module: `./${modulePrefix}${declarationPart + 1}`, kind });
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

function partForDeclaration(partition, declarationIndex) {
  return partition.groups.findIndex((candidate) => candidate.includes(declarationIndex));
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error('routes/index.ts not found');
  const source = read(SOURCE_PATH);
  const sourceFile = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const originalImports = imports.map((statement) => statement.getText(sourceFile)).join('\n');
  const nonImports = sourceFile.statements.filter((statement) => !ts.isImportDeclaration(statement));
  const defaultExportIndex = nonImports.findIndex(isDefaultRouterExport);
  if (defaultExportIndex < 0) throw new Error('routes/index.ts default router export not found');
  if (defaultExportIndex !== nonImports.length - 1) {
    throw new Error('routes/index.ts default router export is no longer the final statement');
  }

  const statements = nonImports.slice(0, defaultExportIndex);
  const partition = partitionStatements(source, statements);
  const modulePrefix = 'indexModulePart';
  const outputs = [];

  partition.groups.forEach((group, partIndex) => {
    const dependencyImports = importLinesForPart({
      partIndex,
      group,
      statements,
      partition,
      modulePrefix,
    });
    const chainImport = partIndex > 0 ? [`import './${modulePrefix}${partIndex}';`] : [];
    const body = group.map((index) => exportStatementText(source, statements[index])).join('\n\n');
    const text = [originalImports, ...chainImport, ...dependencyImports, '', body]
      .filter((value, index, array) => value !== '' || (index > 0 && array[index - 1] !== ''))
      .join('\n');
    if (lineCount(text) > MAX_LINES) {
      throw new Error(`${modulePrefix}${partIndex + 1}.ts remains too large: ${lineCount(text)} lines`);
    }
    outputs.push(text);
  });

  outputs.forEach((text, index) => {
    write(path.join(ROUTES_DIR, `${modulePrefix}${index + 1}.ts`), text);
  });

  const nameIndex = buildNameIndex(statements);
  const routerIndex = nameIndex.byName.get('router');
  if (routerIndex === undefined) throw new Error('router declaration not found in routes/index.ts');
  const routerPart = partForDeclaration(partition, routerIndex);
  if (routerPart < 0) throw new Error('router partition not found');

  const publicByPart = new Map();
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (!hasExportModifier(statement)) continue;
    const info = declarationInfo(statement);
    const part = partForDeclaration(partition, index);
    if (part < 0) throw new Error('public export partition not found');
    if (!publicByPart.has(part)) publicByPart.set(part, { value: new Set(), type: new Set() });
    const bucket = publicByPart.get(part);
    for (const name of info.values) bucket.value.add(name);
    for (const name of info.types) {
      if (!info.values.has(name)) bucket.type.add(name);
    }
  }

  const lastPartModule = `./${modulePrefix}${outputs.length}`;
  const wrapperLines = [
    `import { router } from './${modulePrefix}${routerPart + 1}';`,
    `import '${lastPartModule}';`,
  ];
  for (const [part, bucket] of [...publicByPart.entries()].sort(([a], [b]) => a - b)) {
    const module = `./${modulePrefix}${part + 1}`;
    if (bucket.value.size) wrapperLines.push(`export { ${[...bucket.value].sort().join(', ')} } from '${module}';`);
    if (bucket.type.size) wrapperLines.push(`export type { ${[...bucket.type].sort().join(', ')} } from '${module}';`);
  }
  wrapperLines.push('', 'export default router;');
  const wrapper = wrapperLines.join('\n');
  write(SOURCE_PATH, wrapper);

  console.log(`index.ts=${lineCount(wrapper)}`);
  outputs.forEach((text, index) => {
    console.log(`${modulePrefix}${index + 1}.ts=${lineCount(text)}`);
  });
  console.log(`INDEX_MODULE_PARTS=${outputs.length}`);
  console.log('ROUTES_INDEX_STRUCTURE_REFACTORED');
}

main();
