from pathlib import Path

MERCHANT = Path('artifacts/fawri/src/pages/dashboard/SupportPage.tsx')
ADMIN = Path('artifacts/fawri/src/components/admin/AdminSupportTab.tsx')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected one match, found {count}')
    return text.replace(old, new, 1)


merchant = MERCHANT.read_text(encoding='utf-8')
merchant = replace_once(
    merchant,
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';",
    "import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';",
    'merchant React hooks import',
)
merchant = replace_once(
    merchant,
    """  const [formError, setFormError] = useState('');

  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
""",
    """  const [formError, setFormError] = useState('');
  const conversationRef = useRef<HTMLDivElement | null>(null);

  const locale = lang === 'en' ? 'en-US' : lang === 'ku' ? 'ckb-IQ' : 'ar-IQ';
""",
    'merchant conversation ref',
)
merchant = replace_once(
    merchant,
    """  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [tickets, selectedId],
  );

  const loadTickets = useCallback(async () => {
""",
    """  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [tickets, selectedId],
  );
  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;

  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation || !selectedLastMessageId) return;

    const frameId = window.requestAnimationFrame(() => {
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedId, selectedLastMessageId]);

  const loadTickets = useCallback(async () => {
""",
    'merchant auto-scroll effect',
)
merchant = replace_once(
    merchant,
    """              <div className=\"min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-3\">
""",
    """              <div
                ref={conversationRef}
                className=\"min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3\"
              >
""",
    'merchant conversation container ref',
)
MERCHANT.write_text(merchant, encoding='utf-8')

admin = ADMIN.read_text(encoding='utf-8')
admin = replace_once(
    admin,
    "import React, { useCallback, useEffect, useMemo, useState } from 'react';",
    "import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';",
    'admin React hooks import',
)
admin = replace_once(
    admin,
    """  const [reply, setReply] = useState('');
  const [working, setWorking] = useState<'claim' | 'reply' | 'resolve' | null>(null);

  const selectedTicket = useMemo(
""",
    """  const [reply, setReply] = useState('');
  const [working, setWorking] = useState<'claim' | 'reply' | 'resolve' | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  const selectedTicket = useMemo(
""",
    'admin conversation ref',
)
admin = replace_once(
    admin,
    """  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  );

  const activeCount = useMemo(
""",
    """  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  );
  const selectedLastMessageId =
    selectedTicket?.messages[selectedTicket.messages.length - 1]?.id ?? null;

  useLayoutEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation || !selectedLastMessageId) return;

    const frameId = window.requestAnimationFrame(() => {
      conversation.scrollTo({
        top: conversation.scrollHeight,
        behavior: 'smooth',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedId, selectedLastMessageId]);

  const activeCount = useMemo(
""",
    'admin auto-scroll effect',
)
admin = replace_once(
    admin,
    """              <div className=\"min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3\">
""",
    """              <div
                ref={conversationRef}
                className=\"min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-muted/20 p-3\"
              >
""",
    'admin conversation container ref',
)
ADMIN.write_text(admin, encoding='utf-8')

print('Enabled automatic scrolling to the latest support message for merchant and admin conversations.')
