import type { Request, Response } from "express";
import {
  KnowledgeConflictError,
  KnowledgeNotFoundError,
  KnowledgeTransitionError,
} from "../services/knowledge/knowledgeRepository.js";
import { KnowledgeRuntimeGateError } from "../services/knowledge/postgresKnowledgeRuntime.js";
import type { KnowledgeLanguage } from "../services/knowledge/types.js";

export function readExpectedVersion(req: Request): number | null {
  const bodyVersion = Number(req.body?.expectedVersion);
  if (Number.isInteger(bodyVersion) && bodyVersion > 0) return bodyVersion;

  const rawHeader = String(req.headers["if-match"] || "")
    .replace(/^W\//i, "")
    .replace(/^"|"$/g, "")
    .trim();
  const headerVersion = Number(rawHeader);
  return Number.isInteger(headerVersion) && headerVersion > 0
    ? headerVersion
    : null;
}

export function readLanguage(value: unknown): KnowledgeLanguage | null {
  return value === "ar" || value === "ku" || value === "en" ? value : null;
}

export function readString(value: unknown, maxLength = 2_000): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function sendKnowledgeError(res: Response, error: unknown): void {
  if (error instanceof KnowledgeRuntimeGateError) {
    res.setHeader("Cache-Control", "no-store");
    res.status(error.status).json({
      ok: false,
      code: error.code,
      error: error.message,
    });
    return;
  }
  if (error instanceof KnowledgeConflictError) {
    res.status(409).json({
      ok: false,
      code: "VERSION_CONFLICT",
      error: error.message,
      current: error.current,
    });
    return;
  }
  if (error instanceof KnowledgeNotFoundError) {
    res.status(404).json({ ok: false, code: "NOT_FOUND", error: error.message });
    return;
  }
  if (error instanceof KnowledgeTransitionError) {
    res.status(422).json({ ok: false, code: error.code, error: error.message });
    return;
  }
  res.status(500).json({
    ok: false,
    code: "KNOWLEDGE_OPERATION_FAILED",
    error: "knowledge operation failed",
  });
}
