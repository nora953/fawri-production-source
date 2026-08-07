import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactSensitiveText, summarizeFindings } from "./security-redaction-lib.mjs";

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error("Usage: node scripts/ci-run-redacted.mjs [--label name] -- <command> [args...]");
  }

  let label = "ci-command";
  const options = argv.slice(0, separator);
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--label") {
      label = options[index + 1] ?? label;
      index += 1;
    }
  }

  return { label, command: argv[separator + 1], args: argv.slice(separator + 2) };
}

async function main() {
  const { label, command, args } = parseArguments(process.argv.slice(2));
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "fawri-ci-log-"));
  const logPath = path.join(tempDir, "command.log");
  const chunks = [];

  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: process.cwd(),
        env: { ...process.env, CI: process.env.CI ?? "true" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (signal) {
          chunks.push(Buffer.from(`\nProcess terminated by signal ${signal}\n`));
          resolve(128);
          return;
        }
        resolve(code ?? 1);
      });
    });

    writeFileSync(logPath, Buffer.concat(chunks));
    const raw = readFileSync(logPath, "utf8");
    const { text, findings } = redactSensitiveText(raw, { includePii: true });

    process.stdout.write(`::group::${label}\n`);
    process.stdout.write(text);
    if (!text.endsWith("\n")) process.stdout.write("\n");
    process.stdout.write("::endgroup::\n");

    if (findings.length > 0) {
      process.stderr.write(
        `${label}: blocked sensitive log content ${JSON.stringify(summarizeFindings(findings))}\n`,
      );
      process.exitCode = 86;
      return;
    }

    process.exitCode = exitCode;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "unknown CI wrapper error";
  process.stderr.write(`ci-run-redacted failed: ${message}\n`);
  process.exitCode = 1;
});
