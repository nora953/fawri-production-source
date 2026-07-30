from pathlib import Path

AUTH = Path('artifacts/api-server/src/routes/auth.ts')
ADMIN_SUPPORT = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')
ADMIN_PAGE = Path('artifacts/fawri/src/pages/AdminPage.tsx')
MERCHANT_SUPPORT = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


# ── Backend ────────────────────────────────────────────────────────────────────
auth = AUTH.read_text(encoding='utf-8')

auth = replace_once(
    auth,
    'type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";\ntype SupportMessageSender = "merchant" | "admin" | "system";\n',
    '''type SupportTicketStatus = "open" | "in_progress" | "resolved" | "closed";
type SupportMessageSender = "merchant" | "admin" | "system";
type InspectionSessionMode = "live_observation" | "independent_read_only";
type InspectionSessionRequestStatus = "pending" | "approved" | "rejected" | "expired";

type InspectionSessionRequestRecord = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_id: string;
  admin_name: string;
  mode: InspectionSessionMode;
  reason: string;
  status: InspectionSessionRequestStatus;
  read_only: true;
  session_duration_minutes: 30;
  requested_at: string;
  request_expires_at: string;
  responded_at?: string;
  approved_at?: string;
  rejected_at?: string;
  expired_at?: string;
  session_expires_at?: string;
};
''',
    'backend inspection types',
)

auth = replace_once(
    auth,
    '''  closed_at?: string;
  messages: SupportTicketMessage[];
};
''',
    '''  closed_at?: string;
  messages: SupportTicketMessage[];
  inspection_requests: InspectionSessionRequestRecord[];
};
''',
    'backend ticket inspection field',
)

auth = replace_once(
    auth,
    '''function requireSupportAssistant(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return null;

  if (!isAssistantAdmin(admin)) {
    sendError(res, 403, "owner admin has monitor-only support access", {
      code: "SUPPORT_OWNER_MONITOR_ONLY",
    });
    return null;
  }

  return admin;
}
''',
    '''function requireSupportAssistant(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return null;

  if (!isAssistantAdmin(admin)) {
    sendError(res, 403, "owner admin has monitor-only support access", {
      code: "SUPPORT_OWNER_MONITOR_ONLY",
    });
    return null;
  }

  return admin;
}

function requireInspectionSupportAssistant(
  req: Request,
  res: Response,
): Merchant | null {
  const admin = requireAdminSession(req, res);
  if (!admin) return null;

  if (!isAssistantAdmin(admin)) {
    sendError(res, 403, "owner admin has monitor-only support access", {
      code: "SUPPORT_OWNER_MONITOR_ONLY",
    });
    return null;
  }

  const requiredPermissions: readonly AdminPermission[] = [
    "manage_support",
    "inspect_merchant_sessions",
  ];
  const missingPermissions = requiredPermissions.filter(
    (permission) => !adminHasPermission(admin, permission),
  );
  if (missingPermissions.length > 0) {
    sendError(res, 403, "admin permission is required", {
      code: "ADMIN_PERMISSION_REQUIRED",
      permissions: requiredPermissions,
      missing_permissions: missingPermissions,
    });
    return null;
  }

  return admin;
}
''',
    'backend inspection permission helper',
)

auth = replace_once(
    auth,
    '''function writeDb(db: AuthDb): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function findRegularMerchant''',
    '''function writeDb(db: AuthDb): void {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function isInspectionSessionMode(value: unknown): value is InspectionSessionMode {
  return value === "live_observation" || value === "independent_read_only";
}

function isInspectionSessionRequestStatus(
  value: unknown,
): value is InspectionSessionRequestStatus {
  return value === "pending" || value === "approved" || value === "rejected" || value === "expired";
}

function normalizeInspectionRequests(value: unknown): InspectionSessionRequestRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (item): item is InspectionSessionRequestRecord =>
        Boolean(
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string" &&
          typeof item.ticket_id === "string" &&
          typeof item.merchant_id === "string" &&
          typeof item.admin_id === "string" &&
          typeof item.admin_name === "string" &&
          isInspectionSessionMode(item.mode) &&
          typeof item.reason === "string" &&
          isInspectionSessionRequestStatus(item.status) &&
          item.read_only === true &&
          item.session_duration_minutes === 30 &&
          typeof item.requested_at === "string" &&
          typeof item.request_expires_at === "string",
        ),
    )
    .sort(
      (left, right) =>
        new Date(right.requested_at).getTime() - new Date(left.requested_at).getTime(),
    );
}

function refreshInspectionRequestExpirations(db: AuthDb): boolean {
  const timestamp = Date.now();
  let changed = false;

  for (const ticket of db.support_tickets) {
    for (const request of ticket.inspection_requests || []) {
      const pendingExpired =
        request.status === "pending" &&
        new Date(request.request_expires_at).getTime() <= timestamp;
      const approvedExpired =
        request.status === "approved" &&
        Boolean(request.session_expires_at) &&
        new Date(request.session_expires_at || 0).getTime() <= timestamp;

      if (!pendingExpired && !approvedExpired) continue;

      const expiredAt = now();
      request.status = "expired";
      request.expired_at = expiredAt;
      request.responded_at = request.responded_at || expiredAt;
      ticket.updated_at = expiredAt;
      changed = true;
    }
  }

  return changed;
}

function hasActiveInspectionRequest(db: AuthDb, merchantId: string): boolean {
  const timestamp = Date.now();
  return db.support_tickets.some(
    (ticket) =>
      ticket.merchant_id === merchantId &&
      (ticket.inspection_requests || []).some((request) => {
        if (request.status === "pending") {
          return new Date(request.request_expires_at).getTime() > timestamp;
        }
        if (request.status === "approved") {
          return new Date(request.session_expires_at || 0).getTime() > timestamp;
        }
        return false;
      }),
  );
}

function findRegularMerchant''',
    'backend inspection normalization helpers',
)

auth = replace_once(
    auth,
    '''      support_tickets: Array.isArray(parsed.support_tickets)
        ? parsed.support_tickets.filter(
            (ticket): ticket is SupportTicketRecord =>
              Boolean(
                ticket &&
                typeof ticket === "object" &&
                !Array.isArray(ticket) &&
                typeof ticket.id === "string" &&
                typeof ticket.merchant_id === "string" &&
                typeof ticket.subject === "string" &&
                Array.isArray(ticket.messages),
              ),
          )
        : [],
''',
    '''      support_tickets: Array.isArray(parsed.support_tickets)
        ? parsed.support_tickets
            .filter(
              (ticket): ticket is SupportTicketRecord =>
                Boolean(
                  ticket &&
                  typeof ticket === "object" &&
                  !Array.isArray(ticket) &&
                  typeof ticket.id === "string" &&
                  typeof ticket.merchant_id === "string" &&
                  typeof ticket.subject === "string" &&
                  Array.isArray(ticket.messages),
                ),
            )
            .map((ticket) => ({
              ...ticket,
              inspection_requests: normalizeInspectionRequests(ticket.inspection_requests),
            }))
        : [],
''',
    'backend db inspection normalization',
)

auth = replace_once(
    auth,
    '''router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  const tickets = db.support_tickets
''',
    '''router.get("/support/tickets", requireMerchantSession, (_req: Request, res: Response) => {
  const merchantId = getMerchantIdFromSession(res);
  const db = ensureDb();
  if (refreshInspectionRequestExpirations(db)) writeDb(db);
  const tickets = db.support_tickets
''',
    'backend merchant ticket list expiration refresh',
)

auth = replace_once(
    auth,
    '''    updated_at: createdAt,
    messages: [
''',
    '''    updated_at: createdAt,
    inspection_requests: [],
    messages: [
''',
    'backend new ticket inspection array',
)

auth = replace_once(
    auth,
    '''    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    const ticket = db.support_tickets.find(
''',
    '''    const ticketId = String(req.params.id || "").trim();
    const db = ensureDb();
    if (refreshInspectionRequestExpirations(db)) writeDb(db);
    const ticket = db.support_tickets.find(
''',
    'backend single merchant ticket expiration refresh',
)

auth = replace_once(
    auth,
    '''router.get("/admin/support/tickets", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return;

  const db = ensureDb();
  const tickets = [...db.support_tickets].sort(
''',
    '''router.get("/admin/support/tickets", (req: Request, res: Response) => {
  const admin = requireAdminPermission(req, res, "manage_support");
  if (!admin) return;

  const db = ensureDb();
  if (refreshInspectionRequestExpirations(db)) writeDb(db);
  const tickets = [...db.support_tickets].sort(
''',
    'backend admin ticket expiration refresh',
)

merchant_decision_route = '''
router.post(
  "/support/tickets/:id/inspection-requests/:requestId/decision",
  requireMerchantSession,
  (req: Request, res: Response) => {
    const merchantId = getMerchantIdFromSession(res);
    const ticketId = String(req.params.id || "").trim();
    const requestId = String(req.params.requestId || "").trim();
    const decision = String(req.body?.decision || "").trim();
    const db = ensureDb();
    refreshInspectionRequestExpirations(db);

    const ticket = db.support_tickets.find(
      (item) => item.id === ticketId && item.merchant_id === merchantId,
    );
    if (!ticket) return sendError(res, 404, "support ticket not found");

    const inspectionRequest = (ticket.inspection_requests || []).find(
      (item) => item.id === requestId,
    );
    if (!inspectionRequest) {
      return sendError(res, 404, "inspection session request not found");
    }
    if (inspectionRequest.status !== "pending") {
      writeDb(db);
      return sendError(res, 409, "inspection session request is no longer pending", {
        code: "INSPECTION_REQUEST_NOT_PENDING",
        status: inspectionRequest.status,
      });
    }
    if (decision !== "approve" && decision !== "reject") {
      return sendError(res, 400, "invalid inspection session decision");
    }

    const respondedAt = now();
    inspectionRequest.responded_at = respondedAt;
    if (decision === "approve") {
      inspectionRequest.status = "approved";
      inspectionRequest.approved_at = respondedAt;
      inspectionRequest.session_expires_at = new Date(
        Date.now() + inspectionRequest.session_duration_minutes * 60 * 1000,
      ).toISOString();
    } else {
      inspectionRequest.status = "rejected";
      inspectionRequest.rejected_at = respondedAt;
    }
    ticket.updated_at = respondedAt;

    writeDb(db);
    emitMerchantRealtimeState(db, merchantId, "support_updated");
    return res.json({ ok: true, ticket, inspection_request: inspectionRequest });
  },
);

'''

auth = replace_once(
    auth,
    'router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {',
    merchant_decision_route + 'router.get("/subscription/current", requireMerchantSession, (_req: Request, res: Response) => {',
    'backend merchant inspection decision route',
)

admin_request_route = '''
router.post(
  "/admin/support/tickets/:id/inspection-requests",
  (req: Request, res: Response) => {
    const admin = requireInspectionSupportAssistant(req, res);
    if (!admin) return;

    const ticketId = String(req.params.id || "").trim();
    const mode = String(req.body?.mode || "").trim() as InspectionSessionMode;
    const reason = String(req.body?.reason || "").trim();
    const db = ensureDb();
    refreshInspectionRequestExpirations(db);

    const ticket = db.support_tickets.find((item) => item.id === ticketId);
    if (!ticket) return sendError(res, 404, "support ticket not found");
    if (ticket.status !== "open" && ticket.status !== "in_progress") {
      return sendError(res, 409, "inspection request requires an active support ticket", {
        code: "INSPECTION_ACTIVE_TICKET_REQUIRED",
      });
    }
    if (!ticket.assigned_admin_id) {
      return sendError(res, 409, "support ticket must be claimed first", {
        code: "SUPPORT_TICKET_NOT_CLAIMED",
      });
    }
    if (ticket.assigned_admin_id !== admin.id) {
      return sendError(res, 403, "support ticket is assigned to another admin", {
        code: "SUPPORT_TICKET_ASSIGNED_TO_ANOTHER_ADMIN",
      });
    }
    if (!isInspectionSessionMode(mode)) {
      return sendError(res, 400, "invalid inspection session mode");
    }
    if (reason.length < 5 || reason.length > 500) {
      return sendError(res, 400, "invalid inspection session reason");
    }
    if (hasActiveInspectionRequest(db, ticket.merchant_id)) {
      return sendError(res, 409, "merchant already has an active inspection request", {
        code: "INSPECTION_REQUEST_ALREADY_ACTIVE",
      });
    }

    const requestedAt = now();
    const inspectionRequest: InspectionSessionRequestRecord = {
      id: makeId("inspection-request"),
      ticket_id: ticket.id,
      merchant_id: ticket.merchant_id,
      admin_id: admin.id,
      admin_name: admin.owner_name,
      mode,
      reason,
      status: "pending",
      read_only: true,
      session_duration_minutes: 30,
      requested_at: requestedAt,
      request_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };

    ticket.inspection_requests = ticket.inspection_requests || [];
    ticket.inspection_requests.unshift(inspectionRequest);
    ticket.updated_at = requestedAt;

    appendAdminLog(
      db,
      admin,
      { id: ticket.merchant_id, store_name: ticket.merchant_name },
      "inspection_session_requested",
      ticket.subject,
      {
        meta: {
          ticket_id: ticket.id,
          request_id: inspectionRequest.id,
          mode,
        },
        reason,
      },
    );
    writeDb(db);
    emitMerchantRealtimeState(db, ticket.merchant_id, "support_updated");
    return res.status(201).json({
      ok: true,
      ticket,
      inspection_request: inspectionRequest,
    });
  },
);

'''

auth = replace_once(
    auth,
    'router.patch(\n  "/admin/support/tickets/:id/status",',
    admin_request_route + 'router.patch(\n  "/admin/support/tickets/:id/status",',
    'backend admin inspection request route',
)

AUTH.write_text(auth, encoding='utf-8')


# ── Admin page permission handoff ──────────────────────────────────────────────
admin_page = ADMIN_PAGE.read_text(encoding='utf-8')
admin_page = replace_once(
    admin_page,
    '''            adminId={currentAdmin.id}
            isOwner={isOwnerAdmin}
            onActiveCountChange={setSupportActiveCount}
''',
    '''            adminId={currentAdmin.id}
            isOwner={isOwnerAdmin}
            canInspectSessions={canInspectSessions}
            onActiveCountChange={setSupportActiveCount}
''',
    'admin page inspection permission prop',
)
ADMIN_PAGE.write_text(admin_page, encoding='utf-8')


# ── Admin support UI ───────────────────────────────────────────────────────────
admin = ADMIN_SUPPORT.read_text(encoding='utf-8')
admin = replace_once(
    admin,
    '''  CheckCircle2,
  Headphones,
''',
    '''  CheckCircle2,
  Eye,
  Headphones,
''',
    'admin inspection icon import',
)
admin = replace_once(
    admin,
    '''type AdminSupportMessage = {
''',
    '''type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type InspectionSessionRequest = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_id: string;
  admin_name: string;
  mode: InspectionSessionMode;
  reason: string;
  status: InspectionSessionRequestStatus;
  read_only: true;
  session_duration_minutes: 30;
  requested_at: string;
  request_expires_at: string;
  responded_at?: string;
  approved_at?: string;
  rejected_at?: string;
  expired_at?: string;
  session_expires_at?: string;
};

type AdminSupportMessage = {
''',
    'admin inspection request type',
)
admin = replace_once(
    admin,
    '''  closed_at?: string;
  messages: AdminSupportMessage[];
};
''',
    '''  closed_at?: string;
  messages: AdminSupportMessage[];
  inspection_requests?: InspectionSessionRequest[];
};
''',
    'admin ticket inspection field',
)

# Add localized strings after logInProgress in each language.
admin = replace_once(
    admin,
    """    logInProgress: 'تذكرة دعم قيد المعالجة',
""",
    """    logInProgress: 'تذكرة دعم قيد المعالجة',
    requestInspection: 'طلب جلسة فحص',
    inspectionTitle: 'طلب فحص حساب التاجر',
    inspectionMode: 'نوع الجلسة',
    inspectionLive: 'مشاهدة مباشرة',
    inspectionReadOnly: 'فحص مستقل للقراءة فقط',
    inspectionReason: 'سبب طلب الفحص',
    inspectionReasonPlaceholder: 'اكتب سببًا واضحًا لطلب الجلسة...',
    inspectionRules: 'الجلسة للقراءة فقط، تتطلب موافقة التاجر، ومدتها 30 دقيقة. ينتهي الطلب بعد 10 دقائق إن لم يُقبل.',
    inspectionSend: 'إرسال الطلب',
    inspectionSending: 'جارٍ الإرسال...',
    inspectionCancel: 'إلغاء',
    inspectionSuccess: 'تم إرسال طلب جلسة الفحص إلى التاجر.',
    inspectionError: 'تعذر إرسال طلب جلسة الفحص.',
    inspectionRequestedBy: 'المسؤول الطالب',
    inspectionStatusPending: 'بانتظار موافقة التاجر',
    inspectionStatusApproved: 'وافق التاجر',
    inspectionStatusRejected: 'رفض التاجر',
    inspectionStatusExpired: 'انتهت صلاحية الطلب',
    inspectionExpires: 'انتهاء الطلب',
    inspectionDuration: 'المدة عند الموافقة: 30 دقيقة',
""",
    'admin Arabic inspection strings',
)
admin = replace_once(
    admin,
    """    logInProgress: 'تیکێتی پشتگیری لە ژێر چارەسەرکردندا',
""",
    """    logInProgress: 'تیکێتی پشتگیری لە ژێر چارەسەرکردندا',
    requestInspection: 'داواکاری دانیشتنی پشکنین',
    inspectionTitle: 'داواکاری پشکنینی هەژماری بازرگان',
    inspectionMode: 'جۆری دانیشتن',
    inspectionLive: 'بینینی ڕاستەوخۆ',
    inspectionReadOnly: 'پشکنینی سەربەخۆی تەنها خوێندنەوە',
    inspectionReason: 'هۆکاری داواکاری پشکنین',
    inspectionReasonPlaceholder: 'هۆکارێکی ڕوون بنووسە...',
    inspectionRules: 'دانیشتنەکە تەنها خوێندنەوەیە، پێویستی بە ڕەزامەندی بازرگان هەیە و 30 خولەکە. داواکارییەکە دوای 10 خولەک بەسەر دەچێت.',
    inspectionSend: 'ناردنی داواکاری',
    inspectionSending: 'دەنێردرێت...',
    inspectionCancel: 'هەڵوەشاندنەوە',
    inspectionSuccess: 'داواکاری دانیشتنی پشکنین بۆ بازرگان نێردرا.',
    inspectionError: 'ناردنی داواکاری پشکنین سەرکەوتوو نەبوو.',
    inspectionRequestedBy: 'بەرپرسی داواکار',
    inspectionStatusPending: 'چاوەڕوانی ڕەزامەندی بازرگان',
    inspectionStatusApproved: 'بازرگان ڕازی بوو',
    inspectionStatusRejected: 'بازرگان ڕەتی کردەوە',
    inspectionStatusExpired: 'کاتی داواکارییەکە بەسەرچوو',
    inspectionExpires: 'کۆتایی کاتی داواکاری',
    inspectionDuration: 'ماوە لە دوای ڕەزامەندی: 30 خولەک',
""",
    'admin Kurdish inspection strings',
)
admin = replace_once(
    admin,
    """    logInProgress: 'Support ticket in progress',
""",
    """    logInProgress: 'Support ticket in progress',
    requestInspection: 'Request inspection session',
    inspectionTitle: 'Merchant account inspection request',
    inspectionMode: 'Session mode',
    inspectionLive: 'Live observation',
    inspectionReadOnly: 'Independent read-only inspection',
    inspectionReason: 'Reason for inspection',
    inspectionReasonPlaceholder: 'Write a clear reason for requesting the session...',
    inspectionRules: 'The session is read-only, requires merchant consent, and lasts 30 minutes. The request expires after 10 minutes if unanswered.',
    inspectionSend: 'Send request',
    inspectionSending: 'Sending...',
    inspectionCancel: 'Cancel',
    inspectionSuccess: 'The inspection session request was sent to the merchant.',
    inspectionError: 'Could not send the inspection session request.',
    inspectionRequestedBy: 'Requested by',
    inspectionStatusPending: 'Waiting for merchant consent',
    inspectionStatusApproved: 'Merchant approved',
    inspectionStatusRejected: 'Merchant rejected',
    inspectionStatusExpired: 'Request expired',
    inspectionExpires: 'Request expires',
    inspectionDuration: 'Duration after approval: 30 minutes',
""",
    'admin English inspection strings',
)
admin = replace_once(
    admin,
    '''type AdminSupportTabProps = {
  adminId: string;
  isOwner: boolean;
  onActiveCountChange?: (count: number) => void;
};
''',
    '''type AdminSupportTabProps = {
  adminId: string;
  isOwner: boolean;
  canInspectSessions: boolean;
  onActiveCountChange?: (count: number) => void;
};
''',
    'admin props inspection permission',
)
admin = replace_once(
    admin,
    '''export default function AdminSupportTab({
  adminId,
  isOwner,
  onActiveCountChange,
}: AdminSupportTabProps) {
''',
    '''export default function AdminSupportTab({
  adminId,
  isOwner,
  canInspectSessions,
  onActiveCountChange,
}: AdminSupportTabProps) {
''',
    'admin component inspection prop',
)
admin = replace_once(
    admin,
    '''  const [reply, setReply] = useState('');
  const [working, setWorking] = useState<'claim' | 'reply' | 'resolve' | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
''',
    '''  const [reply, setReply] = useState('');
  const [working, setWorking] = useState<'claim' | 'reply' | 'resolve' | 'inspection' | null>(null);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [inspectionMode, setInspectionMode] = useState<InspectionSessionMode>('live_observation');
  const [inspectionReason, setInspectionReason] = useState('');
  const conversationRef = useRef<HTMLDivElement | null>(null);
''',
    'admin inspection state',
)
admin = replace_once(
    admin,
    '''  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;
''',
    '''  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;
  const latestInspectionRequest = selectedTicket?.inspection_requests?.[0] ?? null;
''',
    'admin latest inspection request',
)
admin = replace_once(
    admin,
    '''  useLayoutEffect(() => {
''',
    '''  useEffect(() => {
    setShowInspectionForm(false);
    setInspectionMode('live_observation');
    setInspectionReason('');
  }, [selectedId]);

  useLayoutEffect(() => {
''',
    'admin reset inspection form',
)

inspection_request_function = '''
  const requestInspectionSession = async (event: React.FormEvent) => {
    event.preventDefault();
    const reason = inspectionReason.trim();
    if (!selectedTicket || isOwner || !canInspectSessions || reason.length < 5) return;

    setWorking('inspection');
    try {
      const response = await fetch(
        `/api/auth/admin/support/tickets/${encodeURIComponent(selectedTicket.id)}/inspection-requests`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAdminAuthHeaders() },
          body: JSON.stringify({ mode: inspectionMode, reason }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not request inspection session');
      }
      replaceTicket(data.ticket as AdminSupportTicket);
      setShowInspectionForm(false);
      setInspectionReason('');
      toast.success(text.inspectionSuccess);
    } catch (error) {
      console.error('Could not request inspection session:', error);
      toast.error(text.inspectionError);
    } finally {
      setWorking(null);
    }
  };

'''
admin = replace_once(
    admin,
    '  const resolveTicket = async () => {\n',
    inspection_request_function + '  const resolveTicket = async () => {\n',
    'admin request inspection function',
)
admin = replace_once(
    admin,
    '''  const categoryLabel = (category: AdminSupportCategory) =>
''',
    '''  const inspectionStatusLabel = (status: InspectionSessionRequestStatus) =>
    ({
      pending: text.inspectionStatusPending,
      approved: text.inspectionStatusApproved,
      rejected: text.inspectionStatusRejected,
      expired: text.inspectionStatusExpired,
    })[status];

  const inspectionModeLabel = (mode: InspectionSessionMode) =>
    mode === 'live_observation' ? text.inspectionLive : text.inspectionReadOnly;

  const inspectionStatusClass = (status: InspectionSessionRequestStatus) =>
    ({
      pending: 'border-yellow-300 bg-yellow-50 text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-100',
      approved: 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100',
      rejected: 'border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/30 dark:text-red-100',
      expired: 'border-border bg-muted/40 text-muted-foreground',
    })[status];

  const categoryLabel = (category: AdminSupportCategory) =>
''',
    'admin inspection labels',
)
admin = replace_once(
    admin,
    '''  const ticketIsActive =
    selectedTicket?.status === 'open' || selectedTicket?.status === 'in_progress';
''',
    '''  const ticketIsActive =
    selectedTicket?.status === 'open' || selectedTicket?.status === 'in_progress';
  const inspectionRequestIsActive =
    latestInspectionRequest?.status === 'pending' || latestInspectionRequest?.status === 'approved';
  const canRequestInspection =
    !isOwner &&
    canInspectSessions &&
    isAssignedToCurrentAdmin &&
    ticketIsActive &&
    !inspectionRequestIsActive;
''',
    'admin inspection eligibility',
)

admin_panel = '''

                {latestInspectionRequest && (
                  <div className={`shrink-0 border-b px-3 py-2 ${inspectionStatusClass(latestInspectionRequest.status)}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-black">{text.inspectionTitle}</p>
                        <p className="mt-1 text-xs font-semibold">{inspectionModeLabel(latestInspectionRequest.mode)}</p>
                        <p className="mt-1 text-xs leading-5">{latestInspectionRequest.reason}</p>
                      </div>
                      <span className="rounded-full bg-background/70 px-2.5 py-1 text-[10px] font-black">
                        {inspectionStatusLabel(latestInspectionRequest.status)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] opacity-80">
                      <span>{text.inspectionRequestedBy}: {latestInspectionRequest.admin_name}</span>
                      <span>{text.inspectionDuration}</span>
                      {latestInspectionRequest.status === 'pending' && (
                        <span>{text.inspectionExpires}: {new Date(latestInspectionRequest.request_expires_at).toLocaleString(locale)}</span>
                      )}
                    </div>
                  </div>
                )}

                {showInspectionForm && canRequestInspection && (
                  <form onSubmit={requestInspectionSession} className="shrink-0 space-y-2 border-b bg-muted/20 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs font-bold">
                        <span className="mb-1 block">{text.inspectionMode}</span>
                        <select
                          value={inspectionMode}
                          disabled={working !== null}
                          onChange={(event) => setInspectionMode(event.target.value as InspectionSessionMode)}
                          className="h-10 w-full rounded-xl border bg-background px-3 text-sm"
                        >
                          <option value="live_observation">{text.inspectionLive}</option>
                          <option value="independent_read_only">{text.inspectionReadOnly}</option>
                        </select>
                      </label>
                      <label className="text-xs font-bold">
                        <span className="mb-1 block">{text.inspectionReason}</span>
                        <Textarea
                          value={inspectionReason}
                          maxLength={500}
                          rows={2}
                          disabled={working !== null}
                          placeholder={text.inspectionReasonPlaceholder}
                          onChange={(event) => setInspectionReason(event.target.value)}
                          className="min-h-10 resize-none"
                        />
                      </label>
                    </div>
                    <p className="text-[10px] leading-4 text-muted-foreground">{text.inspectionRules}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" size="sm" disabled={working !== null || inspectionReason.trim().length < 5}>
                        {working === 'inspection' && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                        {working === 'inspection' ? text.inspectionSending : text.inspectionSend}
                      </Button>
                      <Button type="button" variant="outline" size="sm" disabled={working !== null} onClick={() => setShowInspectionForm(false)}>
                        {text.inspectionCancel}
                      </Button>
                    </div>
                  </form>
                )}
'''
admin = replace_once(
    admin,
    '''                {!isOwner && isAssignedToOther && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                    {text.assignedOther}
                  </p>
                )}
              </div>

              <div
''',
    '''                {!isOwner && isAssignedToOther && (
                  <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                    {text.assignedOther}
                  </p>
                )}

                {canRequestInspection && !showInspectionForm && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={working !== null}
                    onClick={() => setShowInspectionForm(true)}
                  >
                    <Eye className="me-2 h-4 w-4" />
                    {text.requestInspection}
                  </Button>
                )}
              </div>''' + admin_panel + '''

              <div
''',
    'admin inspection panel UI',
)
ADMIN_SUPPORT.write_text(admin, encoding='utf-8')


# ── Merchant support UI ────────────────────────────────────────────────────────
merchant = MERCHANT_SUPPORT.read_text(encoding='utf-8')
merchant = replace_once(
    merchant,
    '''type SupportSender = 'merchant' | 'admin' | 'system';

type SupportMessage = {
''',
    '''type SupportSender = 'merchant' | 'admin' | 'system';
type InspectionSessionMode = 'live_observation' | 'independent_read_only';
type InspectionSessionRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

type InspectionSessionRequest = {
  id: string;
  ticket_id: string;
  merchant_id: string;
  admin_id: string;
  admin_name: string;
  mode: InspectionSessionMode;
  reason: string;
  status: InspectionSessionRequestStatus;
  read_only: true;
  session_duration_minutes: 30;
  requested_at: string;
  request_expires_at: string;
  responded_at?: string;
  approved_at?: string;
  rejected_at?: string;
  expired_at?: string;
  session_expires_at?: string;
};

type SupportMessage = {
''',
    'merchant inspection request type',
)
merchant = replace_once(
    merchant,
    '''  updated_at: string;
  messages: SupportMessage[];
};
''',
    '''  updated_at: string;
  messages: SupportMessage[];
  inspection_requests?: InspectionSessionRequest[];
};
''',
    'merchant ticket inspection field',
)
merchant = replace_once(
    merchant,
    '''const categoryValues: SupportCategory[] = [
''',
    '''const INSPECTION_TEXT = {
  ar: {
    title: 'طلب فحص حسابك',
    requestedBy: 'المسؤول الطالب',
    mode: 'نوع الجلسة',
    live: 'مشاهدة مباشرة أثناء استخدامك للحساب',
    readOnly: 'فحص مستقل للقراءة فقط',
    reason: 'سبب الطلب',
    rules: 'لن يستطيع المسؤول التعديل أو الحفظ أو الإرسال أو التصدير. مدة الجلسة 30 دقيقة، ويمكنك الرفض.',
    pending: 'بانتظار قرارك',
    approved: 'تمت الموافقة',
    rejected: 'تم الرفض',
    expired: 'انتهت صلاحية الطلب',
    approve: 'موافقة',
    reject: 'رفض',
    deciding: 'جارٍ الحفظ...',
    decisionError: 'تعذر حفظ قرارك.',
    requestExpires: 'ينتهي الطلب',
    approvedUntil: 'تنتهي الموافقة',
  },
  ku: {
    title: 'داواکاری پشکنینی هەژمارەکەت',
    requestedBy: 'بەرپرسی داواکار',
    mode: 'جۆری دانیشتن',
    live: 'بینینی ڕاستەوخۆ لە کاتی بەکارهێنانی هەژمار',
    readOnly: 'پشکنینی سەربەخۆی تەنها خوێندنەوە',
    reason: 'هۆکاری داواکاری',
    rules: 'بەرپرس ناتوانێت دەستکاری، پاشەکەوت، ناردن یان هەناردە بکات. ماوەکە 30 خولەکە و دەتوانیت ڕەتی بکەیتەوە.',
    pending: 'چاوەڕوانی بڕیارت',
    approved: 'ڕەزامەندی درا',
    rejected: 'ڕەت کرایەوە',
    expired: 'کاتی داواکاری بەسەرچوو',
    approve: 'ڕەزامەندی',
    reject: 'ڕەتکردنەوە',
    deciding: 'پاشەکەوت دەکرێت...',
    decisionError: 'پاشەکەوتکردنی بڕیار سەرکەوتوو نەبوو.',
    requestExpires: 'داواکاری کۆتایی دێت',
    approvedUntil: 'ڕەزامەندی کۆتایی دێت',
  },
  en: {
    title: 'Account inspection request',
    requestedBy: 'Requested by',
    mode: 'Session mode',
    live: 'Live observation while you use the account',
    readOnly: 'Independent read-only inspection',
    reason: 'Reason',
    rules: 'The administrator cannot edit, save, send, or export. The session lasts 30 minutes, and you may reject it.',
    pending: 'Waiting for your decision',
    approved: 'Approved',
    rejected: 'Rejected',
    expired: 'Request expired',
    approve: 'Approve',
    reject: 'Reject',
    deciding: 'Saving...',
    decisionError: 'Could not save your decision.',
    requestExpires: 'Request expires',
    approvedUntil: 'Approval expires',
  },
} as const;

const categoryValues: SupportCategory[] = [
''',
    'merchant inspection strings',
)
merchant = replace_once(
    merchant,
    '''  const [replying, setReplying] = useState(false);
  const [formError, setFormError] = useState('');
''',
    '''  const [replying, setReplying] = useState(false);
  const [inspectionDecision, setInspectionDecision] = useState<'approve' | 'reject' | null>(null);
  const [formError, setFormError] = useState('');
''',
    'merchant inspection state',
)
merchant = replace_once(
    merchant,
    '''  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const selectedTicket = useMemo(
''',
    '''  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
  const inspectionText = lang === 'en' ? INSPECTION_TEXT.en : lang === 'ku' ? INSPECTION_TEXT.ku : INSPECTION_TEXT.ar;
  const selectedTicket = useMemo(
''',
    'merchant inspection locale',
)
merchant = replace_once(
    merchant,
    '''  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;
''',
    '''  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;
  const latestInspectionRequest = selectedTicket?.inspection_requests?.[0] ?? null;
''',
    'merchant latest inspection request',
)
merchant = replace_once(
    merchant,
    '''    const handleFocus = () => void loadTickets();
    const handleRealtime = (event: Event) => {
''',
    '''    const intervalId = window.setInterval(() => void loadTickets(), 10_000);
    const handleFocus = () => void loadTickets();
    const handleRealtime = (event: Event) => {
''',
    'merchant consent polling',
)
merchant = replace_once(
    merchant,
    '''    return () => {
      window.removeEventListener('focus', handleFocus);
''',
    '''    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
''',
    'merchant consent polling cleanup',
)

merchant_decision_function = '''
  const respondToInspectionRequest = async (decision: 'approve' | 'reject') => {
    if (!selectedTicket || !latestInspectionRequest || latestInspectionRequest.status !== 'pending') return;

    setInspectionDecision(decision);
    setFormError('');
    try {
      const response = await fetch(
        `/api/auth/support/tickets/${encodeURIComponent(selectedTicket.id)}/inspection-requests/${encodeURIComponent(latestInspectionRequest.id)}/decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data.ticket) {
        throw new Error(data?.error || 'could not save inspection decision');
      }
      const ticket = data.ticket as SupportTicket;
      setTickets((current) =>
        [ticket, ...current.filter((item) => item.id !== ticket.id)].sort(
          (left, right) =>
            new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
        ),
      );
      setSelectedId(ticket.id);
    } catch (error) {
      console.error('Could not save inspection decision:', error);
      setFormError(inspectionText.decisionError);
    } finally {
      setInspectionDecision(null);
    }
  };

'''
merchant = replace_once(
    merchant,
    '  const createTicket = async (event: React.FormEvent) => {\n',
    merchant_decision_function + '  const createTicket = async (event: React.FormEvent) => {\n',
    'merchant inspection decision function',
)

merchant_panel = '''

              {latestInspectionRequest && (
                <div className={`shrink-0 border-b p-3 ${
                  latestInspectionRequest.status === 'pending'
                    ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30'
                    : latestInspectionRequest.status === 'approved'
                      ? 'border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30'
                      : latestInspectionRequest.status === 'rejected'
                        ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                        : 'bg-muted/40'
                }`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-black">{inspectionText.title}</p>
                      <p className="mt-1 text-xs"><strong>{inspectionText.requestedBy}:</strong> {latestInspectionRequest.admin_name}</p>
                      <p className="mt-1 text-xs"><strong>{inspectionText.mode}:</strong> {latestInspectionRequest.mode === 'live_observation' ? inspectionText.live : inspectionText.readOnly}</p>
                      <p className="mt-1 text-xs leading-5"><strong>{inspectionText.reason}:</strong> {latestInspectionRequest.reason}</p>
                    </div>
                    <span className="rounded-full bg-background/80 px-2.5 py-1 text-[10px] font-black">
                      {latestInspectionRequest.status === 'pending'
                        ? inspectionText.pending
                        : latestInspectionRequest.status === 'approved'
                          ? inspectionText.approved
                          : latestInspectionRequest.status === 'rejected'
                            ? inspectionText.rejected
                            : inspectionText.expired}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{inspectionText.rules}</p>
                  {latestInspectionRequest.status === 'pending' && (
                    <>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {inspectionText.requestExpires}: {new Date(latestInspectionRequest.request_expires_at).toLocaleString(locale)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={inspectionDecision !== null}
                          onClick={() => void respondToInspectionRequest('approve')}
                          className="rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {inspectionDecision === 'approve' ? inspectionText.deciding : inspectionText.approve}
                        </button>
                        <button
                          type="button"
                          disabled={inspectionDecision !== null}
                          onClick={() => void respondToInspectionRequest('reject')}
                          className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {inspectionDecision === 'reject' ? inspectionText.deciding : inspectionText.reject}
                        </button>
                      </div>
                    </>
                  )}
                  {latestInspectionRequest.status === 'approved' && latestInspectionRequest.session_expires_at && (
                    <p className="mt-2 text-[10px] font-semibold text-green-800 dark:text-green-200">
                      {inspectionText.approvedUntil}: {new Date(latestInspectionRequest.session_expires_at).toLocaleString(locale)}
                    </p>
                  )}
                </div>
              )}
'''
merchant = replace_once(
    merchant,
    '''              </div>

              <div
                ref={conversationRef}
''',
    '''              </div>''' + merchant_panel + '''

              <div
                ref={conversationRef}
''',
    'merchant inspection panel UI',
)
MERCHANT_SUPPORT.write_text(merchant, encoding='utf-8')

print('Added inspection session request and merchant consent workflow.')
