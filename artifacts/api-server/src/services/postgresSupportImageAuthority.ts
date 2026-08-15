import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getFawriDataDir } from "../lib/dataPaths";
import {
  operationalPostgresAuthorityRequired,
  withOperationalTransaction,
} from "./operationalPostgresAuthority";
import { SupportPostgresError } from "./postgresSupportAuthority";

export const SUPPORT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_IMAGE_DIR = path.join(getFawriDataDir(), "support-images");

const IMAGE_MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type SupportedImageMime = keyof typeof IMAGE_MIME_TO_EXTENSION;
type SenderType = "merchant" | "admin";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function detectImageMime(buffer: Buffer): SupportedImageMime | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

function cleanFileName(value: unknown, extension: string): string {
  const base = path
    .basename(text(value) || `support-image.${extension}`)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 120);
  return base || `support-image.${extension}`;
}

function assertImage(buffer: Buffer, suppliedMimeValue: unknown): SupportedImageMime {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new SupportPostgresError(
      "SUPPORT_IMAGE_REQUIRED",
      "support image is required",
      400,
    );
  }
  if (buffer.length > SUPPORT_IMAGE_MAX_BYTES) {
    throw new SupportPostgresError(
      "SUPPORT_IMAGE_TOO_LARGE",
      "support image is too large",
      413,
    );
  }
  const suppliedMime = text(suppliedMimeValue).split(";")[0].toLowerCase();
  const detected = detectImageMime(buffer);
  if (!detected || detected !== suppliedMime) {
    throw new SupportPostgresError(
      "SUPPORT_IMAGE_TYPE_MISMATCH",
      "image content does not match its content type",
      415,
    );
  }
  return detected;
}

function safeStoragePath(storageKey: string): string {
  const normalized = storageKey.replace(/\\/g, "/");
  const pieces = normalized.split("/").filter(Boolean);
  if (
    pieces.length !== 2 ||
    pieces.some((piece) => piece === "." || piece === ".." || path.basename(piece) !== piece)
  ) {
    throw new SupportPostgresError(
      "SUPPORT_IMAGE_STORAGE_INVALID",
      "support image storage key is invalid",
      500,
    );
  }
  return path.join(SUPPORT_IMAGE_DIR, pieces[0], pieces[1]);
}

export async function saveSupportImagePostgres(input: {
  ticketId: string;
  buffer: Buffer;
  suppliedMime: unknown;
  fileName: unknown;
  senderType: SenderType;
  senderAccountId: string;
  senderName: string;
  merchantId?: string;
}) {
  if (!operationalPostgresAuthorityRequired()) {
    throw new SupportPostgresError(
      "SUPPORT_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL support authority is not required",
      503,
    );
  }
  const mimeType = assertImage(input.buffer, input.suppliedMime);
  const ticketId = text(input.ticketId);
  const senderAccountId = text(input.senderAccountId);
  const senderName = text(input.senderName) ||
    (input.senderType === "admin" ? "Support" : "Merchant");
  const extension = IMAGE_MIME_TO_EXTENSION[mimeType];
  const attachmentId = `support-attachment-${crypto.randomUUID()}`;
  const messageId = `support-message-${crypto.randomUUID()}`;
  const storageName = `${attachmentId}.${extension}`;
  const storageKey = `${ticketId}/${storageName}`;
  const filePath = safeStoragePath(storageKey);
  const originalFileName = cleanFileName(input.fileName, extension);
  const sha256 = crypto.createHash("sha256").update(input.buffer).digest("hex");

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, input.buffer, { flag: "wx" });
  fs.renameSync(temporaryPath, filePath);

  try {
    return await withOperationalTransaction(async (client) => {
      const ticketResult = await client.query<{
        merchant_id: string;
        status: string;
        assigned_admin_account_id: string | null;
      }>(
        `SELECT merchant_id, status, assigned_admin_account_id
           FROM support_tickets
          WHERE id = $1
          FOR UPDATE`,
        [ticketId],
      );
      const ticket = ticketResult.rows[0];
      if (!ticket) {
        throw new SupportPostgresError(
          "SUPPORT_TICKET_NOT_FOUND",
          "support ticket not found",
          404,
        );
      }
      if (ticket.status !== "open" && ticket.status !== "in_progress") {
        throw new SupportPostgresError(
          "SUPPORT_TICKET_NOT_ACTIVE",
          "support ticket is not active",
          409,
        );
      }
      if (input.senderType === "merchant") {
        if (!input.merchantId || ticket.merchant_id !== text(input.merchantId)) {
          throw new SupportPostgresError(
            "SUPPORT_TICKET_NOT_FOUND",
            "support ticket not found",
            404,
          );
        }
      } else if (ticket.assigned_admin_account_id !== senderAccountId) {
        throw new SupportPostgresError(
          "SUPPORT_TICKET_ADMIN_MISMATCH",
          "support ticket belongs to another administrator",
          403,
        );
      }

      await client.query(
        `INSERT INTO support_messages
           (id, ticket_id, merchant_id, sender_type, sender_account_id,
            sender_name_snapshot, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, '', now())`,
        [
          messageId,
          ticketId,
          ticket.merchant_id,
          input.senderType,
          senderAccountId,
          senderName,
        ],
      );
      await client.query(
        `INSERT INTO support_attachments
           (id, message_id, ticket_id, merchant_id, kind,
            original_file_name, mime_type, size_bytes, sha256,
            storage_provider, storage_key, created_at)
         VALUES ($1, $2, $3, $4, 'image', $5, $6, $7, $8,
                 'filesystem', $9, now())`,
        [
          attachmentId,
          messageId,
          ticketId,
          ticket.merchant_id,
          originalFileName,
          mimeType,
          input.buffer.length,
          sha256,
          storageKey,
        ],
      );
      await client.query(
        `UPDATE support_tickets
            SET waiting_on = $2,
                waiting_since = now(),
                merchant_reminder_sent_at = NULL,
                assistant_reminder_sent_at = NULL,
                owner_escalated_at = NULL,
                updated_at = now()
          WHERE id = $1`,
        [ticketId, input.senderType === "merchant" ? "admin" : "merchant"],
      );
      return {
        message_id: messageId,
        attachment: {
          id: attachmentId,
          kind: "image",
          original_name: originalFileName,
          mime_type: mimeType,
          size_bytes: input.buffer.length,
          sha256,
          storage_provider: "filesystem",
          storage_key: storageKey,
          url: `/api/auth/support-images/tickets/${encodeURIComponent(ticketId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
        },
      };
    });
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    throw error;
  }
}

export async function resolveSupportImagePostgres(input: {
  ticketId: string;
  messageId: string;
  attachmentId: string;
  merchantId?: string;
}) {
  if (!operationalPostgresAuthorityRequired()) {
    throw new SupportPostgresError(
      "SUPPORT_POSTGRES_AUTHORITY_REQUIRED",
      "PostgreSQL support authority is not required",
      503,
    );
  }
  return withOperationalTransaction(async (client) => {
    const result = await client.query<{
      merchant_id: string;
      original_file_name: string;
      mime_type: string;
      size_bytes: number;
      sha256: string;
      storage_provider: string;
      storage_key: string;
    }>(
      `SELECT a.merchant_id, a.original_file_name, a.mime_type,
              a.size_bytes, a.sha256, a.storage_provider, a.storage_key
         FROM support_attachments a
        WHERE a.id = $1 AND a.message_id = $2 AND a.ticket_id = $3
          AND a.deleted_at IS NULL
        LIMIT 1`,
      [text(input.attachmentId), text(input.messageId), text(input.ticketId)],
    );
    const attachment = result.rows[0];
    if (
      !attachment ||
      (input.merchantId && attachment.merchant_id !== text(input.merchantId))
    ) {
      throw new SupportPostgresError(
        "SUPPORT_IMAGE_NOT_FOUND",
        "support image not found",
        404,
      );
    }
    if (attachment.storage_provider !== "filesystem") {
      throw new SupportPostgresError(
        "SUPPORT_IMAGE_PROVIDER_UNAVAILABLE",
        "support image storage provider is unavailable",
        503,
      );
    }
    const filePath = safeStoragePath(attachment.storage_key);
    if (!fs.existsSync(filePath)) {
      throw new SupportPostgresError(
        "SUPPORT_IMAGE_NOT_FOUND",
        "support image not found",
        404,
      );
    }
    return {
      ...attachment,
      file_path: filePath,
    };
  });
}
