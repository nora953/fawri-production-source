import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { getFawriDataDir } from "../lib/dataPaths";

export const CATALOG_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

const IMAGE_MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CatalogImageMime = keyof typeof IMAGE_MIME_TO_EXTENSION;
export type CatalogMediaStorageProviderName = "filesystem";

export type CatalogMediaUpload = {
  storage_key: string;
  preview_url: string;
  mime_type: CatalogImageMime;
  size_bytes: number;
  sha256: string;
};

export type CatalogMediaRead = {
  buffer: Buffer;
  mime_type: CatalogImageMime;
  sha256: string;
};

export class CatalogMediaError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "CatalogMediaError";
    this.code = code;
    this.status = status;
  }
}

export interface CatalogMediaStorageProvider {
  put(storageKey: string, buffer: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
}

function mediaRoot(): string {
  return path.join(getFawriDataDir(), "catalog-media");
}

function resolveStoragePath(storageKey: string): string {
  const root = path.resolve(mediaRoot());
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new CatalogMediaError(
      "CATALOG_MEDIA_STORAGE_KEY_INVALID",
      "catalog media storage key is invalid",
      400,
    );
  }
  return resolved;
}

const filesystemProvider: CatalogMediaStorageProvider = {
  async put(storageKey, buffer) {
    const destination = resolveStoragePath(storageKey);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, buffer, { flag: "wx" });
    fs.renameSync(temporary, destination);
  },
  async read(storageKey) {
    const source = resolveStoragePath(storageKey);
    try {
      return fs.readFileSync(source);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
      throw error;
    }
  },
  async remove(storageKey) {
    fs.rmSync(resolveStoragePath(storageKey), { force: true });
  },
};

export function catalogMediaStorageProviderName(): string {
  return String(
    process.env.FAWRI_CATALOG_MEDIA_STORAGE_PROVIDER || "filesystem",
  )
    .trim()
    .toLowerCase();
}

function storageProviderByName(providerValue: unknown): CatalogMediaStorageProvider {
  const provider = String(providerValue || "").trim().toLowerCase();
  if (provider === "filesystem") return filesystemProvider;

  throw new CatalogMediaError(
    "CATALOG_MEDIA_STORAGE_PROVIDER_UNAVAILABLE",
    "configured catalog media storage provider is unavailable",
    503,
  );
}

function storageProvider(): CatalogMediaStorageProvider {
  return storageProviderByName(catalogMediaStorageProviderName());
}

function merchantStoragePrefix(merchantId: string): string {
  const normalized = String(merchantId || "").trim();
  if (!normalized) {
    throw new CatalogMediaError(
      "CATALOG_MEDIA_MERCHANT_REQUIRED",
      "merchant identity is required for catalog media",
      401,
    );
  }
  const merchantHash = crypto
    .createHash("sha256")
    .update(normalized, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `merchant/${merchantHash}/`;
}

function assertMerchantStorageKey(
  merchantId: string,
  storageKeyValue: unknown,
): string {
  const storageKey = String(storageKeyValue || "").trim();
  if (
    !storageKey ||
    storageKey.length > 512 ||
    storageKey.includes("\\") ||
    storageKey.includes("..") ||
    !storageKey.startsWith(merchantStoragePrefix(merchantId))
  ) {
    throw new CatalogMediaError(
      "CATALOG_MEDIA_ACCESS_FORBIDDEN",
      "catalog media does not belong to this merchant",
      403,
    );
  }
  return storageKey;
}

export function detectCatalogImageMime(buffer: Buffer): CatalogImageMime | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function mimeFromStorageKey(storageKey: string): CatalogImageMime {
  if (storageKey.endsWith(".jpg")) return "image/jpeg";
  if (storageKey.endsWith(".png")) return "image/png";
  if (storageKey.endsWith(".webp")) return "image/webp";
  throw new CatalogMediaError(
    "CATALOG_MEDIA_STORAGE_KEY_INVALID",
    "catalog media storage key has an unsupported image extension",
    400,
  );
}

function previewUrl(storageKey: string): string {
  return `/api/catalog/media/images?storage_key=${encodeURIComponent(storageKey)}`;
}

export async function storeCatalogImage(params: {
  merchantId: string;
  buffer: Buffer;
  suppliedMime: unknown;
}): Promise<CatalogMediaUpload> {
  if (!Buffer.isBuffer(params.buffer) || params.buffer.length === 0) {
    throw new CatalogMediaError(
      "CATALOG_IMAGE_REQUIRED",
      "catalog image is required",
      400,
    );
  }
  if (params.buffer.length > CATALOG_IMAGE_MAX_BYTES) {
    throw new CatalogMediaError(
      "CATALOG_IMAGE_TOO_LARGE",
      "catalog image is too large",
      413,
    );
  }

  const suppliedMime = String(params.suppliedMime || "") as CatalogImageMime;
  if (!(suppliedMime in IMAGE_MIME_TO_EXTENSION)) {
    throw new CatalogMediaError(
      "CATALOG_IMAGE_TYPE_UNSUPPORTED",
      "catalog image type is unsupported",
      415,
    );
  }

  const detectedMime = detectCatalogImageMime(params.buffer);
  if (!detectedMime || detectedMime !== suppliedMime) {
    throw new CatalogMediaError(
      "CATALOG_IMAGE_TYPE_MISMATCH",
      "catalog image content does not match its content type",
      415,
    );
  }

  const extension = IMAGE_MIME_TO_EXTENSION[detectedMime];
  const storageKey = `${merchantStoragePrefix(params.merchantId)}${crypto.randomUUID()}.${extension}`;
  const provider = storageProvider();
  await provider.put(storageKey, params.buffer);

  return {
    storage_key: storageKey,
    preview_url: previewUrl(storageKey),
    mime_type: detectedMime,
    size_bytes: params.buffer.length,
    sha256: crypto.createHash("sha256").update(params.buffer).digest("hex"),
  };
}

export async function readCatalogImage(params: {
  merchantId: string;
  storageKey: unknown;
}): Promise<CatalogMediaRead> {
  const storageKey = assertMerchantStorageKey(
    params.merchantId,
    params.storageKey,
  );
  const provider = storageProvider();
  const buffer = await provider.read(storageKey);
  if (!buffer) {
    throw new CatalogMediaError(
      "CATALOG_IMAGE_NOT_FOUND",
      "catalog image was not found",
      404,
    );
  }

  const expectedMime = mimeFromStorageKey(storageKey);
  const detectedMime = detectCatalogImageMime(buffer);
  if (!detectedMime || detectedMime !== expectedMime) {
    throw new CatalogMediaError(
      "CATALOG_IMAGE_CORRUPT",
      "catalog image content is invalid",
      503,
    );
  }

  return {
    buffer,
    mime_type: detectedMime,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function removeCatalogImage(params: {
  merchantId: string;
  storageKey: unknown;
}): Promise<void> {
  const storageKey = assertMerchantStorageKey(
    params.merchantId,
    params.storageKey,
  );
  await storageProvider().remove(storageKey);
}

export async function removeCatalogMediaStorageObject(params: {
  storageProvider: unknown;
  storageKey: unknown;
}): Promise<void> {
  const storageKey = String(params.storageKey || "").trim();
  if (!storageKey || storageKey.length > 1024) {
    throw new CatalogMediaError(
      "CATALOG_MEDIA_STORAGE_KEY_INVALID",
      "catalog media storage key is invalid",
      400,
    );
  }
  await storageProviderByName(params.storageProvider).remove(storageKey);
}
