import { readFile } from "node:fs/promises";
import {
  OwnerAdminProvisioningError,
  provisionOwnerAdminPostgres,
} from "../src/services/postgresOwnerAdminProvisioning";

function option(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return String(process.argv[index + 1] || "").trim();
}

function safeErrorCode(error: unknown): string {
  if (error instanceof OwnerAdminProvisioningError) return error.code;
  const raw =
    error && typeof error === "object"
      ? String((error as { code?: unknown }).code || "").trim()
      : "";
  return /^[A-Z][A-Z0-9_]{2,159}$/.test(raw)
    ? raw
    : "OWNER_ADMIN_PROVISIONING_FAILED";
}

async function main(): Promise<void> {
  if (process.env.FAWRI_OPERATIONAL_POSTGRES_AUTHORITY !== "required") {
    throw new OwnerAdminProvisioningError(
      "OWNER_PROVISIONING_POSTGRES_AUTHORITY_REQUIRED",
      "FAWRI_OPERATIONAL_POSTGRES_AUTHORITY must be required",
    );
  }
  if (!String(process.env.DATABASE_URL || "").trim()) {
    throw new OwnerAdminProvisioningError(
      "OWNER_PROVISIONING_DATABASE_REQUIRED",
      "DATABASE_URL is required",
    );
  }

  const phone = option("--phone");
  const displayName = option("--display-name");
  const language = option("--language") || "ar";
  if (!phone || !displayName) {
    throw new OwnerAdminProvisioningError(
      "OWNER_PROVISIONING_INPUT_REQUIRED",
      "--phone and --display-name are required",
    );
  }

  // Passwords are intentionally accepted only through stdin. Never accept or
  // print a password CLI argument, where it could be retained in shell history
  // or process listings.
  const passwordInput = await readFile(0, "utf8");
  const password = passwordInput.replace(/(?:\r?\n)+$/, "");
  if (!password) {
    throw new OwnerAdminProvisioningError(
      "PASSWORD_REQUIRED",
      "owner password must be provided through stdin",
    );
  }

  const result = await provisionOwnerAdminPostgres({
    displayName,
    phone,
    password,
    language,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      admin_id: result.adminId,
      phone: result.phone,
      display_name: result.displayName,
      language: result.language,
    })}\n`,
  );
}

void main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, code: safeErrorCode(error) })}\n`);
  process.exitCode = 1;
});
