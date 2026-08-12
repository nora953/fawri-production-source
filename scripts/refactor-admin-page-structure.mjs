#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = process.cwd();
const SOURCE_PATH = path.join(ROOT, 'artifacts/fawri/src/pages/AdminPage.tsx');
const ADMIN_DIR = path.join(ROOT, 'artifacts/fawri/src/pages/admin');
const SECTIONS_PATH = path.join(ADMIN_DIR, 'AdminPageSections.tsx');
const DIALOGS_PATH = path.join(ADMIN_DIR, 'AdminPageDialogs.tsx');
const PARTS_PATH = path.join(ADMIN_DIR, 'AdminPageParts.ts');
const CONTROLLER_PATH = path.join(ADMIN_DIR, 'useAdminPageController.tsx');
const VIEW_PATH = path.join(ADMIN_DIR, 'AdminPageView.tsx');
const MAX_FILE_LINES = 1799;

const DIALOG_DECLARATION_NAMES = new Set([
  'ConfirmType',
  'ConfirmState',
  'ConfirmDialog',
  'PlanModalState',
  'PlanModal',
  'RepliesModalState',
  'RepliesModal',
  'DetailsModal',
]);

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

function statementDeclarationNames(statement) {
  const values = new Set();
  const types = new Set();
  addHelperDeclaration(statement, values, types);
  return new Set([...values, ...types]);
}

function collectReferencedIdentifiers(node, out) {
  function visit(current) {
    if (ts.isIdentifier(current)) out.add(current.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
}

function importBlock(valueNames, typeNames, modulePath = '@/pages/admin/AdminPageParts') {
  const lines = [];
  if (valueNames.size) {
    lines.push(`import { ${[...valueNames].sort().join(', ')} } from '${modulePath}';`);
  }
  if (typeNames.size) {
    lines.push(`import type { ${[...typeNames].sort().join(', ')} } from '${modulePath}';`);
  }
  return lines.join('\n');
}

function exportify(source) {
  return source.replace(/^(const|let|var|function|class|interface|type|enum)\s+/gm, 'export $1 ');
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

  const helperStatements = sourceFile.statements.filter(
    (statement) =>
      statement !== mainFunction &&
      !ts.isImportDeclaration(statement) &&
      statement.end <= mainFunction.getFullStart(),
  );

  const sectionStatements = [];
  const dialogStatements = [];
  for (const statement of helperStatements) {
    const names = statementDeclarationNames(statement);
    const isDialogDeclaration = [...names].some((name) => DIALOG_DECLARATION_NAMES.has(name));
    (isDialogDeclaration ? dialogStatements : sectionStatements).push(statement);
  }

  if (!dialogStatements.length) throw new Error('AdminPage dialog declarations not discovered');
  if (!sectionStatements.length) throw new Error('AdminPage section declarations not discovered');

  const helperValueNames = new Set();
  const helperTypeNames = new Set();
  const sectionValueNames = new Set();
  const sectionTypeNames = new Set();
  const dialogValueNames = new Set();
  const dialogTypeNames = new Set();

  for (const statement of sectionStatements) {
    addHelperDeclaration(statement, helperValueNames, helperTypeNames);
    addHelperDeclaration(statement, sectionValueNames, sectionTypeNames);
  }
  for (const statement of dialogStatements) {
    addHelperDeclaration(statement, helperValueNames, helperTypeNames);
    addHelperDeclaration(statement, dialogValueNames, dialogTypeNames);
  }

  const dialogReferences = new Set();
  for (const statement of dialogStatements) collectReferencedIdentifiers(statement, dialogReferences);
  const dialogSectionValueDeps = new Set(
    [...sectionValueNames].filter((name) => dialogReferences.has(name)),
  );
  const dialogSectionTypeDeps = new Set(
    [...sectionTypeNames].filter((name) => dialogReferences.has(name)),
  );

  const sectionReferences = new Set();
  for (const statement of sectionStatements) collectReferencedIdentifiers(statement, sectionReferences);
  const sectionDialogDeps = [
    ...[...dialogValueNames].filter((name) => sectionReferences.has(name)),
    ...[...dialogTypeNames].filter((name) => sectionReferences.has(name)),
  ];
  if (sectionDialogDeps.length) {
    throw new Error(`AdminPage split would create reverse dialog dependencies: ${sectionDialogDeps.join(', ')}`);
  }

  const statementSource = (statement) => source.slice(statement.getFullStart(), statement.end).trim();
  const sectionsBody = exportify(sectionStatements.map(statementSource).join('\n\n'));
  const dialogBody = exportify(dialogStatements.map(statementSource).join('\n\n'));

  const sectionsSource = compactSections(`${imports}\n\n${sectionsBody}`);
  const dialogDependencyImports = importBlock(
    dialogSectionValueDeps,
    dialogSectionTypeDeps,
    '@/pages/admin/AdminPageSections',
  );
  const dialogsSource = compactSections(
    `${imports}${dialogDependencyImports ? `\n${dialogDependencyImports}` : ''}\n\n${dialogBody}`,
  );
  const partsSource = `export * from '@/pages/admin/AdminPageSections';\nexport * from '@/pages/admin/AdminPageDialogs';\n`;

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
  assertUnderLimit('AdminPageDialogs.tsx', dialogsSource);
  assertUnderLimit('AdminPageParts.ts', partsSource);
  assertUnderLimit('useAdminPageController.tsx', controllerSource);
  assertUnderLimit('AdminPageView.tsx', viewSource);
  assertUnderLimit('AdminPage.tsx', wrapperSource);

  write(SECTIONS_PATH, sectionsSource);
  write(DIALOGS_PATH, dialogsSource);
  write(PARTS_PATH, partsSource);
  write(CONTROLLER_PATH, controllerSource);
  write(VIEW_PATH, viewSource);
  write(SOURCE_PATH, wrapperSource);

  console.log('ADMIN_PAGE_STRUCTURE_REFACTORED');
}

main();
