import assert from "node:assert/strict";
import test from "node:test";
import { parseMetaInboundMessage } from "../src/services/metaInboundMessage";

test("preserves the existing text message contract", () => {
  const parsed = parseMetaInboundMessage({
    mid: "message-1",
    text: "  hello  ",
  });

  assert.deepEqual(parsed, {
    kind: "text",
    text: "hello",
    storageText: "hello",
    attachments: [],
  });
});

test("normalizes an image-only message without inventing image meaning", () => {
  const parsed = parseMetaInboundMessage({
    mid: "message-image",
    attachments: [
      {
        type: "image",
        payload: { url: "https://example.invalid/image.jpg" },
      },
    ],
  });

  assert.equal(parsed?.kind, "image");
  assert.equal(parsed?.text, null);
  assert.equal(parsed?.storageText, "[image]");
  assert.equal(parsed?.attachments[0]?.type, "image");
  assert.equal(
    parsed?.attachments[0]?.url,
    "https://example.invalid/image.jpg",
  );
});

test("normalizes audio and video without claiming transcription or analysis", () => {
  const audio = parseMetaInboundMessage({
    attachments: [{ type: "audio", payload: { url: "audio-url" } }],
  });
  const video = parseMetaInboundMessage({
    attachments: [{ type: "video", payload: { url: "video-url" } }],
  });

  assert.equal(audio?.kind, "audio");
  assert.equal(audio?.storageText, "[audio]");
  assert.equal(video?.kind, "video");
  assert.equal(video?.storageText, "[video]");
});

test("normalizes a shared post as shared content, not merchant knowledge", () => {
  const parsed = parseMetaInboundMessage({
    attachments: [
      {
        type: "share",
        payload: {
          url: "https://example.invalid/post",
          title: "Shared post",
        },
      },
    ],
  });

  assert.equal(parsed?.kind, "shared_post");
  assert.equal(parsed?.storageText, "[shared_post]");
  assert.equal(parsed?.attachments[0]?.title, "Shared post");
});

test("keeps caption text authoritative as text while retaining attachments", () => {
  const parsed = parseMetaInboundMessage({
    text: "Do you have this?",
    attachments: [
      {
        type: "image",
        payload: { url: "https://example.invalid/product.jpg" },
      },
    ],
  });

  assert.equal(parsed?.kind, "text");
  assert.equal(parsed?.text, "Do you have this?");
  assert.equal(parsed?.storageText, "Do you have this?");
  assert.equal(parsed?.attachments.length, 1);
});

test("unknown attachments fail closed instead of pretending to understand them", () => {
  const parsed = parseMetaInboundMessage({
    attachments: [{ type: "file", payload: { url: "file-url" } }],
  });

  assert.equal(parsed?.kind, "unsupported");
  assert.equal(parsed?.storageText, "[unsupported_attachment]");
});

test("empty message has no canonical inbound content", () => {
  assert.equal(parseMetaInboundMessage({ mid: "empty" }), null);
});
