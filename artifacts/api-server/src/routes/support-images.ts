import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { Router, type Request, type Response } from "express";

import { getFawriDataDir } from "../lib/dataPaths";
import {
  AUTH_DB_PATH,
  authenticateAdmin,
  audit,
  findMerchant,
  makeId,
  now,
  readAuthDb,
  sendError,
  writeJson,
  type AuthDb,
  type MerchantRecord,
  type SupportTicketRecord,
} from "../services/supportPreviewSessions";

const router = Router();
const SUPPORT_IMAGE_DIR = path.join(getFawriDataDir(), "support-images");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MERCHANT_SESSION_COOKIE = "fawri_merchant_session";
const MERCHANT_SESSION_SECRET =
  process.env.FAWRI_MERCHANT_SESSION_SECRET ||
  process.env.FAWRI_ADMIN_SESSION_SECRET ||
  process.env.FAWRI_PASSWORD_SALT ||
  "fawri-local-dev-salt";

const IMAGE_MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

type SupportedImageMime = keyof typeof IMAGE_MIME_TO_EXTENSION;

type SupportImageAttachment = {
  id: string;
  type: "image";
  file_name: string;
  mime_type: SupportedImageMime;
  size_bytes: number;
  sha256: string;
  storage_name: string;
  url: string;
};

type SupportMessageRecord = {
  id: string;
  sender_type: "merchant" | "admin" | "system";
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  attachments?: SupportImageAttachment[];
};

type MerchantSessionPayload = {
  kind: "merchant_session";
  merchantId: string;
  expiresAt: number;
};

const imageBodyParser = express.raw({
  type: Object.keys(IMAGE_MIME_TO_EXTENSION),
  limit: MAX_IMAGE_BYTES,
});

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function verifyMerchantToken(token: string): MerchantSessionPayload | null {
  const [encodedPayload, suppliedSignature, extraPart] = token.split(".");
  if (!encodedPayload || !suppliedSignature || extraPart) return null;

  const expectedSignature = crypto
    .createHmac("sha256", MERCHANT_SESSION_SECRET)
    .update(`session.${encodedPayload}`)
    .digest("base64url");
  if (!safeEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<MerchantSessionPayload>;
    if (
      payload.kind !== "merchant_session" ||
      typeof payload.merchantId !== "string" ||
      !payload.merchantId ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload as MerchantSessionPayload;
  } catch {
    return null;
  }
}

function authenticateMerchant(
  req: Request,
  res: Response,
  db: AuthDb,
): MerchantRecord | null {
  const token = String(req.cookies?.[MERCHANT_SESSION_COOKIE] || "").trim();
  const payload = token ? verifyMerchantToken(token) : null;
  const merchant = payload ? findMerchant(db, payload.merchantId) : null;
  if (!merchant || (merchant as MerchantRecord & { otp_verified?: boolean }).otp_verified === false) {
    sendError(res, 401, "merchant session is missing or expired", {
      code: "MERCHANT_SESSION_REQUIRED",
    });
    return null;
  }
  return merchant;
}

function findTicket(db: AuthDb, ticketId: string): SupportTicketRecord | null {
  return db.support_tickets.find((ticket) => ticket.id === ticketId) || null;
}

function isTicketActive(ticket: SupportTicketRecord): boolean {
  return ticket.status === "open" || ticket.status === "in_progress";
}

function detectImageMime(buffer: Buffer): SupportedImageMime | null {
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

function cleanFileName(value: unknown, extension: string): string {
  const raw = String(value || "").trim();
  const base = path
    .basename(raw || `support-image.${extension}`)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 120);
  return base || `support-image.${extension}`;
}

function clearWaitingReminders(ticket: SupportTicketRecord): void {
  delete ticket.merchant_reminder_sent_at;
  delete ticket.assistant_reminder_sent_at;
  delete ticket.owner_escalated_at;
}

function saveImageMessage(options: {
  db: AuthDb;
  ticket: SupportTicketRecord;
  buffer: Buffer;
  suppliedMime: string;
  fileName: unknown;
  senderType: "merchant" | "admin";
  senderId: string;
  senderName: string;
}): SupportMessageRecord {
  const detectedMime = detectImageMime(options.buffer);
  if (!detectedMime || detectedMime !== options.suppliedMime) {
    throw Object.assign(new Error("image content does not match its content type"), {
      status: 415,
      code: "SUPPORT_IMAGE_TYPE_MISMATCH",
    });
  }

  const extension = IMAGE_MIME_TO_EXTENSION[detectedMime];
  const attachmentId = makeId("support-image");
  const messageId = makeId("support-message");
  const storageName = `${attachmentId}.${extension}`;
  const ticketDirectory = path.join(SUPPORT_IMAGE_DIR, options.ticket.id);
  const filePath = path.join(ticketDirectory, storageName);
  const attachment: SupportImageAttachment = {
    id: attachmentId,
    type: "image",
    file_name: cleanFileName(options.fileName, extension),
    mime_type: detectedMime,
    size_bytes: options.buffer.length,
    sha256: crypto.createHash("sha256").update(options.buffer).digest("hex"),
    storage_name: storageName,
    url: `/api/auth/support-images/tickets/${encodeURIComponent(options.ticket.id)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
  };
  const createdAt = now();
  const message: SupportMessageRecord = {
    id: messageId,
    sender_type: options.senderType,
    sender_id: options.senderId,
    sender_name: options.senderName,
    body: "",
    created_at: createdAt,
    attachments: [attachment],
  };

  fs.mkdirSync(ticketDirectory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, options.buffer, { flag: "wx" });
  fs.renameSync(temporaryPath, filePath);

  try {
    const messages = Array.isArray(options.ticket.messages)
      ? (options.ticket.messages as SupportMessageRecord[])
      : [];
    messages.push(message);
    options.ticket.messages = messages;
    options.ticket.updated_at = createdAt;
    options.ticket.waiting_on =
      options.senderType === "merchant" ? "admin" : "merchant";
    options.ticket.waiting_since = createdAt;
    clearWaitingReminders(options.ticket);
    writeJson(AUTH_DB_PATH, options.db);
    return message;
  } catch (error) {
    fs.rmSync(filePath, { force: true });
    throw error;
  }
}

function imageRequestBuffer(req: Request, res: Response): Buffer | null {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    sendError(res, 400, "support image is required", {
      code: "SUPPORT_IMAGE_REQUIRED",
    });
    return null;
  }
  if (req.body.length > MAX_IMAGE_BYTES) {
    sendError(res, 413, "support image is too large", {
      code: "SUPPORT_IMAGE_TOO_LARGE",
      max_bytes: MAX_IMAGE_BYTES,
    });
    return null;
  }
  return req.body;
}

router.post(
  "/merchant/tickets/:ticketId/messages",
  imageBodyParser,
  (req: Request, res: Response) => {
    const db = readAuthDb();
    const merchant = authenticateMerchant(req, res, db);
    if (!merchant) return;

    const ticket = findTicket(db, String(req.params.ticketId || "").trim());
    if (!ticket || ticket.merchant_id !== merchant.id) {
      return sendError(res, 404, "support ticket not found", {
        code: "SUPPORT_TICKET_NOT_FOUND",
      });
    }
    if (!isTicketActive(ticket)) {
      return sendError(res, 409, "support ticket is not active", {
        code: "SUPPORT_TICKET_NOT_ACTIVE",
      });
    }

    const buffer = imageRequestBuffer(req, res);
    if (!buffer) return;
    const suppliedMime = String(req.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    try {
      const message = saveImageMessage({
        db,
        ticket,
        buffer,
        suppliedMime,
        fileName: req.headers["x-file-name"],
        senderType: "merchant",
        senderId: merchant.id,
        senderName: merchant.store_name,
      });
      return res.status(201).json({ ok: true, ticket, message });
    } catch (error) {
      const typed = error as Error & { status?: number; code?: string };
      return sendError(
        res,
        typed.status || 500,
        typed.status ? typed.message : "could not save support image",
        { code: typed.code || "SUPPORT_IMAGE_SAVE_FAILED" },
      );
    }
  },
);

router.post(
  "/admin/tickets/:ticketId/messages",
  imageBodyParser,
  (req: Request, res: Response) => {
    const authenticated = authenticateAdmin(req, res, {
      requiredPermissions: ["manage_support"],
    });
    if (!authenticated) return;

    const ticket = findTicket(
      authenticated.authDb,
      String(req.params.ticketId || "").trim(),
    );
    if (!ticket) {
      return sendError(res, 404, "support ticket not found", {
        code: "SUPPORT_TICKET_NOT_FOUND",
      });
    }
    if (!isTicketActive(ticket)) {
      return sendError(res, 409, "support ticket is not active", {
        code: "SUPPORT_TICKET_NOT_ACTIVE",
      });
    }
    if (ticket.assigned_admin_id !== authenticated.admin.id) {
      return sendError(res, 403, "support ticket belongs to another administrator", {
        code: "SUPPORT_TICKET_ADMIN_MISMATCH",
      });
    }

    const merchant = findMerchant(authenticated.authDb, ticket.merchant_id);
    if (!merchant) {
      return sendError(res, 404, "merchant not found", {
        code: "MERCHANT_NOT_FOUND",
      });
    }

    const buffer = imageRequestBuffer(req, res);
    if (!buffer) return;
    const suppliedMime = String(req.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    try {
      const message = saveImageMessage({
        db: authenticated.authDb,
        ticket,
        buffer,
        suppliedMime,
        fileName: req.headers["x-file-name"],
        senderType: "admin",
        senderId: authenticated.admin.id,
        senderName: authenticated.admin.owner_name,
      });
      audit(
        authenticated.authDb,
        authenticated.admin,
        merchant,
        "support_ticket_image_sent",
        ticket.subject,
        {
          ticket_id: ticket.id,
          message_id: message.id,
          attachment_id: message.attachments?.[0]?.id || "",
        },
      );
      writeJson(AUTH_DB_PATH, authenticated.authDb);
      return res.status(201).json({ ok: true, ticket, message });
    } catch (error) {
      const typed = error as Error & { status?: number; code?: string };
      return sendError(
        res,
        typed.status || 500,
        typed.status ? typed.message : "could not save support image",
        { code: typed.code || "SUPPORT_IMAGE_SAVE_FAILED" },
      );
    }
  },
);

router.get(
  "/tickets/:ticketId/messages/:messageId/attachments/:attachmentId",
  (req: Request, res: Response) => {
    const db = readAuthDb();
    const ticket = findTicket(db, String(req.params.ticketId || "").trim());
    if (!ticket) {
      return sendError(res, 404, "support image not found", {
        code: "SUPPORT_IMAGE_NOT_FOUND",
      });
    }

    const authorization = String(req.headers.authorization || "").trim();
    if (authorization) {
      const authenticated = authenticateAdmin(req, res, {
        allowOwner: true,
        requiredPermissions: ["manage_support"],
      });
      if (!authenticated) return;
    } else {
      const merchant = authenticateMerchant(req, res, db);
      if (!merchant) return;
      if (ticket.merchant_id !== merchant.id) {
        return sendError(res, 404, "support image not found", {
          code: "SUPPORT_IMAGE_NOT_FOUND",
        });
      }
    }

    const messages = Array.isArray(ticket.messages)
      ? (ticket.messages as SupportMessageRecord[])
      : [];
    const message = messages.find(
      (item) => item.id === String(req.params.messageId || "").trim(),
    );
    const attachment = message?.attachments?.find(
      (item) => item.id === String(req.params.attachmentId || "").trim(),
    );
    if (!attachment || attachment.type !== "image") {
      return sendError(res, 404, "support image not found", {
        code: "SUPPORT_IMAGE_NOT_FOUND",
      });
    }

    const expectedName = path.basename(attachment.storage_name);
    if (expectedName !== attachment.storage_name) {
      return sendError(res, 404, "support image not found", {
        code: "SUPPORT_IMAGE_NOT_FOUND",
      });
    }
    const filePath = path.join(SUPPORT_IMAGE_DIR, ticket.id, expectedName);
    if (!fs.existsSync(filePath)) {
      return sendError(res, 404, "support image not found", {
        code: "SUPPORT_IMAGE_NOT_FOUND",
      });
    }

    res.setHeader("Content-Type", attachment.mime_type);
    res.setHeader("Content-Length", String(attachment.size_bytes));
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return fs.createReadStream(filePath).pipe(res);
  },
);

export default router;
