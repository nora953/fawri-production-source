import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { MetaFetchedImage } from "./metaMediaFetcher.js";
import type { MetaFetchedVideo } from "./metaVideoUnderstandingService.js";

const MAX_FRAMES = 6;
const MAX_FRAME_BYTES = 8 * 1024 * 1024;

type RunInput = { inputPath: string; outputPattern: string };
type Options = {
  runFfmpeg?: (input: RunInput) => Promise<Buffer[]>;
  onCleanup?: () => void;
};

function jpeg(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
}

async function defaultRun({ inputPath, outputPattern }: RunInput): Promise<Buffer[]> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-i", inputPath,
      "-vf", "fps=1/5,scale='min(1280,iw)':-2",
      "-frames:v", String(MAX_FRAMES),
      "-q:v", "3",
      outputPattern,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", chunk => { stderr += String(chunk).slice(0, 1000); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${code}: ${stderr.slice(0,200)}`)));
  });
  const dir = outputPattern.slice(0, outputPattern.lastIndexOf("/"));
  const names = (await readdir(dir)).filter(x => /^frame-\d+\.jpg$/.test(x)).sort();
  return Promise.all(names.slice(0, MAX_FRAMES + 1).map(x => readFile(join(dir, x))));
}

export class FfmpegMetaVideoFrameExtractor {
  private readonly runFfmpeg: (input: RunInput) => Promise<Buffer[]>;
  private readonly onCleanup?: () => void;
  constructor(options: Options = {}) { this.runFfmpeg = options.runFfmpeg || defaultRun; this.onCleanup = options.onCleanup; }

  async extract(video: MetaFetchedVideo): Promise<MetaFetchedImage[]> {
    if (!Buffer.isBuffer(video.buffer) || video.buffer.length !== video.sizeBytes ||
        !/^[a-f0-9]{64}$/i.test(video.sha256)) return [];
    const dir = await mkdtemp(join(tmpdir(), "fawri-meta-video-"));
    try {
      const ext = video.mimeType === "video/webm" ? "webm" : "mp4";
      const inputPath = join(dir, `input-${randomUUID()}.${ext}`);
      const outputPattern = join(dir, "frame-%02d.jpg");
      await writeFile(inputPath, video.buffer, { flag: "wx", mode: 0o600 });
      const buffers = await this.runFfmpeg({ inputPath, outputPattern });
      if (!Array.isArray(buffers) || buffers.length < 1 || buffers.length > MAX_FRAMES) return [];
      const result: MetaFetchedImage[] = [];
      for (const buffer of buffers) {
        if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.length > MAX_FRAME_BYTES || !jpeg(buffer)) return [];
        result.push({ buffer, mimeType: "image/jpeg", sizeBytes: buffer.length,
          sha256: createHash("sha256").update(buffer).digest("hex") });
      }
      return result;
    } catch {
      return [];
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      this.onCleanup?.();
    }
  }
}
