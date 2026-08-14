import { authPostgresSessionAuthority } from "./authPostgresSessionAuthority";
import { operationalPostgresAuthorityRequired } from "./operationalPostgresAuthority";

export type AdminAuthPostgresCutoverMode =
  | "legacy"
  | "postgres"
  | "incomplete";

export function adminAuthPostgresCutoverMode(): AdminAuthPostgresCutoverMode {
  const operationalRequired = operationalPostgresAuthorityRequired();
  const sessionRequired = authPostgresSessionAuthority.enabled("admin");

  if (operationalRequired && sessionRequired) return "postgres";
  if (!operationalRequired && !sessionRequired) return "legacy";
  return "incomplete";
}
