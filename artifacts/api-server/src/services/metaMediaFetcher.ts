import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

import {
  detectCatalogImageMime,
  type CatalogImageMime,
} from "./catalogMediaStorage.js";

export const META_MEDIA_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const DEFAULT_META_MEDIA_TIMEOUT_MS = 15_000;

export type MetaFetchedImage = {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

type MetaResolvedAddress = {
  address: string;
  family: number;
};

type MetaPinnedTransportRequest = {
  url: string;
  hostname: string;
  address: string;
  family: number;
  signal: AbortSignal;
};

type MetaPinnedTransport = (
  request: MetaPinnedTransportRequest,
) => Promise<Response>;

type MetaMediaFetcherOptions = {
  fetchImpl?: typeof fetch;
  transportImpl?: MetaPinnedTransport;
  timeoutMs?: number;
  resolveHost?: (hostname: string) => Promise<MetaResolvedAddress[]>;
};

function codedError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function safeMediaUrl(value: unknown): URL {
  const raw = typeof value === "string" ? value.trim() : "";
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw codedError("Meta media URL is invalid", "META_MEDIA_URL_INVALID");
  }

  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password
  ) {
    throw codedError("Meta media URL is invalid", "META_MEDIA_URL_INVALID");
  }

  return parsed;
}

function ipv4IsForbidden(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6IsForbidden(address: string): boolean {
  const raw = address.toLowerCase().split("%", 1)[0];
  let normalized = raw;

  try {
    const canonical = new URL(`https://[${raw}]/`).hostname;
    normalized = canonical.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return true;
  }

  if (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("ff") ||
    /^fe[89ab]/.test(normalized) ||
    /^fe[c-f]/.test(normalized)
  ) {
    return true;
  }

  const mapped = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return ipv4IsForbidden(mapped[1]);

  const mappedHex = normalized.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/,
  );
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);

    const mappedIpv4 = [
      (high >> 8) & 0xff,
      high & 0xff,
      (low >> 8) & 0xff,
      low & 0xff,
    ].join(".");

    return ipv4IsForbidden(mappedIpv4);
  }

  return false;
}

function addressIsForbidden(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4IsForbidden(address);
  if (family === 6) return ipv6IsForbidden(address);
  return true;
}

async function defaultResolveHost(
  hostname: string,
): Promise<MetaResolvedAddress[]> {
  return lookup(hostname, {
    all: true,
    verbatim: true,
  });
}

async function defaultPinnedTransport(
  input: MetaPinnedTransportRequest,
): Promise<Response> {
  const url = new URL(input.url);

  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: input.address,
        family: input.family,
        port: url.port ? Number(url.port) : 443,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        servername: isIP(input.hostname) ? undefined : input.hostname,
        headers: {
          host: url.port ? `${input.hostname}:${url.port}` : input.hostname,
        },
        signal: input.signal,
      },
      (response) => {
        try {
          const headers = new Headers();

          for (const [name, value] of Object.entries(response.headers)) {
            if (Array.isArray(value)) {
              for (const entry of value) headers.append(name, entry);
            } else if (value !== undefined) {
              headers.set(name, String(value));
            }
          }

          const status = response.statusCode || 500;
          const bodyAllowed =
            status !== 204 && status !== 205 && status !== 304;

          const body = bodyAllowed
            ? (Readable.toWeb(response) as ReadableStream<Uint8Array>)
            : null;

          if (!bodyAllowed) {
            response.resume();
          }

          resolve(
            new Response(body, {
              status,
              statusText: response.statusMessage || "",
              headers,
            }),
          );
        } catch (error) {
          response.destroy();
          reject(error);
        }
      },
    );

    request.once("error", reject);
    request.end();
  });
}

function requestTimeout(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 60_000) {
    return DEFAULT_META_MEDIA_TIMEOUT_MS;
  }
  return parsed;
}

function imageMime(value: string | null): CatalogImageMime {
  const mime = String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (mime !== "image/jpeg" && mime !== "image/png" && mime !== "image/webp") {
    throw codedError(
      "Meta media MIME type is invalid",
      "META_MEDIA_MIME_INVALID",
    );
  }

  return mime;
}

function declaredLength(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;

  if (!/^\d+$/.test(value.trim())) {
    throw codedError(
      "Meta media content length is invalid",
      "META_MEDIA_FETCH_FAILED",
    );
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw codedError(
      "Meta media content length is invalid",
      "META_MEDIA_FETCH_FAILED",
    );
  }

  return parsed;
}

export class SecureMetaMediaFetcher {
  private readonly transportImpl: MetaPinnedTransport;
  private readonly timeoutMs: number;
  private readonly resolveHost: (
    hostname: string,
  ) => Promise<MetaResolvedAddress[]>;

  constructor(options: MetaMediaFetcherOptions = {}) {
    this.transportImpl =
      options.transportImpl ||
      (options.fetchImpl
        ? async (request) =>
            options.fetchImpl!(request.url, {
              method: "GET",
              redirect: "manual",
              signal: request.signal,
            })
        : defaultPinnedTransport);

    this.timeoutMs = requestTimeout(options.timeoutMs);
    this.resolveHost = options.resolveHost || defaultResolveHost;
  }

  async fetchImage(input: { url: string }): Promise<MetaFetchedImage> {
    const url = safeMediaUrl(input.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    try {
      const literalFamily = isIP(url.hostname.replace(/^\[|\]$/g, ""));
      let verifiedAddress: MetaResolvedAddress;

      if (literalFamily) {
        const literalAddress = url.hostname.replace(/^\[|\]$/g, "");
        if (addressIsForbidden(literalAddress)) {
          throw codedError(
            "Meta media destination is forbidden",
            "META_MEDIA_DESTINATION_FORBIDDEN",
          );
        }

        verifiedAddress = {
          address: literalAddress,
          family: literalFamily,
        };
      } else {
        let addresses: MetaResolvedAddress[];
        let onDnsAbort: (() => void) | undefined;

        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            onDnsAbort = () => {
              reject(
                codedError(
                  "Meta media request timed out",
                  "META_MEDIA_TIMEOUT",
                ),
              );
            };

            if (controller.signal.aborted) {
              onDnsAbort();
              return;
            }

            controller.signal.addEventListener("abort", onDnsAbort, {
              once: true,
            });
          });

          addresses = await Promise.race([
            this.resolveHost(url.hostname),
            timeoutPromise,
          ]);
        } catch (error) {
          if (
            controller.signal.aborted ||
            (error &&
              typeof error === "object" &&
              "code" in error &&
              error.code === "META_MEDIA_TIMEOUT")
          ) {
            throw codedError(
              "Meta media request timed out",
              "META_MEDIA_TIMEOUT",
            );
          }

          throw codedError(
            "Meta media destination could not be verified",
            "META_MEDIA_DESTINATION_UNVERIFIED",
          );
        } finally {
          if (onDnsAbort) {
            controller.signal.removeEventListener("abort", onDnsAbort);
          }
        }

        if (addresses.length === 0) {
          throw codedError(
            "Meta media destination could not be verified",
            "META_MEDIA_DESTINATION_UNVERIFIED",
          );
        }

        for (const entry of addresses) {
          const address = String(entry?.address || "");
          const actualFamily = isIP(address);

          if (
            !entry ||
            (entry.family !== 4 && entry.family !== 6) ||
            actualFamily !== entry.family
          ) {
            throw codedError(
              "Meta media destination could not be verified",
              "META_MEDIA_DESTINATION_UNVERIFIED",
            );
          }

          if (addressIsForbidden(address)) {
            throw codedError(
              "Meta media destination is forbidden",
              "META_MEDIA_DESTINATION_FORBIDDEN",
            );
          }
        }

        verifiedAddress = addresses[0];
      }

      let response: Response;

      try {
        response = await this.transportImpl({
          url: url.toString(),
          hostname: url.hostname.replace(/^\[|\]$/g, ""),
          address: verifiedAddress.address,
          family: verifiedAddress.family,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          throw codedError(
            "Meta media request timed out",
            "META_MEDIA_TIMEOUT",
          );
        }

        throw codedError(
          "Meta media request failed",
          "META_MEDIA_FETCH_FAILED",
        );
      }

      if (response.status >= 300 && response.status < 400) {
        try {
          await response.body?.cancel();
        } catch {
          // Best-effort cleanup only.
        }
        throw codedError(
          "Meta media redirect was rejected",
          "META_MEDIA_REDIRECT_REJECTED",
        );
      }

      if (!response.ok) {
        try {
          await response.body?.cancel();
        } catch {
          // Best-effort cleanup only.
        }
        throw codedError(
          "Meta media request failed",
          "META_MEDIA_FETCH_FAILED",
        );
      }

      let length: number | null;
      try {
        length = declaredLength(response.headers.get("content-length"));
      } catch (error) {
        try {
          await response.body?.cancel();
        } catch {
          // Best-effort cleanup only.
        }
        throw error;
      }

      if (length !== null && length > META_MEDIA_MAX_IMAGE_BYTES) {
        try {
          await response.body?.cancel();
        } catch {
          // Best-effort cleanup only.
        }
        throw codedError(
          "Meta media exceeds the allowed size",
          "META_MEDIA_TOO_LARGE",
        );
      }

      let mimeType: CatalogImageMime;
      try {
        mimeType = imageMime(response.headers.get("content-type"));
      } catch (error) {
        try {
          await response.body?.cancel();
        } catch {
          // Best-effort cleanup only.
        }
        throw error;
      }

      if (!response.body) {
        throw codedError(
          "Meta media response body is unavailable",
          "META_MEDIA_FETCH_FAILED",
        );
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let sizeBytes = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          sizeBytes += value.byteLength;
          if (sizeBytes > META_MEDIA_MAX_IMAGE_BYTES) {
            try {
              await reader.cancel();
            } catch {
              // Best-effort cleanup only.
            }
            throw codedError(
              "Meta media exceeds the allowed size",
              "META_MEDIA_TOO_LARGE",
            );
          }

          chunks.push(value);
        }
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
        ) {
          throw error;
        }

        if (controller.signal.aborted) {
          throw codedError(
            "Meta media request timed out",
            "META_MEDIA_TIMEOUT",
          );
        }

        throw codedError("Meta media stream failed", "META_MEDIA_FETCH_FAILED");
      } finally {
        reader.releaseLock();
      }

      const buffer = Buffer.concat(
        chunks.map((chunk) =>
          Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength),
        ),
        sizeBytes,
      );

      const detectedMime = detectCatalogImageMime(buffer);
      if (!detectedMime || detectedMime !== mimeType) {
        throw codedError(
          "Meta media content is invalid",
          "META_MEDIA_CONTENT_INVALID",
        );
      }

      return {
        buffer,
        mimeType: detectedMime,
        sizeBytes,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
