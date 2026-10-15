import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getMerchantOperationalSettings,
  merchantAllowsAutoReply,
  MerchantSettingsError,
  updateMerchantOperationalSettings,
} from "../src/services/merchantSettingsRuntime";
import { deleteMerchantRuntimeData } from "../src/services/merchantRuntime";

function makeDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fawri-settings-runtime-"));
}

function withDataDirectory(directory: string): () => void {
  const previous = process.env.FAWRI_DATA_DIR;
  process.env.FAWRI_DATA_DIR = directory;
  return () => {
    if (previous === undefined) delete process.env.FAWRI_DATA_DIR;
    else process.env.FAWRI_DATA_DIR = previous;
  };
}

function assertSettingsError(
  callback: () => unknown,
  code: string,
): MerchantSettingsError {
  let thrown: unknown;
  try {
    callback();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown instanceof MerchantSettingsError);
  assert.equal(thrown.code, code);
  return thrown;
}

test("defaults are deterministic and do not write on read", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    const settings = getMerchantOperationalSettings("merchant-1");
    assert.equal(settings.version, 1);
    assert.equal(settings.auto_reply_enabled, true);
    assert.equal(settings.reply_language, "auto");
    assert.equal(settings.delivery.enabled, true);
    assert.equal(settings.inventory.freshness_max_age_minutes, 5);
    assert.equal(settings.inventory.stale_policy, "reroute_then_pending");
    assert.equal(settings.payment.cash_on_delivery_enabled, true);
    assert.deepEqual(settings.payment.methods, ["cash_on_delivery"]);
    assert.equal(
      fs.existsSync(path.join(directory, "merchant-settings.json")),
      false,
    );
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("valid nested update is normalized and persisted", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    const updated = updateMerchantOperationalSettings({
      merchantId: "merchant-1",
      expectedVersion: 1,
      patch: {
        auto_reply_enabled: false,
        reply_language: "ku",
        delivery: {
          enabled: true,
          fee_iqd: 5000,
          free_delivery_threshold_iqd: 50000,
          estimated_days_min: 2,
          estimated_days_max: 5,
          areas: ["Baghdad", "Baghdad", "Erbil"],
          notes: "Delivery details",
        },
        payment: {
          cash_on_delivery_enabled: true,
          electronic_payment_enabled: true,
          methods: ["cash_on_delivery", "zaincash", "zaincash"],
          instructions: "Send the receipt after payment",
        },
        inventory: {
          freshness_max_age_minutes: 15,
          stale_policy: "allow_stale",
        },
      },
    });

    assert.equal(updated.version, 2);
    assert.equal(updated.auto_reply_enabled, false);
    assert.equal(updated.reply_language, "ku");
    assert.equal(updated.delivery.fee_iqd, 5000);
    assert.deepEqual(updated.delivery.areas, ["Baghdad", "Erbil"]);
    assert.deepEqual(updated.payment.methods, ["cash_on_delivery", "zaincash"]);
    assert.equal(updated.inventory.freshness_max_age_minutes, 15);
    assert.equal(updated.inventory.stale_policy, "allow_stale");
    assert.equal(merchantAllowsAutoReply("merchant-1"), false);

    const stored = getMerchantOperationalSettings("merchant-1");
    assert.deepEqual(stored, updated);
    const raw = JSON.parse(
      fs.readFileSync(path.join(directory, "merchant-settings.json"), "utf8"),
    );
    assert.equal(raw.version, 1);
    assert.deepEqual(Object.keys(raw.settings), ["merchant-1"]);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("stale device receives the current settings without overwrite", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    const first = updateMerchantOperationalSettings({
      merchantId: "merchant-1",
      expectedVersion: 1,
      patch: { reply_language: "ar" },
    });
    assert.equal(first.version, 2);

    const conflict = assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: { reply_language: "en" },
        }),
      "MERCHANT_SETTINGS_VERSION_CONFLICT",
    );
    assert.equal(conflict.status, 409);
    assert.equal(conflict.details?.current_version, 2);
    assert.equal(
      (conflict.details?.current_settings as { reply_language?: string })
        ?.reply_language,
      "ar",
    );
    assert.equal(getMerchantOperationalSettings("merchant-1").reply_language, "ar");
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("invalid delivery and payment configurations fail closed", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: {
            delivery: {
              estimated_days_min: 7,
              estimated_days_max: 2,
            },
          },
        }),
      "MERCHANT_DELIVERY_ESTIMATE_INVALID",
    );

    assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: {
            payment: {
              cash_on_delivery_enabled: false,
              electronic_payment_enabled: false,
              methods: [],
            },
          },
        }),
      "MERCHANT_PAYMENT_METHOD_REQUIRED",
    );

    assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: {
            payment: {
              cash_on_delivery_enabled: false,
              electronic_payment_enabled: true,
              methods: ["cash_on_delivery"],
            },
          },
        }),
      "MERCHANT_ELECTRONIC_PAYMENT_METHOD_REQUIRED",
    );

    assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: { reply_language: "unsupported" },
        }),
      "MERCHANT_REPLY_LANGUAGE_INVALID",
    );

    assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: {
            inventory: {
              freshness_max_age_minutes: 0,
            },
          },
        }),
      "MERCHANT_SETTINGS_NUMBER_INVALID",
    );

    assertSettingsError(
      () =>
        updateMerchantOperationalSettings({
          merchantId: "merchant-1",
          expectedVersion: 1,
          patch: {
            inventory: {
              stale_policy: "unsafe_unknown",
            },
          },
        }),
      "MERCHANT_INVENTORY_STALE_POLICY_INVALID",
    );
    assert.equal(getMerchantOperationalSettings("merchant-1").version, 1);
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("settings remain tenant isolated and merchant deletion is scoped", () => {
  const directory = makeDirectory();
  const restore = withDataDirectory(directory);
  try {
    updateMerchantOperationalSettings({
      merchantId: "merchant-1",
      expectedVersion: 1,
      patch: { reply_language: "ar" },
    });
    updateMerchantOperationalSettings({
      merchantId: "merchant-2",
      expectedVersion: 1,
      patch: { reply_language: "ku" },
    });

    assert.equal(getMerchantOperationalSettings("merchant-1").reply_language, "ar");
    assert.equal(getMerchantOperationalSettings("merchant-2").reply_language, "ku");

    const summary = deleteMerchantRuntimeData("merchant-1");
    assert.equal(summary.merchantSettings, 1);
    assert.equal(getMerchantOperationalSettings("merchant-1").version, 1);
    assert.equal(getMerchantOperationalSettings("merchant-2").reply_language, "ku");
  } finally {
    restore();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
