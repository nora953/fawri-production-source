import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, "..");
const apiDir = path.join(workspaceDir, "artifacts", "api-server");
const webDir = path.join(workspaceDir, "artifacts", "fawri");
const webDistDir = path.join(webDir, "dist", "public");
const apiEntry = path.join(apiDir, "dist", "index.mjs");
const lockId = crypto.createHash("sha256").update(workspaceDir).digest("hex").slice(0, 16);
const lockPath = path.join(os.tmpdir(), `fawri-preview-${lockId}.pid`);

let activeChild = null;
let stopping = false;
let restartTimer = null;
let restartCount = 0;
let lockHeld = false;

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquirePreviewLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(lockPath, `${process.pid}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      lockHeld = true;
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      const existingPid = Number(
        String(fs.readFileSync(lockPath, "utf8") || "").trim(),
      );
      if (processAlive(existingPid)) {
        throw new Error(
          `Another Fawri preview is already running for this workspace (pid=${existingPid}). Stop it before starting a second preview.`,
        );
      }

      fs.rmSync(lockPath, { force: true });
    }
  }

  throw new Error("Unable to acquire the Fawri preview singleton lock");
}

function releasePreviewLock() {
  if (!lockHeld) return;
  lockHeld = false;
  try {
    const ownerPid = Number(
      String(fs.readFileSync(lockPath, "utf8") || "").trim(),
    );
    if (ownerPid === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    // A stale/missing lock is safe to ignore during shutdown.
  }
}

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

function previewServerEnv() {
  const env = {
    ...process.env,
    PORT: "8081",
    FAWRI_WEB_DIST_DIR: webDistDir,
  };

  if (process.env.NODE_ENV !== "production") {
    env.AUTH_ALLOW_DEV_OTP_BYPASS =
      process.env.AUTH_ALLOW_DEV_OTP_BYPASS || "true";
    env.AUTH_INCLUDE_DEV_CODE = process.env.AUTH_INCLUDE_DEV_CODE || "true";
  }

  return env;
}

function startServer() {
  if (stopping) return;

  console.log(
    `[preview] Starting unified Fawri server on port 8081${
      restartCount > 0 ? ` (restart ${restartCount})` : ""
    }...`,
  );

  if (process.env.NODE_ENV !== "production") {
    console.log(
      "[preview] Development OTP delivery bypass is enabled for local preview only; production behavior remains fail-closed.",
    );
  }

  activeChild = spawn(
    process.execPath,
    ["--enable-source-maps", apiEntry],
    {
      cwd: apiDir,
      env: previewServerEnv(),
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
    releasePreviewLock();
    process.exit(0);
    return;
  }

  const forceTimer = setTimeout(() => {
    activeChild?.kill("SIGKILL");
  }, 5_000);
  forceTimer.unref();

  activeChild.once("exit", () => {
    releasePreviewLock();
    process.exit(0);
  });
  activeChild.kill("SIGTERM");
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGHUP", () => stop("SIGHUP"));
process.on("exit", releasePreviewLock);

try {
  acquirePreviewLock();
  await buildPreview();
  startServer();
} catch (error) {
  releasePreviewLock();
  console.error("[preview] Failed to prepare unified preview:", error);
  process.exit(1);
}
