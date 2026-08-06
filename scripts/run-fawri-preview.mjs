import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, "..");
const apiDir = path.join(workspaceDir, "artifacts", "api-server");
const webDir = path.join(workspaceDir, "artifacts", "fawri");
const webDistDir = path.join(webDir, "dist", "public");
const apiEntry = path.join(apiDir, "dist", "index.mjs");

let activeChild = null;
let stopping = false;
let restartTimer = null;
let restartCount = 0;

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceDir,
      env: process.env,
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${String(code)}${
            signal ? ` and signal ${signal}` : ""
          }`,
        ),
      );
    });
  });
}

async function buildPreview() {
  console.log("[preview] Building API server...");
  await runCommand("pnpm", ["--dir", apiDir, "run", "build"]);

  console.log("[preview] Building frontend...");
  await runCommand("pnpm", ["--dir", webDir, "run", "build"], {
    env: {
      ...process.env,
      PORT: "3000",
      BASE_PATH: "/",
    },
  });
}

function startServer() {
  if (stopping) return;

  console.log(
    `[preview] Starting unified Fawri server on port 8081${
      restartCount > 0 ? ` (restart ${restartCount})` : ""
    }...`,
  );

  activeChild = spawn(
    process.execPath,
    ["--enable-source-maps", apiEntry],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        PORT: "8081",
        FAWRI_WEB_DIST_DIR: webDistDir,
      },
      stdio: "inherit",
      shell: false,
    },
  );

  activeChild.once("error", (error) => {
    console.error("[preview] Server process failed to start:", error);
  });

  activeChild.once("exit", (code, signal) => {
    activeChild = null;

    if (stopping) return;

    restartCount += 1;
    const delayMs = Math.min(10_000, 1_000 * restartCount);
    console.error(
      `[preview] Server exited unexpectedly (code=${String(code)}, signal=${String(
        signal,
      )}). Restarting in ${delayMs}ms...`,
    );

    restartTimer = setTimeout(() => {
      restartTimer = null;
      startServer();
    }, delayMs);
  });
}

function stop(signal) {
  if (stopping) return;
  stopping = true;

  console.log(`[preview] Received ${signal}; stopping unified server...`);

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  if (!activeChild) {
    process.exit(0);
    return;
  }

  const forceTimer = setTimeout(() => {
    activeChild?.kill("SIGKILL");
  }, 5_000);
  forceTimer.unref();

  activeChild.once("exit", () => process.exit(0));
  activeChild.kill("SIGTERM");
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGHUP", () => stop("SIGHUP"));

try {
  await buildPreview();
  startServer();
} catch (error) {
  console.error("[preview] Failed to prepare unified preview:", error);
  process.exit(1);
}
