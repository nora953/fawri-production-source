import fs from "node:fs";

const authPath = "artifacts/api-server/src/routes/auth.ts";
const testPath = "artifacts/api-server/tests/admin-permissions.integration.test.mjs";

function replaceOnce(source, label, before, after) {
  const first = source.indexOf(before);
  if (first === -1) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) !== -1) {
    throw new Error(`Found multiple matches for ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let auth = fs.readFileSync(authPath, "utf8");

auth = replaceOnce(
  auth,
  "OTP delivery fallback",
  `async function deliverOtp(
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (otpDeliveryChannel() === "whatsapp") {
    return sendOtpViaWhatsApp(phone, code, purpose);
  }

  return { ok: true };
}`,
  `async function deliverOtp(
  phone: string,
  code: string,
  purpose: OtpRecord["purpose"],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (otpDeliveryChannel() === "whatsapp") {
    return sendOtpViaWhatsApp(phone, code, purpose);
  }

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.AUTH_ALLOW_DEV_OTP_BYPASS === "true"
  ) {
    return { ok: true };
  }

  return {
    ok: false,
    error: "إرسال رمز التحقق غير مهيأ على الخادم",
  };
}`,
);

auth = replaceOnce(
  auth,
  "OTP verification state transition",
  `  otp.used = true;
  merchant.otp_verified = true;
  writeDb(db);`,
  `  otp.used = true;
  merchant.otp_verified = true;
  merchant.status = "pending_activation";
  writeDb(db);`,
);

auth = replaceOnce(
  auth,
  "admin merchant visibility filter",
  `    merchants: db.merchants
      .filter((merchant) => merchant.is_admin !== true)
      .map(publicMerchant),`,
  `    merchants: db.merchants
      .filter(
        (merchant) =>
          merchant.is_admin !== true && merchant.otp_verified === true,
      )
      .map(publicMerchant),`,
);

fs.writeFileSync(authPath, auth, "utf8");

let testSource = fs.readFileSync(testPath, "utf8");

testSource = replaceOnce(
  testSource,
  "admin test readFile import",
  `import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";`,
  `import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";`,
);

testSource = replaceOnce(
  testSource,
  "unverified merchant fixture",
  `      {
        id: "merchant-a",
        owner_name: "Merchant Owner",
        store_name: "Merchant Store",
        phone: "07333333333",
        password: "Merchant1@",
        activity_type: "retail",
        status: "pending_activation",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-07-25T00:00:00.000Z",
        otp_verified: true,
        warning_stage: 0,
        retention_status: "protected",
      },
    ],
    otps: [],`,
  `      {
        id: "merchant-a",
        owner_name: "Merchant Owner",
        store_name: "Merchant Store",
        phone: "07333333333",
        password: "Merchant1@",
        activity_type: "retail",
        status: "pending_activation",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-07-25T00:00:00.000Z",
        otp_verified: true,
        warning_stage: 0,
        retention_status: "protected",
      },
      {
        id: "merchant-unverified",
        owner_name: "Unverified Owner",
        store_name: "Unverified Store",
        phone: "07444444444",
        password: "Unverified1@",
        activity_type: "retail",
        status: "pending_activation",
        language: "en",
        theme_preference: "auto",
        created_at: "2026-07-25T00:00:00.000Z",
        otp_verified: false,
        warning_stage: 0,
        retention_status: "protected",
      },
    ],
    otps: [
      {
        phone: "07444444444",
        code: "654321",
        purpose: "signup",
        expires_at: "2099-01-01T00:00:00.000Z",
        used: false,
        created_at: "2026-07-25T00:00:00.000Z",
      },
    ],`,
);

testSource = replaceOnce(
  testSource,
  "OTP fail-closed test environment",
  `      FAWRI_ADMIN_PHONE: "07111111111",
    },`,
  `      FAWRI_ADMIN_PHONE: "07111111111",
      OTP_DELIVERY_CHANNEL: "",
      AUTH_ALLOW_DEV_OTP_BYPASS: "false",
    },`,
);

testSource = replaceOnce(
  testSource,
  "merchant visibility assertions",
  `  const merchantList = await fetch(\`${baseUrl}/api/auth/merchants\`, { headers: assistantHeaders });
  assert.equal(merchantList.status, 200);

  const statusUpdate = await fetch(\`${baseUrl}/api/auth/merchants/merchant-a/status\`, {`,
  `  const merchantList = await json(await fetch(
    \`${baseUrl}/api/auth/merchants\`,
    { headers: assistantHeaders },
  ));
  assert.equal(merchantList.response.status, 200);
  assert.deepEqual(
    merchantList.body.merchants.map((merchant) => merchant.id),
    ["merchant-a"],
  );

  const unverifiedLogin = await fetch(\`${baseUrl}/api/auth/login\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone: "07444444444",
      password: "Unverified1@",
    }),
  });
  assert.equal(unverifiedLogin.status, 401);

  const unverifiedApproval = await fetch(
    \`${baseUrl}/api/auth/merchants/merchant-unverified/status\`,
    {
      method: "PATCH",
      headers: { ...assistantHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    },
  );
  assert.equal(unverifiedApproval.status, 409);

  const failedSignup = await fetch(\`${baseUrl}/api/auth/signup\`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_name: "No Delivery Owner",
      store_name: "No Delivery Store",
      phone: "07555555555",
      password: "NoDelivery1@",
      activity_type: "retail",
      language: "en",
    }),
  });
  assert.equal(failedSignup.status, 502);

  const persistedAfterFailedSignup = JSON.parse(
    await readFile(path.join(dataDir, "merchants.json"), "utf8"),
  );
  assert.equal(
    persistedAfterFailedSignup.merchants.some(
      (merchant) => merchant.phone === "07555555555",
    ),
    false,
  );

  const verifyUnverifiedMerchant = await fetch(
    \`${baseUrl}/api/auth/verify-otp\`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "07444444444", code: "654321" }),
    },
  );
  assert.equal(verifyUnverifiedMerchant.status, 200);

  const merchantListAfterVerification = await json(await fetch(
    \`${baseUrl}/api/auth/merchants\`,
    { headers: assistantHeaders },
  ));
  assert.equal(merchantListAfterVerification.response.status, 200);
  assert.deepEqual(
    merchantListAfterVerification.body.merchants.map((merchant) => merchant.id),
    ["merchant-a", "merchant-unverified"],
  );
  assert.equal(
    merchantListAfterVerification.body.merchants.find(
      (merchant) => merchant.id === "merchant-unverified",
    ).status,
    "pending_activation",
  );

  const statusUpdate = await fetch(\`${baseUrl}/api/auth/merchants/merchant-a/status\`, {`,
);

fs.writeFileSync(testPath, testSource, "utf8");

console.log("Unverified merchant exposure fix applied.");
