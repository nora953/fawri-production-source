from pathlib import Path

ROOT = Path("artifacts/api-server")
SRC = ROOT / "src"


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def add_import(path: Path, anchor: str, statement: str, label: str) -> None:
    text = path.read_text(encoding="utf-8")
    if statement in text:
        return
    replace_once(path, anchor, anchor + statement, label)


data_paths = SRC / "lib/dataPaths.ts"
data_paths.write_text(
    '''import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

function resolveApiRoot(): string {
  const candidates = [
    path.resolve(moduleDirectory, ".."),
    path.resolve(moduleDirectory, "../.."),
  ];

  return (
    candidates.find((candidate) =>
      fs.existsSync(path.join(candidate, "package.json")),
    ) || candidates[0]
  );
}

const API_ROOT = resolveApiRoot();

export function getFawriDataDir(): string {
  const configured = String(process.env.FAWRI_DATA_DIR || "").trim();
  const dataDir = configured
    ? path.resolve(configured)
    : process.env.NODE_ENV === "test"
      ? path.resolve(process.cwd(), "data")
      : path.join(API_ROOT, "data");

  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function getFawriDataFilePath(fileName: string): string {
  const normalizedName = path.basename(String(fileName || "").trim());
  if (!normalizedName || normalizedName !== fileName) {
    throw new Error("invalid Fawri data file name");
  }

  return path.join(getFawriDataDir(), normalizedName);
}
''',
    encoding="utf-8",
)

# Authentication database.
auth = SRC / "routes/auth.ts"
add_import(
    auth,
    'import path from "node:path";\n',
    'import { getFawriDataFilePath } from "../lib/dataPaths";\n',
    "auth data path import",
)
replace_once(
    auth,
    '''function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const DB_PATH = getDataFilePath("merchants.json");
''',
    '''const DB_PATH = getFawriDataFilePath("merchants.json");
''',
    "auth database path",
)

# Work monitor database.
monitor = SRC / "services/adminWorkMonitor.ts"
add_import(
    monitor,
    'import path from "node:path";\n',
    'import { getFawriDataFilePath } from "../lib/dataPaths";\n',
    "work monitor data path import",
)
replace_once(
    monitor,
    '''function getSecurityFilePath(): string {
  const merchantCandidates = [
    path.resolve(process.cwd(), "data", "merchants.json"),
    path.resolve(process.cwd(), "..", "data", "merchants.json"),
    path.resolve(process.cwd(), "..", "..", "data", "merchants.json"),
    path.resolve("/home/runner/workspace", "data", "merchants.json"),
  ];
  const existingMerchantDb = merchantCandidates.find((candidate) =>
    fs.existsSync(candidate),
  );
  const dataDir = existingMerchantDb
    ? path.dirname(existingMerchantDb)
    : path.dirname(merchantCandidates[0]);
  return path.join(dataDir, "admin-work-monitor.json");
}

const SECURITY_PATH = getSecurityFilePath();
''',
    '''const SECURITY_PATH = getFawriDataFilePath("admin-work-monitor.json");
''',
    "work monitor database path",
)

# Retention policy database.
retention = SRC / "services/merchantRetentionPolicy.ts"
add_import(
    retention,
    'import path from "node:path";\n',
    'import { getFawriDataFilePath } from "../lib/dataPaths";\n',
    "retention data path import",
)
replace_once(
    retention,
    '''function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

const DB_PATH = getDataFilePath("merchants.json");
''',
    '''const DB_PATH = getFawriDataFilePath("merchants.json");
''',
    "retention database path",
)

# Retention login middleware.
retention_middleware = SRC / "middleware/merchantRetentionAccess.ts"
replace_once(
    retention_middleware,
    'import path from "node:path";\n',
    'import { getFawriDataFilePath } from "../lib/dataPaths";\n',
    "retention middleware data path import",
)
replace_once(
    retention_middleware,
    '''function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return candidates[0];
}

''',
    "",
    "retention middleware path resolver",
)
replace_once(
    retention_middleware,
    '  const dbPath = getDataFilePath("merchants.json");\n',
    '  const dbPath = getFawriDataFilePath("merchants.json");\n',
    "retention middleware database path",
)

# Bot runtime database.
routes_index = SRC / "routes/index.ts"
replace_once(
    routes_index,
    'import path from "node:path";\n',
    'import { getFawriDataDir, getFawriDataFilePath } from "../lib/dataPaths";\n',
    "runtime database path import",
)
replace_once(
    routes_index,
    '''const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "fawri-runtime-db.json");
''',
    '''const DB_DIR = getFawriDataDir();
const DB_PATH = getFawriDataFilePath("fawri-runtime-db.json");
''',
    "runtime database path",
)

# Saved answers database.
saved_answers = SRC / "routes/saved-answers.ts"
add_import(
    saved_answers,
    'import path from "node:path";\n',
    'import { getFawriDataFilePath } from "../lib/dataPaths";\n',
    "saved answers data path import",
)
replace_once(
    saved_answers,
    '''function getDataDir(): string {
  const cwd = process.cwd();

  const candidates = [
    path.resolve(cwd, "data"),
    path.resolve(cwd, "../../data"),
    path.resolve(cwd, "../data"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  fs.mkdirSync(candidates[0], { recursive: true });
  return candidates[0];
}

function getDbPath(): string {
  return path.join(getDataDir(), "saved-answers.json");
}

''',
    '''const DB_PATH = getFawriDataFilePath("saved-answers.json");

''',
    "saved answers database path",
)
text = saved_answers.read_text(encoding="utf-8")
count = text.count("const filePath = getDbPath();")
if count != 2:
    raise SystemExit(f"saved answers file path use: expected 2 matches, found {count}")
saved_answers.write_text(
    text.replace("const filePath = getDbPath();", "const filePath = DB_PATH"),
    encoding="utf-8",
)

# Training and learned-answer databases.
bot_training = SRC / "routes/bot-training.ts"
add_import(
    bot_training,
    'import path from "path";\n',
    'import { getFawriDataFilePath } from "../lib/dataPaths";\n',
    "bot training data path import",
)
replace_once(
    bot_training,
    '''function getDataFilePath(fileName: string): string {
  const candidates = [
    path.resolve(process.cwd(), "data", fileName),
    path.resolve(process.cwd(), "..", "data", fileName),
    path.resolve(process.cwd(), "..", "..", "data", fileName),
    path.resolve("/home/runner/workspace", "data", fileName),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

''',
    "",
    "bot training path resolver",
)
text = bot_training.read_text(encoding="utf-8")
count = text.count("getDataFilePath(")
if count != 4:
    raise SystemExit(f"bot training file path use: expected 4 matches, found {count}")
bot_training.write_text(
    text.replace("getDataFilePath(", "getFawriDataFilePath("),
    encoding="utf-8",
)

# Log the canonical data directory at startup for future diagnostics.
index = SRC / "index.ts"
add_import(
    index,
    'import { logger } from "./lib/logger";\n',
    'import { getFawriDataDir } from "./lib/dataPaths";\n',
    "startup data path import",
)
replace_once(
    index,
    '  logger.info({ port }, "Server listening");\n',
    '  logger.info({ port, dataDir: getFawriDataDir() }, "Server listening");\n',
    "startup data path log",
)

# Regression test: the server must ignore an empty data directory under cwd.
test_path = ROOT / "tests/data-path.integration.test.mjs"
test_path.write_text(
    '''import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(testDir, "..");
const sourceDist = path.join(apiRoot, "dist");

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForServer(baseUrl, child, logs) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`API exited early.\\n${logs()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/healthz`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not become ready.\\n${logs()}`);
}

async function login(baseUrl, phone, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password }),
  });
  return { response, body: await response.json().catch(() => null) };
}

test("API data path is independent from process cwd", async (t) => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), "fawri-data-path-"));
  const isolatedApiRoot = path.join(runtimeRoot, "api-server");
  const canonicalDataDir = path.join(isolatedApiRoot, "data");
  const wrongCwd = path.join(runtimeRoot, "wrong-cwd");
  const shadowDataDir = path.join(wrongCwd, "data");

  await mkdir(canonicalDataDir, { recursive: true });
  await mkdir(shadowDataDir, { recursive: true });
  await cp(sourceDist, path.join(isolatedApiRoot, "dist"), { recursive: true });
  await writeFile(
    path.join(isolatedApiRoot, "package.json"),
    JSON.stringify({ name: "@workspace/api-server", type: "module" }),
  );

  const baseAccount = {
    activity_type: "test",
    status: "approved",
    language: "en",
    theme_preference: "auto",
    created_at: "2026-08-03T00:00:00.000Z",
    otp_verified: true,
    warning_stage: 0,
    retention_status: "protected",
  };
  const canonicalDb = {
    merchants: [
      {
        ...baseAccount,
        id: "owner-admin",
        owner_name: "Owner",
        store_name: "Fawri Admin",
        phone: "07111111111",
        password: "OwnerPass1@",
        is_admin: true,
        admin_role: "owner_admin",
        admin_enabled: true,
      },
      {
        ...baseAccount,
        id: "merchant-one",
        owner_name: "Merchant",
        store_name: "Merchant Store",
        phone: "07222222222",
        password: "Merchant1@",
        account_status: "approved",
      },
    ],
    subscriptions: [],
    otps: [],
    admin_logs: [],
    merchant_notifications: [],
    support_tickets: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  };
  const shadowDb = {
    merchants: [],
    subscriptions: [],
    otps: [],
    admin_logs: [],
    merchant_notifications: [],
    support_tickets: [],
    deletion_requests: [],
    channel_overrides: {},
    admin_notes: {},
  };

  await writeFile(
    path.join(canonicalDataDir, "merchants.json"),
    JSON.stringify(canonicalDb, null, 2),
  );
  await writeFile(
    path.join(shadowDataDir, "merchants.json"),
    JSON.stringify(shadowDb, null, 2),
  );

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let output = "";
  const child = spawn(
    process.execPath,
    [path.join(isolatedApiRoot, "dist/index.mjs")],
    {
      cwd: wrongCwd,
      env: {
        ...process.env,
        NODE_ENV: "development",
        PORT: String(port),
        LOG_LEVEL: "silent",
        BOT_DEBUG: "false",
        FAWRI_PASSWORD_SALT: "data-path-test-salt",
        FAWRI_ADMIN_SESSION_SECRET: "data-path-test-secret",
        FAWRI_ADMIN_PHONE: "07111111111",
        FAWRI_ADMIN_DEVICE_TRUST_ENFORCED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await rm(runtimeRoot, { recursive: true, force: true });
  });

  await waitForServer(baseUrl, child, () => output);

  const ownerLogin = await login(baseUrl, "07111111111", "OwnerPass1@");
  assert.equal(ownerLogin.response.status, 200);
  assert.equal(ownerLogin.body.merchant.id, "owner-admin");

  const merchantLogin = await login(baseUrl, "07222222222", "Merchant1@");
  assert.equal(merchantLogin.response.status, 200);
  assert.equal(merchantLogin.body.merchant.id, "merchant-one");

  const untouchedShadow = JSON.parse(
    await readFile(path.join(shadowDataDir, "merchants.json"), "utf8"),
  );
  assert.equal(untouchedShadow.merchants.length, 0);

  const canonicalAfterLogin = JSON.parse(
    await readFile(path.join(canonicalDataDir, "merchants.json"), "utf8"),
  );
  assert.equal(canonicalAfterLogin.merchants.length, 2);
});
''',
    encoding="utf-8",
)

package_json = ROOT / "package.json"
replace_once(
    package_json,
    '    "test:admin-work-monitor": "node ./build.mjs && node --test ./tests/admin-work-monitor.integration.test.mjs"\n',
    '    "test:admin-work-monitor": "node ./build.mjs && node --test ./tests/admin-work-monitor.integration.test.mjs",\n    "test:data-path": "node ./build.mjs && node --test ./tests/data-path.integration.test.mjs"\n',
    "data path test script",
)

# No service may choose storage from cwd anymore. The only allowed cwd use is
# the intentional NODE_ENV=test compatibility fallback in the central helper.
leftovers = []
for path_item in SRC.rglob("*.ts"):
    if path_item == data_paths:
        continue
    text = path_item.read_text(encoding="utf-8")
    if "process.cwd()" in text:
        leftovers.append(str(path_item))

if leftovers:
    raise SystemExit(
        "Unfixed process.cwd() data paths remain:\n" + "\n".join(leftovers)
    )

print("Canonical API data path fix applied.")
