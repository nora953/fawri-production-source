import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const statementDelimiter = "--> statement-breakpoint\n";

function normalizedColumns(value) {
  return value
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .join(",");
}

function uniqueTarget(statement) {
  const match = statement
    .trim()
    .match(
      /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" UNIQUE\(([^)]+)\);$/,
    );
  if (!match) return null;
  return {
    table: match[1],
    constraint: match[2],
    columns: normalizedColumns(match[3]),
  };
}

function foreignKeyTarget(statement) {
  const match = statement
    .trim()
    .match(
      /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \(([^)]+)\) REFERENCES "public"\."([^"]+)"\(([^)]+)\)/,
    );
  if (!match) return null;
  return {
    sourceTable: match[1],
    constraint: match[2],
    sourceColumns: normalizedColumns(match[3]),
    targetTable: match[4],
    targetColumns: normalizedColumns(match[5]),
  };
}

export function stabilizeMigrationDependencyOrder(sql) {
  const statements = sql.split(statementDelimiter);
  const foreignKeys = statements
    .map((statement, index) => ({ index, target: foreignKeyTarget(statement) }))
    .filter((item) => item.target);
  if (foreignKeys.length === 0) return sql;

  const referencedKeys = new Set(
    foreignKeys.map(
      ({ target }) => `${target.targetTable}:${target.targetColumns}`,
    ),
  );
  const requiredUniques = statements
    .map((statement, index) => ({ index, statement, target: uniqueTarget(statement) }))
    .filter(
      (item) =>
        item.target && referencedKeys.has(`${item.target.table}:${item.target.columns}`),
    );
  if (requiredUniques.length === 0) return sql;

  const requiredIndexes = new Set(requiredUniques.map((item) => item.index));
  const remaining = statements.filter((_, index) => !requiredIndexes.has(index));
  const firstRelevantForeignKey = remaining.findIndex((statement) => {
    const target = foreignKeyTarget(statement);
    return (
      target && referencedKeys.has(`${target.targetTable}:${target.targetColumns}`)
    );
  });
  if (firstRelevantForeignKey < 0) return sql;

  remaining.splice(
    firstRelevantForeignKey,
    0,
    ...requiredUniques.map((item) => item.statement),
  );
  const stabilized = remaining.join(statementDelimiter);

  const originalStatements = [...statements].sort();
  const stabilizedStatements = stabilized.split(statementDelimiter).sort();
  if (JSON.stringify(originalStatements) !== JSON.stringify(stabilizedStatements)) {
    throw new Error("Migration dependency stabilization changed SQL statements");
  }
  return stabilized;
}

export function createStabilizedMigrationFolder(sourceFolder) {
  const destination = fs.mkdtempSync(
    path.join(os.tmpdir(), "fawri-drizzle-stabilized-"),
  );
  const metaSource = path.join(sourceFolder, "meta");
  const metaDestination = path.join(destination, "meta");
  fs.mkdirSync(metaDestination, { recursive: true });

  for (const entry of fs.readdirSync(sourceFolder, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".sql")) continue;
    const sourcePath = path.join(sourceFolder, entry.name);
    const destinationPath = path.join(destination, entry.name);
    const raw = fs.readFileSync(sourcePath, "utf8");
    fs.writeFileSync(
      destinationPath,
      stabilizeMigrationDependencyOrder(raw),
      "utf8",
    );
  }

  for (const entry of fs.readdirSync(metaSource, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    fs.copyFileSync(
      path.join(metaSource, entry.name),
      path.join(metaDestination, entry.name),
    );
  }

  return destination;
}
