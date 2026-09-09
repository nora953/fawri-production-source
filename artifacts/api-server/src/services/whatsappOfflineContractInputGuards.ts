import { types as utilTypes } from "node:util";

function shapeError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    code: "WHATSAPP_OFFLINE_CONTRACT_SHAPE_INVALID",
  });
}

function fail(message: string): never {
  throw shapeError(message);
}

function plainDataRecord(
  value: unknown,
  label: string,
  allowed?: readonly string[],
): Record<string, unknown> {
  try {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      utilTypes.isProxy(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      fail(`${label} must be a plain object`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      fail(`${label} cannot contain symbol properties`);
    }
    const names = Object.getOwnPropertyNames(value);
    const keys = Object.keys(value);
    if (names.length !== keys.length) {
      fail(`${label} cannot contain hidden properties`);
    }
    const allowedSet = allowed ? new Set(allowed) : null;
    for (const key of keys) {
      if (allowedSet && !allowedSet.has(key)) {
        fail(`${label} contains unsupported property ${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
        fail(`${label} must contain enumerable data properties only`);
      }
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (
      (error as { code?: string })?.code ===
      "WHATSAPP_OFFLINE_CONTRACT_SHAPE_INVALID"
    ) {
      throw error;
    }
    fail(`${label} could not be inspected safely`);
  }
}

function data(
  record: Record<string, unknown>,
  key: string,
  required = true,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor) {
    if (required) fail(`required ${key} property is missing`);
    return undefined;
  }
  if (!("value" in descriptor) || !descriptor.enumerable) {
    fail(`${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function scalar(
  value: unknown,
  label: string,
  options: { optional?: boolean; nullable?: boolean } = {},
): void {
  if (value === undefined && options.optional) return;
  if (value === null && options.nullable) return;
  if (typeof value !== "string" && typeof value !== "number") {
    fail(`${label} must be a scalar string or number`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    fail(`${label} must be finite`);
  }
}

function safeArrayFirst(value: unknown, label: string): unknown {
  if (!Array.isArray(value)) return undefined;
  if (utilTypes.isProxy(value)) fail(`${label} cannot be a proxy`);
  if (Object.getOwnPropertySymbols(value).length > 0) {
    fail(`${label} cannot contain symbol properties`);
  }
  if (value.length === 0) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, "0");
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
    fail(`${label} first item must be an enumerable data property`);
  }
  return descriptor.value;
}

function inspectProviderResponseBody(value: unknown): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") return;
  if (utilTypes.isProxy(value)) fail("provider response body cannot be a proxy");
  if (Array.isArray(value)) return;

  const body = plainDataRecord(value, "provider response body");
  const messages = data(body, "messages", false);
  if (messages !== undefined) {
    const first = safeArrayFirst(messages, "provider messages");
    if (first !== undefined) {
      if (
        first &&
        typeof first === "object" &&
        !Array.isArray(first)
      ) {
        const message = plainDataRecord(first, "provider message");
        const id = data(message, "id", false);
        if (id !== undefined) {
          scalar(id, "provider message id", { nullable: true });
        }
      }
    }
  }

  const rawError = data(body, "error", false);
  if (
    rawError &&
    typeof rawError === "object" &&
    !Array.isArray(rawError)
  ) {
    const error = plainDataRecord(rawError, "provider error");
    const code = data(error, "code", false);
    if (code !== undefined) scalar(code, "provider error code", { nullable: true });
    const subcode = data(error, "error_subcode", false);
    if (subcode !== undefined) {
      scalar(subcode, "provider error subcode", { nullable: true });
    }
  }
}

export function assertWhatsAppTextSendBuildInputStructure(value: unknown): void {
  const input = plainDataRecord(value, "WhatsApp text-send build input", [
    "phoneNumberId",
    "to",
    "messageText",
    "graphVersion",
  ]);
  scalar(data(input, "phoneNumberId"), "phone-number id");
  scalar(data(input, "to"), "recipient");
  scalar(data(input, "messageText"), "message text");
  scalar(data(input, "graphVersion"), "Graph API version");
}

export function assertWhatsAppSendResponseInputStructure(value: unknown): void {
  const input = plainDataRecord(value, "WhatsApp send-response input", [
    "httpStatus",
    "body",
  ]);
  scalar(data(input, "httpStatus"), "HTTP status");
  inspectProviderResponseBody(data(input, "body"));
}
