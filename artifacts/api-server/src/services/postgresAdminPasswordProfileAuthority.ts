import { authenticationDatabasePool } from "./authenticationPostgresAuthority";
import { authAccountRepository } from "./authAccountRepository";
import {
  operationalPostgresAuthorityRequired,
} from "./operationalPostgresAuthority";

export async function clearAdminMustChangePasswordAuthoritative(
  accountId: string,
): Promise<void> {
  if (!operationalPostgresAuthorityRequired()) {
    return;
  }
  const pool = await authenticationDatabasePool();
  const result = await pool.query<{ id: string }>(
    `UPDATE admin_profiles
        SET must_change_password = false, updated_at = now()
      WHERE id = $1 AND role IN ('owner_admin', 'assistant_admin')
      RETURNING id`,
    [accountId],
  );
  if (!result.rows[0]) {
    throw new Error("AUTH_POSTGRES_ADMIN_PROFILE_UNAVAILABLE");
  }
}

export function clearLegacyAdminMustChangePassword(
  accountId: string,
  passwordHash: string,
): void {
  if (operationalPostgresAuthorityRequired()) return;
  authAccountRepository.updatePassword(accountId, "admin", passwordHash, {
    mustChangePassword: false,
  });
}
