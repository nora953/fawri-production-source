import fs from "node:fs";
import path from "node:path";

import { getFawriDataDir } from "../lib/dataPaths";

export type SupportImageStorageProviderName = "filesystem";

export class SupportImageStorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SupportImageStorageError";
    this.code = code;
  }
}

function supportImageRoot(): string {
  return path.join(getFawriDataDir(), "support-images");
}

function assertSinglePathSegment(value: unknown): string {
  const segment = String(value || "").trim();
  if (
    !segment ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    path.basename(segment) !== segment
  ) {
    throw new SupportImageStorageError(
      "SUPPORT_IMAGE_STORAGE_INVALID",
      "support image storage key is invalid",
    );
  }
  return segment;
}

function resolveStoragePath(storageKeyValue: unknown): string {
  const storageKey = String(storageKeyValue || "").trim().replace(/\\/g, "/");
  const pieces = storageKey.split("/").filter(Boolean);
  if (
    pieces.length !== 2 ||
    pieces.some(
      (piece) =>
        piece === "." ||
        piece === ".." ||
        path.basename(piece) !== piece,
    )
  ) {
    throw new SupportImageStorageError(
      "SUPPORT_IMAGE_STORAGE_INVALID",
      "support image storage key is invalid",
    );
  }

  const root = path.resolve(supportImageRoot());
  const resolved = path.resolve(root, pieces[0]!, pieces[1]!);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new SupportImageStorageError(
      "SUPPORT_IMAGE_STORAGE_INVALID",
      "support image storage key is invalid",
    );
  }
  return resolved;
}

function assertFilesystemProvider(value: unknown): void {
  const provider = String(value || "").trim().toLowerCase();
  if (provider !== "filesystem") {
    throw new SupportImageStorageError(
      "SUPPORT_IMAGE_PROVIDER_UNAVAILABLE",
      "support image storage provider is unavailable",
    );
  }
}

export async function removeSupportImageStorageObject(input: {
  storageProvider: unknown;
  storageKey: unknown;
}): Promise<void> {
  assertFilesystemProvider(input.storageProvider);
  fs.rmSync(resolveStoragePath(input.storageKey), { force: true });
}

export async function removeSupportTicketImageStoragePrefix(input: {
  storageProvider: unknown;
  ticketId: unknown;
}): Promise<void> {
  assertFilesystemProvider(input.storageProvider);
  const ticketId = assertSinglePathSegment(input.ticketId);
  const root = path.resolve(supportImageRoot());
  const directory = path.resolve(root, ticketId);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new SupportImageStorageError(
      "SUPPORT_IMAGE_STORAGE_INVALID",
      "support image storage key is invalid",
    );
  }
  fs.rmSync(directory, { recursive: true, force: true });
}
