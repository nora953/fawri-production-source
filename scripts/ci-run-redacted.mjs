import { spawn } from "node:child_process";
import { redactSensitiveText, summarizeFindings } from "./security-ci-lib.mjs";

const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

function parseArguments(argv) {
  const separator = argv.indexOf("--");
  if (separator < 0 || separator === argv.length - 1) {
    throw new Error("Usage: node scripts/ci-run-redacted.mjs [--label name] -- <command> [args...]");
  }

  let label = "ci-command";
  const options = argv.slice(0, separator);
  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--label") {
      if (!options[index + 1]) throw new Error("--label requires a value");
      label = options[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${options[index]}`);
  }

  return { label, command: argv[separator + 1], args: argv.slice(separator + 2) };
}

async function runCommand(command, args) {
  const chunks = [];
  let capturedBytes = 0;
  let overflowed = false;

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env, CI: process.env.CI ?? "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const capture = (chunk) => {
      if (overflowed) return;
      const buffer = Buffer.from(chunk);
      capturedBytes += buffer.length;
      if (capturedBytes > MAX_CAPTURE_BYTES) {
        overflowed = true;
        child.kill("SIGTERM");
        return;
      }
      chunks.push(buffer);
    };

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolve({
        exitCode: signal ? 128 : (code ?? 1),
        raw: Buffer.concat(chunks).toString("utf8"),
        overflowed,
      });
    });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const { label, command, args } = parseArguments(argv);
  const { exitCode, raw, overflowed } = await runCommand(command, args);
  const { text, findings } = redactSensitiveText(raw, { includePrivateData: true, includeAssignments: true });

  process.stdout.write(`::group::${label}\n`);
  process.stdout.write(text);
  if (text && !text.endsWith("\n")) process.stdout.write("\n");
  process.stdout.write("::endgroup::\n");

  if (overflowed) {
    process.stderr.write(`${label}: blocked command output larger than ${MAX_CAPTURE_BYTES} bytes\n`);
    return 87;
  }
  if (findings.length > 0) {
    process.stderr.write(`${label}: blocked sensitive log content ${JSON.stringify(summarizeFindings(findings))}\n`);
    return 86;
  }
  return exitCode;
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "unknown CI wrapper error";
      process.stderr.write(`ci-run-redacted failed: ${message}\n`);
      process.exitCode = 1;
    });
}
