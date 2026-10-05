import assert from "node:assert/strict";
import test from "node:test";
import {
  parseMetaInboundMessage,
  selectMetaInboundImageUrl,
  selectMetaInboundAudioUrl,
} from "../src/services/metaInboundMessage";

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


test("selects one explicit HTTPS image URL for image processing", () => {
  const inbound = parseMetaInboundMessage({
    mid: "image-one",
    attachments: [
      {
        type: "image",
        payload: {
          url: "https://cdn.example.test/private-image.jpg",
        },
      },
    ],
  });

  assert.ok(inbound);
  assert.equal(
    selectMetaInboundImageUrl(inbound),
    "https://cdn.example.test/private-image.jpg",
  );
});

test("selects image URL from a caption plus one image attachment", () => {
  const inbound = parseMetaInboundMessage({
    mid: "caption-image",
    text: "هل هذا متوفر؟",
    attachments: [
      {
        type: "image",
        payload: {
          url: "https://cdn.example.test/caption-image.jpg",
        },
      },
    ],
  });

  assert.ok(inbound);
  assert.equal(inbound.kind, "text");
  assert.equal(
    selectMetaInboundImageUrl(inbound),
    "https://cdn.example.test/caption-image.jpg",
  );
});

test("image URL selection fails closed when an image is mixed with another attachment type", () => {
  const inbound = parseMetaInboundMessage({
    mid: "mixed-image-audio",
    attachments: [
      {
        type: "image",
        payload: {
          url: "https://cdn.example.test/product.jpg",
        },
      },
      {
        type: "audio",
        payload: {
          url: "https://cdn.example.test/question.mp3",
        },
      },
    ],
  });

  assert.ok(inbound);

  // The image is only part of the customer's message. Processing it alone
  // would silently discard the meaning carried by the other attachment.
  assert.equal(selectMetaInboundImageUrl(inbound), null);
});


test("image URL selection fails closed for missing, non-HTTPS, or ambiguous images", () => {
  const cases = [
    {
      attachments: [
        {
          type: "image",
          payload: {},
        },
      ],
    },
    {
      attachments: [
        {
          type: "image",
          payload: {
            url: "http://cdn.example.test/image.jpg",
          },
        },
      ],
    },
    {
      attachments: [
        {
          type: "image",
          payload: {
            url: "https://cdn.example.test/one.jpg",
          },
        },
        {
          type: "image",
          payload: {
            url: "https://cdn.example.test/two.jpg",
          },
        },
      ],
    },
    {
      attachments: [
        {
          type: "audio",
          payload: {
            url: "https://cdn.example.test/audio.mp3",
          },
        },
      ],
    },
  ];

  for (const message of cases) {
    const inbound = parseMetaInboundMessage(message);
    assert.ok(inbound);
    assert.equal(selectMetaInboundImageUrl(inbound), null);
  }
});

test("selects exactly one explicit HTTPS audio URL for transcription", () => {
  const inbound = parseMetaInboundMessage({
    mid: "audio-one",
    attachments: [
      {
        type: "audio",
        payload: {
          url: "https://cdn.example.test/private-question.mp3",
        },
      },
    ],
  });

  assert.ok(inbound);
  assert.equal(
    selectMetaInboundAudioUrl(inbound),
    "https://cdn.example.test/private-question.mp3",
  );
});

test("audio URL selection fails closed for non-HTTPS, mixed, or ambiguous attachments", () => {
  const cases = [
    {
      attachments: [
        {
          type: "audio",
          payload: { url: "http://cdn.example.test/question.mp3" },
        },
      ],
    },
    {
      attachments: [
        {
          type: "audio",
          payload: { url: "https://cdn.example.test/question.mp3" },
        },
        {
          type: "image",
          payload: { url: "https://cdn.example.test/product.jpg" },
        },
      ],
    },
    {
      attachments: [
        {
          type: "audio",
          payload: { url: "https://cdn.example.test/one.mp3" },
        },
        {
          type: "audio",
          payload: { url: "https://cdn.example.test/two.mp3" },
        },
      ],
    },
  ];

  for (const message of cases) {
    const inbound = parseMetaInboundMessage(message);
    assert.ok(inbound);
    assert.equal(selectMetaInboundAudioUrl(inbound), null);
  }
});
