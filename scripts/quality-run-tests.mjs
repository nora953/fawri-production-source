import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function relative(files) {
  return files.map((file) => path.relative(process.cwd(), file).split(path.sep).join("/"));
}

function classify(group) {
  if (group === "server-unit") {
    return {
      runner: ["pnpm", ["exec", "tsx", "--test", "--test-concurrency=1"]],
      files: relative(walk("artifacts/api-server/tests")).filter(
        (file) => file.endsWith(".test.ts") && !file.includes("observability"),
      ),
    };
  }
  if (group === "server-integration") {
    return {
      runner: ["node", ["--test", "--test-concurrency=1"]],
      files: relative(walk("artifacts/api-server/tests")).filter((file) =>
        file.endsWith(".integration.test.mjs"),
      ),
    };
  }
  if (group === "frontend") {
    return {
      runner: ["node", ["--test", "--test-concurrency=1"]],
      files: relative(walk("artifacts/fawri/tests")).filter((file) => file.endsWith(".test.mjs")),
    };
  }
  if (group === "observability") {
    return {
      runner: ["pnpm", ["exec", "tsx", "--test", "--test-concurrency=1"]],
      files: relative(walk("artifacts/api-server/tests")).filter(
        (file) => file.includes("observability") && file.endsWith(".test.ts"),
      ),
    };
  }

  const scriptTests = relative(walk("scripts")).filter((file) => file.endsWith(".test.mjs"));
  const migrationPattern = /(migration|postgresql|transitional|overlay|locked)/i;
  const browserStoragePattern = /browser-operational-storage/i;
  const qualityPattern = /(?:^|\/)(?:quality|security|backup|restore)-/i;

  if (group === "migration") {
    return {
      runner: ["node", ["--test", "--test-concurrency=1"]],
      files: scriptTests.filter((file) => migrationPattern.test(file) && !qualityPattern.test(file)),
    };
  }
  if (group === "browser-storage") {
    return {
      runner: ["node", ["--test", "--test-concurrency=1"]],
      files: scriptTests.filter((file) => browserStoragePattern.test(file)),
    };
  }
  if (group === "quality-tools") {
    return {
      runner: ["node", ["--test", "--test-concurrency=1"]],
      files: scriptTests.filter((file) => qualityPattern.test(file)),
    };
  }
  if (group === "contracts") {
    return {
      runner: ["node", ["--test", "--test-concurrency=1"]],
      files: scriptTests.filter(
        (file) =>
          !migrationPattern.test(file) &&
          !browserStoragePattern.test(file) &&
          !qualityPattern.test(file),
      ),
    };
  }

  throw new Error(`Unknown test group: ${group}`);
}

function main() {
  const group = process.argv[2];
  if (!group) throw new Error("Usage: node scripts/quality-run-tests.mjs <group>");

  const { runner, files } = classify(group);
  if (files.length === 0) throw new Error(`No tests discovered for group: ${group}`);

  files.sort();
  process.stdout.write(`${group}: discovered ${files.length} test file(s)\n`);
  for (const file of files) process.stdout.write(`- ${file}\n`);

  const [command, baseArgs] = runner;
  const result = spawnSync(command, [...baseArgs, ...files], {
    cwd: process.cwd(),
    env: { ...process.env, CI: process.env.CI ?? "true" },
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

main();
