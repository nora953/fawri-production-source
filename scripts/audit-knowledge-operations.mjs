#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function resolveRuntimePath() {
  const explicit = String(process.env.FAWRI_KNOWLEDGE_RUNTIME_PATH || "").trim();
  if (explicit) return path.resolve(explicit);
  const dataDir = String(process.env.FAWRI_DATA_DIR || "").trim();
  return dataDir
    ? path.resolve(dataDir, "knowledge-runtime.json")
    : path.resolve(process.cwd(), "artifacts/api-server/data/knowledge-runtime.json");
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function positiveVersion(value) {
  return Number.isInteger(value) && value > 0;
}

function duplicateIds(items) {
  const seen = new Set();
  const duplicates = [];
  for (const item of items) {
    if (!item?.id) continue;
    if (seen.has(item.id)) duplicates.push(item.id);
    seen.add(item.id);
  }
  return duplicates;
}

function findForbiddenContentKeys(value, trail = "root", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenContentKeys(item, `${trail}[${index}]`, findings));
    return findings;
  }
  if (!isObject(value)) return findings;
  for (const [key, nested] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower === "customertext" ||
      lower === "customermessage" ||
      lower === "rawcustomertext" ||
      lower === "rawmessage" ||
      lower === "conversationcontent"
    ) {
      findings.push(`${trail}.${key}`);
    }
    findForbiddenContentKeys(nested, `${trail}.${key}`, findings);
  }
  return findings;
}

export function auditKnowledgeRuntime(state) {
  const errors = [];
  const warnings = [];
  if (!isObject(state)) return { ok: false, errors: ["runtime root must be an object"], warnings, summary: {} };
  if (state.schemaVersion !== 1) errors.push("schemaVersion must equal 1");

  const savedAnswers = Array.isArray(state.savedAnswers) ? state.savedAnswers : [];
  const trainingRequests = Array.isArray(state.trainingRequests) ? state.trainingRequests : [];
  const learnedAnswers = Array.isArray(state.learnedAnswers) ? state.learnedAnswers : [];
  const auditEvents = Array.isArray(state.auditEvents) ? state.auditEvents : [];

  for (const name of ["savedAnswers", "trainingRequests", "learnedAnswers", "auditEvents"]) {
    if (!Array.isArray(state[name])) errors.push(`${name} must be an array`);
  }

  for (const id of duplicateIds(savedAnswers)) errors.push(`duplicate saved answer id: ${id}`);
  for (const id of duplicateIds(trainingRequests)) errors.push(`duplicate training request id: ${id}`);
  for (const id of duplicateIds(learnedAnswers)) errors.push(`duplicate learned answer id: ${id}`);

  const trainingById = new Map(trainingRequests.map((item) => [item.id, item]));
  for (const answer of savedAnswers) {
    if (!answer?.merchantId) errors.push(`saved answer ${answer?.id || "<unknown>"} has no merchantId`);
    if (answer?.source !== "merchant_approved") errors.push(`saved answer ${answer?.id} must be merchant_approved`);
    if (!positiveVersion(answer?.version)) errors.push(`saved answer ${answer?.id} has invalid version`);
    if (!answer?.questionPattern || !answer?.answerText) errors.push(`saved answer ${answer?.id} is incomplete`);
  }

  const allowedStatuses = new Set(["pending_merchant_reply", "pending_review", "approved", "rejected"]);
  for (const request of trainingRequests) {
    if (!request?.merchantId) errors.push(`training request ${request?.id || "<unknown>"} has no merchantId`);
    if (!allowedStatuses.has(request?.status)) errors.push(`training request ${request?.id} has invalid status`);
    if (!positiveVersion(request?.version)) errors.push(`training request ${request?.id} has invalid version`);
    if (!request?.customerTextHash) errors.push(`training request ${request?.id} has no customer text digest`);
    if (request?.suggestedReplySource === "openai_generated" && request?.status === "approved") {
      errors.push(`training request ${request?.id} is approved while provenance is still openai_generated`);
    }
  }

  for (const answer of learnedAnswers) {
    if (!answer?.merchantId) errors.push(`learned answer ${answer?.id || "<unknown>"} has no merchantId`);
    if (!positiveVersion(answer?.version)) errors.push(`learned answer ${answer?.id} has invalid version`);
    if (answer?.source === "openai_generated") {
      if (answer?.safeToAutoReply === true) errors.push(`generated learned answer ${answer?.id} is marked safe`);
      if (answer?.approvalStatus === "approved") errors.push(`generated learned answer ${answer?.id} is approved without provenance conversion`);
    }
    if (answer?.safeToAutoReply === true && (answer?.source !== "merchant_approved" || answer?.approvalStatus !== "approved")) {
      errors.push(`learned answer ${answer?.id} is safe without merchant approval`);
    }
    if (answer?.trainingRequestId) {
      const request = trainingById.get(answer.trainingRequestId);
      if (!request) errors.push(`learned answer ${answer?.id} references missing training request`);
      else if (request.merchantId !== answer.merchantId) errors.push(`learned answer ${answer?.id} crosses tenant boundary`);
    }
  }

  for (const event of auditEvents) {
    if (!event?.merchantId) errors.push(`audit event ${event?.id || "<unknown>"} has no merchantId`);
    if (typeof event?.customerTextLength === "number" && event.customerTextLength < 0) {
      errors.push(`audit event ${event?.id} has invalid customerTextLength`);
    }
  }

  const forbiddenPaths = findForbiddenContentKeys({ trainingRequests, auditEvents });
  for (const forbidden of forbiddenPaths) errors.push(`full customer content field is forbidden: ${forbidden}`);
  if (auditEvents.length > 2_000) warnings.push("audit event count exceeds the transitional JSON retention limit");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      savedAnswers: savedAnswers.length,
      trainingRequests: trainingRequests.length,
      learnedAnswers: learnedAnswers.length,
      auditEvents: auditEvents.length,
      merchants: new Set([
        ...savedAnswers.map((item) => item.merchantId),
        ...trainingRequests.map((item) => item.merchantId),
        ...learnedAnswers.map((item) => item.merchantId),
      ].filter(Boolean)).size,
    },
  };
}

async function main() {
  const filePath = resolveRuntimePath();
  let state;
  try {
    state = JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "READ_FAILED";
    console.error(JSON.stringify({ ok: false, filePath, code, error: "knowledge runtime could not be read" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const result = auditKnowledgeRuntime(state);
  console.log(JSON.stringify({ filePath, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  await main();
}
