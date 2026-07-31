from pathlib import Path

path = Path("artifacts/api-server/src/routes/auth.ts")
text = path.read_text(encoding="utf-8")

old_loop = '''  for (const rawTicket of db.support_tickets) {
    const ticket = normalizeSupportTicketLifecycle(rawTicket);
    Object.assign(rawTicket, ticket);
'''
new_loop = '''  for (const rawTicket of db.support_tickets) {
    Object.assign(rawTicket, normalizeSupportTicketLifecycle(rawTicket));
    const ticket = rawTicket;
'''

if old_loop not in text:
    raise SystemExit("Could not find support lifecycle loop to patch")
text = text.replace(old_loop, new_loop, 1)

old_escalation = '''    if (
      !ticket.owner_escalated_at &&
      elapsed >= SUPPORT_OWNER_ESCALATION_MS
    ) {
      ticket.owner_escalated_at = now();
      appendSystemAdminLog(
        db,
        ticket,
        "support_ticket_owner_escalated",
        "Ticket escalated to the owner because the merchant is still waiting for support",
      );
      changed = true;
    }
'''
new_escalation = '''    if (
      !ticket.owner_escalated_at &&
      elapsed >= SUPPORT_OWNER_ESCALATION_MS
    ) {
      const matchingEscalations = db.admin_logs
        .filter(
          (log) =>
            log.action_type === "support_ticket_owner_escalated" &&
            log.meta?.ticket_id === ticket.id &&
            new Date(log.created_at).getTime() >= waitingSince,
        )
        .sort(
          (left, right) =>
            new Date(left.created_at).getTime() -
            new Date(right.created_at).getTime(),
        );
      const existingEscalation = matchingEscalations[0];

      if (matchingEscalations.length > 1) {
        const duplicateIds = new Set(
          matchingEscalations.slice(1).map((log) => log.id),
        );
        db.admin_logs = db.admin_logs.filter(
          (log) => !duplicateIds.has(log.id),
        );
      }

      ticket.owner_escalated_at = existingEscalation?.created_at || now();
      if (!existingEscalation) {
        appendSystemAdminLog(
          db,
          ticket,
          "support_ticket_owner_escalated",
          "Ticket escalated to the owner because the merchant is still waiting for support",
        );
      }
      changed = true;
    }
'''

if old_escalation not in text:
    raise SystemExit("Could not find owner escalation block to patch")
text = text.replace(old_escalation, new_escalation, 1)

path.write_text(text, encoding="utf-8")
print("Fixed support lifecycle persistence and duplicate owner escalation logs.")
