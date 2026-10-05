export type MetaInboundContentKind =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "shared_post"
  | "document"
  | "location"
  | "sticker"
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
  replyToMessageId: string | null;
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
    case "document":
      return "document";
    case "location":
      return "location";
    case "sticker":
      return "sticker";
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
    case "document":
      return "[document]";
    case "location":
      return "[location]";
    case "sticker":
      return "[sticker]";
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
  const replyTo = record(message.reply_to);
  const replyToMessageId = cleanText(replyTo.mid) || null;
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
      replyToMessageId,
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
    replyToMessageId,
  };
}


export function isMetaInboundReplyHandled(inbound: MetaInboundMessage | null): boolean {
  return Boolean(
    inbound &&
      (inbound.kind === "text" ||
        inbound.kind === "image" ||
        inbound.kind === "audio" ||
        inbound.kind === "video"),
  );
}

export function selectMetaInboundImageUrl(
  inbound: MetaInboundMessage,
): string | null {
  if (
    !inbound ||
    !Array.isArray(inbound.attachments)
  ) {
    return null;
  }

  if (inbound.attachments.length !== 1) {
    return null;
  }

  const image = inbound.attachments[0];

  if (image?.type.toLowerCase() !== "image") {
    return null;
  }

  const url = image.url?.trim();
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);

    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

export function selectMetaInboundAudioUrl(
  inbound: MetaInboundMessage,
): string | null {
  if (
    !inbound ||
    !Array.isArray(inbound.attachments)
  ) {
    return null;
  }
  if (inbound.attachments.length !== 1) return null;

  const audio = inbound.attachments[0];
  if (audio?.type.toLowerCase() !== "audio") return null;

  const url = audio.url?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

export function selectMetaInboundVideoUrl(
  inbound: MetaInboundMessage,
): string | null {
  if (!inbound || !Array.isArray(inbound.attachments)) {
    return null;
  }
  if (inbound.attachments.length !== 1) return null;

  const video = inbound.attachments[0];
  if (video?.type.toLowerCase() !== "video") return null;
  const url = video.url?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}
