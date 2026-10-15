import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(testDirectory, "../..");
const plannerPath = path.join(
  repositoryRoot,
  "scripts",
  "plan-postgresql-migration.mjs",
);
const snapshotPath = path.join(
  repositoryRoot,
  "lib",
  "db",
  "drizzle",
  "meta",
  "0000_snapshot.json",
);

const functionTableMap = new Map([
  ["mapAccount", "accounts"],
  ["mapMerchant", "merchants"],
  ["mapAdminProfile", "admin_profiles"],
]);

function propertyName(node) {
  if (
    ts.isIdentifier(node) ||
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node)
  ) {
    return node.text;
  }
  return null;
}

function unwrapObjectLiteral(expression) {
  let current = expression;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return ts.isObjectLiteralExpression(current) ? current : null;
}

function objectKeys(objectLiteral) {
  const keys = new Set();
  for (const property of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property) ||
      ts.isGetAccessorDeclaration(property) ||
      ts.isSetAccessorDeclaration(property)
    ) {
      const key = propertyName(property.name);
      if (key) keys.add(key);
    }
  }
  return keys;
}

function findReturnedObject(functionNode) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isReturnStatement(node) && node.expression) {
      found = unwrapObjectLiteral(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(functionNode.body);
  return found;
}

function collectPlannerShapes(sourceFile) {
  const shapes = new Map();
  const addShape = (tableName, objectLiteral, location) => {
    if (!tableName || !objectLiteral) return;
    const entries = shapes.get(tableName) || [];
    entries.push({ keys: objectKeys(objectLiteral), location });
    shapes.set(tableName, entries);
  };

  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      const tableName = functionTableMap.get(node.name.text);
      if (tableName) {
        addShape(
          tableName,
          findReturnedObject(node),
          `function ${node.name.text}`,
        );
      }
    }

    if (ts.isCallExpression(node)) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "push" &&
        ts.isPropertyAccessExpression(node.expression.expression) &&
        ts.isIdentifier(node.expression.expression.expression) &&
        node.expression.expression.expression.text === "rows"
      ) {
        addShape(
          node.expression.expression.name.text,
          node.arguments[0]
            ? unwrapObjectLiteral(node.arguments[0])
            : null,
          `rows.${node.expression.expression.name.text}.push`,
        );
      }

      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "mapMerchantScoped" &&
        node.arguments.length >= 3 &&
        ts.isStringLiteral(node.arguments[1]) &&
        ts.isArrowFunction(node.arguments[2])
      ) {
        addShape(
          node.arguments[1].text,
          unwrapObjectLiteral(node.arguments[2].body),
          `mapMerchantScoped(${node.arguments[1].text})`,
        );
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return shapes;
}

function requiredInsertColumns(table) {
  return Object.values(table.columns)
    .filter(
      (column) =>
        column.notNull === true &&
        !("default" in column) &&
        !column.identity,
    )
    .map((column) => column.name)
    .sort();
}

test("migration planner row shapes match the committed Drizzle schema", () => {
  const sourceText = fs.readFileSync(plannerPath, "utf8");
  const sourceFile = ts.createSourceFile(
    plannerPath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const shapes = collectPlannerShapes(sourceFile);

  assert.ok(shapes.size > 0, "no migration planner row shapes were detected");

  const failures = [];
  for (const [tableName, tableShapes] of shapes) {
    const table = snapshot.tables[`public.${tableName}`];
    if (!table) {
      failures.push(`${tableName}: table does not exist in Drizzle snapshot`);
      continue;
    }

    const actualColumns = new Set(
      Object.values(table.columns).map((column) => column.name),
    );
    const requiredColumns = requiredInsertColumns(table);

    for (const shape of tableShapes) {
      const missing = requiredColumns.filter((column) => !shape.keys.has(column));
      const unknown = [...shape.keys]
        .filter((column) => !actualColumns.has(column))
        .sort();

      if (missing.length > 0) {
        failures.push(
          `${tableName} (${shape.location}) missing required columns: ${missing.join(", ")}`,
        );
      }
      if (unknown.length > 0) {
        failures.push(
          `${tableName} (${shape.location}) contains unknown columns: ${unknown.join(", ")}`,
        );
      }
    }
  }

  assert.deepEqual(failures, [], failures.join("\n"));
});
