# Channel lifecycle and credential storage

## State model

The server-authoritative Meta channel registry uses these states:

- `connecting`: OAuth/subscription work is in progress;
- `active`: the channel may receive and send messages;
- `disconnecting`: a durable unsubscribe job has been accepted;
- `disconnected`: remote unsubscribe is confirmed and the local credential is
  erased;
- `error`: a confirmed non-transient lifecycle failure needs attention.

Every transition increments `connection_version`. Disconnect requests require
an expected version, preventing a stale browser action from disconnecting a
newer connection.

## Token-at-rest interface

`MetaCredentialKeyProvider` separates encryption from key storage. The included
environment provider expects:

- `FAWRI_META_TOKEN_KEY_ID`;
- `FAWRI_META_TOKEN_KEY_BASE64`, exactly 32 random bytes encoded as base64.

Credentials use AES-256-GCM with a random 96-bit IV. Authenticated associated
data binds each envelope to merchant, platform, and page, preventing ciphertext
swapping between tenants. API summaries expose only
`credential_configured: true|false`; plaintext is returned only to internal
send/unsubscribe services.

Production should bind the same interface to KMS/HSM envelope encryption and
rotate key identifiers without changing the channel service contract.

## Connection

The shared legacy OAuth callback must call `connectMetaChannel` only after the
page token and webhook subscription have been confirmed. It must stop writing
`page_access_token` to `fawri-runtime-db.json`. Page names and public account
identifiers may be stored, but token response bodies must never be logged.

## Disconnect

The merchant route records `disconnecting`, then durably enqueues
`meta.channel.disconnect` before returning HTTP 202. The worker decrypts the
credential only in memory, calls the Graph unsubscribe endpoint, and erases the
credential after a confirmed successful response. Transient transport, 429, and
5xx failures retry with backoff. A confirmed client-side rejection moves the
channel to `error` and enters a safely inspectable DLQ.

Tests inject a fake `fetch` implementation and never call Meta.

## Compatibility and migration

`metaPageDirectory.ts` reads the encrypted active-channel registry first and
uses the old runtime page mapping only as a temporary compatibility source. The
legacy mapping must be removed after the shared OAuth/send route is migrated.
A one-time migration should encrypt existing page tokens, verify decryption,
then delete plaintext token fields and backups containing them.
