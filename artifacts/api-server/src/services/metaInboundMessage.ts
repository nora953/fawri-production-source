export type MetaInboundContentKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "shared_post"
  | "unsupported";

export type MetaInboundAttachment = {
  type: string;
  url: string | null;
  title: string | null;
  payload: Record<string, unknown>;
};

export type MetaInboundMessage = {
  kind: MetaInboundContentKind;
  text: string | null;
  storageText: string;
  attachments: MetaInboundAttachment[];
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function classifyAttachment(type: string): MetaInboundContentKind {
  switch (type.toLowerCase()) {
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "video":
      return "video";
    case "share":
    case "shared_post":
      return "shared_post";
    default:
      return "unsupported";
  }
}

function storageMarker(kind: MetaInboundContentKind): string {
  switch (kind) {
    case "image":
      return "[image]";
    case "audio":
      return "[audio]";
    case "video":
      return "[video]";
    case "shared_post":
      return "[shared_post]";
    case "unsupported":
      return "[unsupported_attachment]";
    case "text":
      return "[text]";
  }
}

export function parseMetaInboundMessage(
  value: unknown,
): MetaInboundMessage | null {
  const message = record(value);
  const messageText = cleanText(message.text);
  const rawAttachments = Array.isArray(message.attachments)
    ? message.attachments
    : [];

  const attachments = rawAttachments
    .map((value): MetaInboundAttachment | null => {
      const attachment = record(value);
      const type = cleanText(attachment.type);
      if (!type) return null;

      const payload = record(attachment.payload);
      const url = cleanText(payload.url) || null;
      const title =
        cleanText(payload.title) ||
        cleanText(attachment.title) ||
        null;

      return {
        type: type.toLowerCase(),
        url,
        title,
        payload,
      };
    })
    .filter((value): value is MetaInboundAttachment => value !== null);

  if (messageText) {
    return {
      kind: "text",
      text: messageText,
      storageText: messageText,
      attachments,
    };
  }

  const firstAttachment = attachments[0];
  if (!firstAttachment) return null;

  const kind = classifyAttachment(firstAttachment.type);

  return {
    kind,
    text: null,
    storageText: storageMarker(kind),
    attachments,
  };
}
