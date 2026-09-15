import fs from "node:fs";
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
