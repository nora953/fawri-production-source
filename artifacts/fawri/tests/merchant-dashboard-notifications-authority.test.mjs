import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const page = read("artifacts/fawri/src/pages/dashboard/NotificationsPage.tsx");
const authority = read("artifacts/fawri/src/lib/merchantNotificationsAuthority.ts");
const copy = read("artifacts/fawri/src/lib/translations/features/pages/dashboard/NotificationsPage.ts");
const routes = read("artifacts/api-server/src/routes/auth-support-postgres-routes.ts");
const notificationRuntime = read("artifacts/api-server/src/services/postgresMerchantNotificationAuthority.ts");

test("notification server authority is session-derived and tenant filtered", () => {
  assert.match(routes, /router\.get\("\/notifications", requireSecureMerchantSession/);
  assert.match(routes, /merchantId: merchantId\(res\)/);
  assert.match(routes, /router\.patch\(\s*"\/notifications\/:id\/read",\s*requireSecureMerchantSession/);
  assert.match(routes, /markMerchantNotificationReadPostgresCanonical\(\{\s*merchantId: merchantId\(res\)/s);
  assert.match(notificationRuntime, /WHERE audience = 'merchant' AND merchant_id = \$1/);
  assert.match(notificationRuntime, /WHERE id = \$1 AND audience = 'merchant' AND merchant_id = \$2/);
});

test("notification authority validates records and rejects unsafe action URLs", () => {
  assert.match(authority, /export function isMerchantNotificationRecord/);
  assert.match(authority, /body\.notifications\.every\(isMerchantNotificationRecord\)/);
  assert.match(authority, /credentials: "same-origin"/);
  assert.match(authority, /cache: "no-store"/);
  assert.match(authority, /headers: \{ Accept: "application\/json" \}/);
  assert.match(authority, /value\.startsWith\("\/"\)/);
  assert.match(authority, /!value\.startsWith\("\/\/"\)/);
  assert.match(page, /readMerchantNotificationsAuthority\(\)/);
  assert.doesNotMatch(page, /as MerchantNotification\[\]/);
});

test("notification reads are race-safe and stale data is explicit", () => {
  assert.match(page, /const latestReadIdRef = useRef\(0\)/);
  assert.match(page, /const requestId = \+\+latestReadIdRef\.current/);
  assert.match(page, /if \(requestId !== latestReadIdRef\.current\) return/);
  assert.match(page, /const handleFocus = \(\) => void loadNotifications\(true\)/);
  assert.match(page, /void loadNotifications\(true\)/);
  assert.match(page, /setAuthorityStale\(true\)/);
  assert.match(page, /authorityStale && notifications\.length > 0/);
  assert.match(page, /loadError \|\| \(authorityStale && notifications\.length === 0\)/);
  assert.match(page, /notifications\.length === 0/);
});

test("mark-as-read fails closed and navigation waits for confirmed mutation", () => {
  assert.match(authority, /markMerchantNotificationReadAuthority/);
  assert.match(authority, /body\.notification\.id !== notificationId/);
  assert.match(authority, /!dateText\(body\.notification\.read_at\)/);
  assert.match(page, /const authorityActionsAllowed = !loading && !loadError && !authorityStale/);
  assert.match(page, /const markAsRead = async \(notificationId: string\): Promise<boolean>/);
  assert.match(page, /if \(!authorityActionsAllowed\)/);
  assert.match(page, /return false/);
  assert.match(page, /if \(!notification\.read_at && !\(await markAsRead\(notification\.id\)\)\) return/);
  assert.match(page, /window\.location\.assign\(notification\.action_url\)/);
  assert.match(page, /const actionsDisabled = marking \|\| !authorityActionsAllowed/);
  assert.match(page, /disabled=\{actionsDisabled\}/);
});

test("notification authority failure copy exists in Arabic, Sorani Kurdish, and English", () => {
  assert.match(copy, /export const NOTIFICATIONS_PAGE_AUTHORITY_TEXT/);
  assert.match(copy, /ar:\s*\{[\s\S]*?stale:/);
  assert.match(copy, /ku:\s*\{[\s\S]*?stale:/);
  assert.match(copy, /en:\s*\{[\s\S]*?stale:/);
  assert.match(page, /AUTHORITY_TEXT/);
  assert.match(page, /authorityText\.actionFailed/);
});
