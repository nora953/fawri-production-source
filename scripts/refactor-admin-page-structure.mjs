#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'artifacts/fawri/src/pages/AdminPage.tsx');
const ADMIN_DIR = path.join(ROOT, 'artifacts/fawri/src/pages/admin');
const SECTIONS_PATH = path.join(ADMIN_DIR, 'AdminPageSections.tsx');
const CONTROLLER_PATH = path.join(ADMIN_DIR, 'useAdminPageController.tsx');
const VIEW_PATH = path.join(ADMIN_DIR, 'AdminPageView.tsx');
const MAX_FILE_LINES = 1799;

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\r\n/g, '\n').replace(/\s+$/u, '') + '\n', 'utf8');
}

function collectBindingNames(name, out) {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
    return;
  }
  for (const element of name.elements || []) {
    if (ts.isOmittedExpression(element)) continue;
    collectBindingNames(element.name, out);
  }
}

function collectStatementBindings(statement, out) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, out);
    }
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    out.add(statement.name.text);
  }
}

function addHelperDeclaration(statement, valueNames, typeNames) {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      collectBindingNames(declaration.name, valueNames);
    }
  } else if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    valueNames.add(statement.name.text);
  } else if (
    (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
    statement.name
  ) {
    typeNames.add(statement.name.text);
  }
}

function importBlock(valueNames, typeNames) {
  const lines = [];
  if (valueNames.size) {
    lines.push(`import { ${[...valueNames].sort().join(', ')} } from '@/pages/admin/AdminPageSections';`);
  }
  if (typeNames.size) {
    lines.push(`import type { ${[...typeNames].sort().join(', ')} } from '@/pages/admin/AdminPageSections';`);
  }
  return lines.join('\n');
}

function compactSections(source) {
  return source
    .replace(/^\s*\/\/\s*──.*$/gm, '')
    .replace(/^\s*\/\*\*?[\s\S]*?\*\/\s*$/gm, '')
    .replace(/\n[ \t]*\n+/g, '\n');
}

function lineCount(source) {
  return source.split(/\r?\n/).length;
}

function assertUnderLimit(label, source) {
  const lines = lineCount(source);
  if (lines > MAX_FILE_LINES) {
    throw new Error(`${label} remains too large: ${lines} lines`);
  }
  console.log(`${label}=${lines}`);
}

function main() {
  if (!fs.existsSync(SOURCE_PATH)) throw new Error('AdminPage.tsx not found');
  const source = read(SOURCE_PATH);
  const sourceFile = ts.createSourceFile(
    SOURCE_PATH,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  const mainFunction = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'AdminPage',
  );
  if (!mainFunction || !ts.isFunctionDeclaration(mainFunction) || !mainFunction.body) {
    throw new Error('AdminPage function declaration not found');
  }

  const importDeclarations = sourceFile.statements.filter(ts.isImportDeclaration);
  if (!importDeclarations.length) throw new Error('AdminPage imports not found');
  const importEnd = importDeclarations[importDeclarations.length - 1].end;
  const imports = source.slice(0, importEnd).trimEnd();

  const helperValueNames = new Set();
  const helperTypeNames = new Set();
  for (const statement of sourceFile.statements) {
    if (statement === mainFunction) break;
    if (ts.isImportDeclaration(statement)) continue;
    addHelperDeclaration(statement, helperValueNames, helperTypeNames);
  }

  let helperSource = source.slice(importEnd, mainFunction.getFullStart()).trim();
  helperSource = helperSource
    .replace(/^(const|let|var|function|class|interface|type|enum)\s+/gm, 'export $1 ');
  const sectionsSource = compactSections(`${imports}\n\n${helperSource}`);

  const topLevelReturns = mainFunction.body.statements.filter(ts.isReturnStatement);
  if (topLevelReturns.length !== 1 || !topLevelReturns[0].expression) {
    throw new Error(`Expected exactly one top-level AdminPage return, found ${topLevelReturns.length}`);
  }
  const returnStatement = topLevelReturns[0];
  const bodyStart = mainFunction.body.getStart(sourceFile) + 1;
  const preReturn = source.slice(bodyStart, returnStatement.getFullStart()).trimEnd();
  const returnExpression = returnStatement.expression.getText(sourceFile);

  const controllerBindings = new Set();
  for (const statement of mainFunction.body.statements) {
    if (statement === returnStatement) break;
    collectStatementBindings(statement, controllerBindings);
  }
  if (!controllerBindings.size) throw new Error('No AdminPage controller bindings discovered');

  const helperImports = importBlock(helperValueNames, helperTypeNames);
  const returnedBindings = [...controllerBindings].sort();
  const returnObject = returnedBindings.map((name) => `    ${name},`).join('\n');
  const destructure = returnedBindings.map((name) => `    ${name},`).join('\n');

  const controllerSource = `${imports}\n${helperImports ? `${helperImports}\n` : ''}\nexport function useAdminPageController() {\n${preReturn}\n\n  return {\n${returnObject}\n  };\n}\n\nexport type AdminPageViewModel = ReturnType<typeof useAdminPageController>;\n`;

  const viewSource = `${imports}\n${helperImports ? `${helperImports}\n` : ''}import type { AdminPageViewModel } from '@/pages/admin/useAdminPageController';\n\nexport function AdminPageView({ model }: { model: AdminPageViewModel }) {\n  const {\n${destructure}\n  } = model;\n\n  return ${returnExpression};\n}\n`;

  const wrapperSource = `import { AdminPageView } from '@/pages/admin/AdminPageView';\nimport { useAdminPageController } from '@/pages/admin/useAdminPageController';\n\nexport default function AdminPage() {\n  const model = useAdminPageController();\n  return <AdminPageView model={model} />;\n}\n`;

  assertUnderLimit('AdminPageSections.tsx', sectionsSource);
  assertUnderLimit('useAdminPageController.tsx', controllerSource);
  assertUnderLimit('AdminPageView.tsx', viewSource);
  assertUnderLimit('AdminPage.tsx', wrapperSource);

  write(SECTIONS_PATH, sectionsSource);
  write(CONTROLLER_PATH, controllerSource);
  write(VIEW_PATH, viewSource);
  write(SOURCE_PATH, wrapperSource);

  console.log('ADMIN_PAGE_STRUCTURE_REFACTORED');
}

main();
