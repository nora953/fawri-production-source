/**
 * PostgreSQL 18 Docker exports write pg_dump's 0600 output to a host
 * mkdtemp(0700) directory owned by the GitHub Actions runner. Running
 * Docker with --user=0:0 creates a root-only archive that the runner
 * cannot hash, encrypt, restore, or remove; use its real host uid/gid.
 * Fail closed when an unprivileged POSIX identity is unavailable.
 */
export function hostOwnedPg18DockerUser(
  getuid = process.getuid,
  getgid = process.getgid,
) {
  const uid = typeof getuid === 'function' ? getuid() : NaN;
  const gid = typeof getgid === 'function' ? getgid() : NaN;
  if (!Number.isSafeInteger(uid) || uid <= 0 ||
      !Number.isSafeInteger(gid) || gid <= 0) {
    throw Object.assign(new Error('V1_PG18_BACKUP_RUNNER_IDENTITY_UNSAFE'), {
      code: 'V1_PG18_BACKUP_RUNNER_IDENTITY_UNSAFE',
    });
  }
  return `--user=${uid}:${gid}`;
}
