import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const app = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const adminView = readFileSync(
  new URL("../src/pages/admin/AdminPageView.tsx", import.meta.url),
  "utf8",
);
const launcher = readFileSync(
  new URL("../src/components/admin/EmergencyReadAccessLauncher.tsx", import.meta.url),
  "utf8",
);

test("emergency launcher is mounted explicitly by the admin header", () => {
  assert.doesNotMatch(app, /EmergencyReadAccessLauncher/);

  assert.match(
    adminView,
    /import EmergencyReadAccessLauncher from "@\/components\/admin\/EmergencyReadAccessLauncher";/,
  );

  const headerActions = adminView.indexOf(
    'className="flex shrink-0 items-center gap-2 sm:gap-3"',
  );
  const languages = adminView.indexOf(
    '(["ar", "ku", "en"] as const)',
    headerActions,
  );
  const emergency = adminView.indexOf(
    "<EmergencyReadAccessLauncher />",
    headerActions,
  );
  const logout = adminView.indexOf(
    "clearSession();",
    headerActions,
  );

  assert.ok(headerActions >= 0, "admin header actions must exist");
  assert.ok(languages > headerActions, "language switcher must remain in header");
  assert.ok(emergency > languages, "emergency launcher must follow language switcher");
  assert.ok(logout > emergency, "logout must remain after emergency launcher");
});

test("launcher no longer discovers or mutates foreign DOM", () => {
  for (const forbidden of [
    "createPortal",
    "querySelectorAll",
    "document.createElement",
    "MutationObserver",
    "insertAdjacentElement",
    "portalHost",
    "emergencyAccessHost",
  ]) {
    assert.equal(
      launcher.includes(forbidden),
      false,
      `launcher must not use DOM bridge primitive: ${forbidden}`,
    );
  }

  assert.match(
    launcher,
    /\/api\/auth\/admin\/emergency-read-access\/overview/,
  );
  assert.match(
    launcher,
    /setLocation\('\/admin\/emergency-access'\)/,
  );
});
