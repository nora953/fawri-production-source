import fs from "fs/promises";
import path from "path";
import {
  AgentIntent,
  ConversationState,
  IncomingCustomerMessage,
  LanguageCode,
  OrderDraft,
} from "./agentTypes";

type ConversationStateDb = {
  states: Record<string, ConversationState>;
};

const CONVERSATION_STATE_FILE =
  process.env.CONVERSATION_STATE_FILE ||
  path.join(process.cwd(), "data", "conversation-state.json");

let cache: ConversationStateDb | null = null;

function getStateKey(merchantId: string, customerId: string): string {
  return `${merchantId}::${customerId}`;
}

async function ensureDataDir() {
  await fs.mkdir(path.dirname(CONVERSATION_STATE_FILE), { recursive: true });
}

async function loadDb(): Promise<ConversationStateDb> {
  if (cache) return cache;

  try {
    const raw = await fs.readFile(CONVERSATION_STATE_FILE, "utf8");
    cache = JSON.parse(raw) as ConversationStateDb;

    if (!cache.states || typeof cache.states !== "object") {
      cache = { states: {} };
    }

    return cache;
  } catch {
    cache = { states: {} };
    return cache;
  }
}

async function saveDb(db: ConversationStateDb) {
  await ensureDataDir();

  const tmpFile = `${CONVERSATION_STATE_FILE}.tmp`;

  await fs.writeFile(tmpFile, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmpFile, CONVERSATION_STATE_FILE);

  cache = db;
}

export async function getConversationState(
  incoming: Pick<
    IncomingCustomerMessage,
    "merchantId" | "customerId" | "channel"
  >,
): Promise<ConversationState> {
  const db = await loadDb();

  const key = getStateKey(incoming.merchantId, incoming.customerId);
  const existing = db.states[key];

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();

  return {
    merchantId: incoming.merchantId,
    customerId: incoming.customerId,
    channel: incoming.channel,

    activeProductId: null,
    activeProductName: null,
    orderDraft: null,

    lastIntent: null,
    lastLanguage: null,
    lastCustomerMessage: null,
    lastAgentReply: null,

    processedMessageIds: [],

    createdAt: now,
    updatedAt: now,
  };
}

export async function saveConversationState(
  state: ConversationState,
): Promise<ConversationState> {
  const db = await loadDb();

  const key = getStateKey(state.merchantId, state.customerId);

  const cleanedState: ConversationState = {
    ...state,
    processedMessageIds: uniqueList(state.processedMessageIds).slice(-80),
    updatedAt: new Date().toISOString(),
  };

  db.states[key] = cleanedState;

  await saveDb(db);

  return cleanedState;
}

export function wasMessageProcessed(
  state: ConversationState,
  messageId?: string,
): boolean {
  if (!messageId) return false;
  return state.processedMessageIds.includes(messageId);
}

export async function markMessageProcessed(input: {
  state: ConversationState;
  messageId?: string;
}): Promise<ConversationState> {
  const ids = [...input.state.processedMessageIds];

  if (input.messageId) {
    ids.push(input.messageId);
  }

  const newState: ConversationState = {
    ...input.state,
    processedMessageIds: uniqueList(ids).slice(-80),
    updatedAt: new Date().toISOString(),
  };

  return saveConversationState(newState);
}

export function reduceConversationState(input: {
  state: ConversationState;
  customerMessage: string;
  agentReply: string;
  intent: AgentIntent;
  language: LanguageCode;
  messageId?: string;

  activeProductId?: string | null;
  activeProductName?: string | null;

  orderDraftPatch?: OrderDraft | null;
}): ConversationState {
  const {
    state,
    customerMessage,
    agentReply,
    intent,
    language,
    messageId,
    activeProductId,
    activeProductName,
    orderDraftPatch,
  } = input;

  let nextActiveProductId = state.activeProductId ?? null;
  let nextActiveProductName = state.activeProductName ?? null;
  let nextOrderDraft = state.orderDraft ?? null;

  /*
    القاعدة المهمة:
    آخر رسالة لها الأولوية،
    لكن لا نمسح السياق القديم إلا إذا العميل غيّر رأيه أو طلب إلغاء.
  */

  if (intent === "order_cancel") {
    nextActiveProductId = null;
    nextActiveProductName = null;
    nextOrderDraft = null;
  } else if (intent === "product_switch") {
    nextActiveProductId = activeProductId ?? null;
    nextActiveProductName = activeProductName ?? null;
    nextOrderDraft = null;
  } else if (intent === "order_create" || intent === "order_update") {
    if (activeProductId !== undefined) {
      nextActiveProductId = activeProductId;
    }

    if (activeProductName !== undefined) {
      nextActiveProductName = activeProductName;
    }

    nextOrderDraft = mergeOrderDraft(nextOrderDraft, orderDraftPatch ?? {});
  } else {
    /*
      في باقي الحالات لا نمسح السياق.
      مثال:
      العميل كان يسأل عن منتج، ثم قال "شكد التوصيل؟"
      هنا نحافظ على المنتج السابق ونرد على سؤال التوصيل.
    */
    if (activeProductId !== undefined) {
      nextActiveProductId = activeProductId;
    }

    if (activeProductName !== undefined) {
      nextActiveProductName = activeProductName;
    }

    if (orderDraftPatch) {
      nextOrderDraft = mergeOrderDraft(nextOrderDraft, orderDraftPatch);
    }
  }

  const processedMessageIds = [...state.processedMessageIds];

  if (messageId) {
    processedMessageIds.push(messageId);
  }

  return {
    ...state,

    activeProductId: nextActiveProductId,
    activeProductName: nextActiveProductName,
    orderDraft: nextOrderDraft,

    lastIntent: intent,
    lastLanguage: language,
    lastCustomerMessage: customerMessage,
    lastAgentReply: agentReply,

    processedMessageIds: uniqueList(processedMessageIds).slice(-80),

    updatedAt: new Date().toISOString(),
  };
}

export async function updateConversationAfterReply(input: {
  state: ConversationState;
  customerMessage: string;
  agentReply: string;
  intent: AgentIntent;
  language: LanguageCode;
  messageId?: string;

  activeProductId?: string | null;
  activeProductName?: string | null;
  orderDraftPatch?: OrderDraft | null;
}): Promise<ConversationState> {
  const newState = reduceConversationState(input);

  return saveConversationState(newState);
}

export async function clearConversationContext(input: {
  merchantId: string;
  customerId: string;
}): Promise<void> {
  const db = await loadDb();
  const key = getStateKey(input.merchantId, input.customerId);

  delete db.states[key];

  await saveDb(db);
}

export async function listConversationStates(
  merchantId: string,
): Promise<ConversationState[]> {
  const db = await loadDb();

  return Object.values(db.states)
    .filter((state) => state.merchantId === merchantId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergeOrderDraft(
  current: OrderDraft | null,
  patch: OrderDraft,
): OrderDraft {
  return {
    ...(current ?? {}),
    ...removeUndefinedValues(patch),
  };
}

function removeUndefinedValues<T extends Record<string, unknown>>(input: T): T {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }

  return result as T;
}

function uniqueList(items: string[]): string[] {
  return Array.from(new Set(items.filter(Boolean)));
}
