import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export const META_AUDIO_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20_000;
const ALLOWED_AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
]);

export type MetaFetchedAudio = {
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

type ResolvedAddress = { address: string; family: number };
type PinnedRequest = {
  url: string;
  hostname: string;
  address: string;
  family: number;
  signal: AbortSignal;
};
type PinnedTransport = (input: PinnedRequest) => Promise<Response>;

type Options = {
  fetchImpl?: typeof fetch;
  transportImpl?: PinnedTransport;
  timeoutMs?: number;
  resolveHost?: (hostname: string) => Promise<ResolvedAddress[]>;
};

function coded(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function forbiddenV4(address: string): boolean {
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function forbiddenV6(address: string): boolean {
  const raw = address.toLowerCase().split("%", 1)[0];
  let normalized = raw;
  try {
    normalized = new URL(`https://[${raw}]/`).hostname
      .replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return true;
  }
  if (normalized === "::" || normalized === "::1" ||
      normalized.startsWith("fc") || normalized.startsWith("fd") ||
      normalized.startsWith("ff") || /^fe[89ab]/.test(normalized) ||
      /^fe[c-f]/.test(normalized)) return true;
  const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mapped) {
    const hi = Number.parseInt(mapped[1], 16);
    const lo = Number.parseInt(mapped[2], 16);
    return forbiddenV4([hi >> 8, hi & 255, lo >> 8, lo & 255].join("."));
  }
  return false;
}

function forbidden(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? forbiddenV4(address) : family === 6 ? forbiddenV6(address) : true;
}

function audioContainerMatches(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length < 4) return false;
  if (mimeType === "audio/mpeg") {
    return buffer.subarray(0, 3).toString("ascii") === "ID3" ||
      (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  }
  if (mimeType === "audio/ogg") {
    return buffer.subarray(0, 4).toString("ascii") === "OggS";
  }
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav") {
    return buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WAVE";
  }
  if (mimeType === "audio/webm") {
    return buffer[0] === 0x1a && buffer[1] === 0x45 &&
      buffer[2] === 0xdf && buffer[3] === 0xa3;
  }
  if (["audio/mp4", "audio/m4a", "audio/x-m4a"].includes(mimeType)) {
    return buffer.length >= 12 &&
      buffer.subarray(4, 8).toString("ascii") === "ftyp";
  }
  return false;
}

function safeUrl(value: unknown): URL {
  try {
    const parsed = new URL(typeof value === "string" ? value.trim() : "");
    if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password) throw new Error();
    return parsed;
  } catch {
    throw coded("Meta audio URL is invalid", "META_AUDIO_URL_INVALID");
  }
}

export class SecureMetaAudioFetcher {
  private readonly transportImpl: PinnedTransport;
  private readonly timeoutMs: number;
  private readonly resolveHost: (hostname: string) => Promise<ResolvedAddress[]>;

  constructor(options: Options = {}) {
    this.transportImpl = options.transportImpl ||
      (options.fetchImpl
        ? async (input) => options.fetchImpl!(input.url, {
            method: "GET",
            redirect: "manual",
            signal: input.signal,
          })
        : async (input) => new Promise<Response>((resolve, reject) => {
            const url = new URL(input.url);
            const request = httpsRequest({
              protocol: "https:",
              hostname: input.address,
              family: input.family,
              port: url.port ? Number(url.port) : 443,
              method: "GET",
              path: `${url.pathname}${url.search}`,
              servername: isIP(input.hostname) ? undefined : input.hostname,
              headers: { host: url.host },
              signal: input.signal,
            }, (response) => {
              const headers = new Headers();
              for (const [name, value] of Object.entries(response.headers)) {
                if (Array.isArray(value)) for (const entry of value) headers.append(name, entry);
                else if (value !== undefined) headers.set(name, String(value));
              }
              const status = response.statusCode || 500;
              const body = status === 204 || status === 205 || status === 304
                ? null
                : (Readable.toWeb(response) as ReadableStream<Uint8Array>);
              if (!body) response.resume();
              resolve(new Response(body, {
                status,
                statusText: response.statusMessage || "",
                headers,
              }));
            });
            request.once("error", reject);
            request.end();
          }));
    this.timeoutMs = Number.isFinite(options.timeoutMs) && Number(options.timeoutMs) > 0
      ? Math.min(Number(options.timeoutMs), 60_000) : DEFAULT_TIMEOUT_MS;
    this.resolveHost = options.resolveHost || (async (hostname) =>
      lookup(hostname, { all: true, verbatim: true }));
  }

  async fetchAudio(input: { url: string }): Promise<MetaFetchedAudio> {
    const url = safeUrl(input.url);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const literalFamily = isIP(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref?.();

    let addresses: ResolvedAddress[];
    try {
      addresses = literalFamily
        ? [{ address: host, family: literalFamily }]
        : await (async () => {
            let onDnsAbort: (() => void) | undefined;
            try {
              const timeoutPromise = new Promise<never>((_, reject) => {
                onDnsAbort = () => {
                  reject(coded("Meta audio request timed out", "META_AUDIO_TIMEOUT"));
                };
                if (controller.signal.aborted) {
                  onDnsAbort();
                  return;
                }
                controller.signal.addEventListener("abort", onDnsAbort, { once: true });
              });
              return await Promise.race([this.resolveHost(host), timeoutPromise]);
            } finally {
              if (onDnsAbort) controller.signal.removeEventListener("abort", onDnsAbort);
            }
          })();
    } catch (error) {
      clearTimeout(timer);
      if ((error as { code?: unknown })?.code === "META_AUDIO_TIMEOUT" || controller.signal.aborted) {
        throw coded("Meta audio request timed out", "META_AUDIO_TIMEOUT");
      }
      throw coded("Meta audio destination could not be verified", "META_AUDIO_DESTINATION_UNVERIFIED");
    }
    try {
      if (!addresses.length || addresses.some((entry) =>
        (entry.family !== 4 && entry.family !== 6) ||
        isIP(entry.address) !== entry.family)) {
        throw coded("Meta audio destination could not be verified", "META_AUDIO_DESTINATION_UNVERIFIED");
      }
      if (addresses.some((entry) => forbidden(entry.address))) {
        throw coded("Meta audio destination is forbidden", "META_AUDIO_DESTINATION_FORBIDDEN");
      }

      const verified = addresses[0];
      let response: Response;
      try {
        response = await this.transportImpl({
          url: url.toString(),
          hostname: host,
          address: verified.address,
          family: verified.family,
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) throw coded("Meta audio request timed out", "META_AUDIO_TIMEOUT");
        throw coded("Meta audio request failed", "META_AUDIO_FETCH_FAILED");
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => undefined);
        throw coded("Meta audio redirect was rejected", "META_AUDIO_REDIRECT_REJECTED");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw coded("Meta audio request failed", "META_AUDIO_FETCH_FAILED");
      }
      const mimeType = String(response.headers.get("content-type") || "")
        .split(";", 1)[0].trim().toLowerCase();
      if (!ALLOWED_AUDIO_MIME.has(mimeType)) {
        await response.body?.cancel().catch(() => undefined);
        throw coded("Meta audio MIME type is invalid", "META_AUDIO_MIME_INVALID");
      }
      const rawLength = response.headers.get("content-length");
      if (rawLength !== null) {
        if (!/^\d+$/.test(rawLength.trim())) {
          await response.body?.cancel().catch(() => undefined);
          throw coded("Meta audio content length is invalid", "META_AUDIO_FETCH_FAILED");
        }
        const length = Number(rawLength);
        if (!Number.isSafeInteger(length) || length < 0) {
          await response.body?.cancel().catch(() => undefined);
          throw coded("Meta audio content length is invalid", "META_AUDIO_FETCH_FAILED");
        }
        if (length > META_AUDIO_MAX_BYTES) {
          await response.body?.cancel().catch(() => undefined);
          throw coded("Meta audio exceeds the allowed size", "META_AUDIO_TOO_LARGE");
        }
      }
      if (!response.body) throw coded("Meta audio response body is unavailable", "META_AUDIO_FETCH_FAILED");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let sizeBytes = 0;
      try {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            sizeBytes += value.byteLength;
            if (sizeBytes > META_AUDIO_MAX_BYTES) {
              await reader.cancel().catch(() => undefined);
              throw coded("Meta audio exceeds the allowed size", "META_AUDIO_TOO_LARGE");
            }
            chunks.push(value);
          }
        } catch (error) {
          if (controller.signal.aborted) {
            throw coded("Meta audio request timed out", "META_AUDIO_TIMEOUT");
          }
          throw error;
        }
      } finally {
        reader.releaseLock();
      }
      if (sizeBytes === 0) throw coded("Meta audio content is invalid", "META_AUDIO_CONTENT_INVALID");
      const buffer = Buffer.concat(chunks.map((x) => Buffer.from(x.buffer, x.byteOffset, x.byteLength)), sizeBytes);
      if (!audioContainerMatches(buffer, mimeType)) {
        throw coded("Meta audio content is invalid", "META_AUDIO_CONTENT_INVALID");
      }
      return {
        buffer,
        mimeType,
        sizeBytes,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
