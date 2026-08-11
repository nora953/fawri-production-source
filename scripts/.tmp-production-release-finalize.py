from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"PATCH STOP: expected fragment missing in {path}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "artifacts/api-server/src/routes/index.ts",
    '''const GRAPH_VERSION = "v22.0";\nconst META_REDIRECT_URI =\n  process.env.META_REDIRECT_URI ||\n  "https://7420821c-790f-40d9-9ded-46b56a9c6cba-00-1v3w7iufkjvhe.sisko.replit.dev/api/meta/callback";''',
    '''const GRAPH_VERSION = "v22.0";\nconst META_REDIRECT_URI = String(process.env.META_REDIRECT_URI || "").trim();''',
)

replace_once(
    "artifacts/api-server/src/routes/index.ts",
    '''    if (!appId) return res.status(500).send("META_APP_ID is not configured");\n    if (!configId)\n      return res.status(500).send("META_CONFIG_ID is not configured");''',
    '''    if (!appId) return res.status(500).send("META_APP_ID is not configured");\n    if (!configId)\n      return res.status(500).send("META_CONFIG_ID is not configured");\n    if (!META_REDIRECT_URI)\n      return res.status(503).send("META_REDIRECT_URI is not configured");''',
)

replace_once(
    "artifacts/api-server/src/routes/index.ts",
    '''  if (!appId) return res.status(500).send("META_APP_ID is not configured");\n  if (!appSecret)\n    return res.status(500).send("META_APP_SECRET is not configured");''',
    '''  if (!appId) return res.status(500).send("META_APP_ID is not configured");\n  if (!appSecret)\n    return res.status(500).send("META_APP_SECRET is not configured");\n  if (!META_REDIRECT_URI)\n    return res.status(503).send("META_REDIRECT_URI is not configured");''',
)

replace_once(
    "docs/production-kms-hsm-readiness.md",
    '''## Coordinator handoff required for production activation\n\nCurrent `metaChannelRuntime` still falls back to `createEnvironmentMetaCredentialKeyProvider()` when no provider is injected, and `src/index.ts` starts the API synchronously. A production AWS KMS provider therefore cannot be activated safely from this lane without central startup/runtime wiring.\n\nCoordinator change required after this lane is validated:\n\n1. before accepting traffic, `await bootstrapAwsKmsMetaCredentialKeyProviderFromEnvironment()`;\n2. require `assertAwsKmsMetaCredentialProviderReady(...)` in production;\n3. inject the resulting cached provider into every Meta OAuth/connect/read/send credential path instead of allowing the environment fallback;\n4. call `dispose()` during server shutdown;\n5. fail startup closed if bootstrap/readiness fails.\n\nThis lane intentionally does **not** modify `src/index.ts`, `app.ts`, or `routes/index.ts`.''',
    '''## Production startup wiring status\n\nThe coordinator handoff described by the original adapter lane has now been completed. `runtimeProviderBootstrap.ts` asynchronously bootstraps the selected AWS KMS provider before the application is imported, validates provider readiness, injects the cached provider into the legacy Meta credential runtime, PostgreSQL Meta channel authority, and PostgreSQL durable-job credential path, and disposes it during shutdown. `src/index.ts` fails startup closed when provider bootstrap fails.\n\nProduction still requires the real AWS account/KMS/IAM configuration and wrapped-DEK manifest listed below. Repository wiring does not prove that those external resources exist or that the production workload role has the required permissions. The final production release gate therefore requires explicit `aws-kms` selection and complete KMS configuration before Meta OAuth/live sending can activate.''',
)

print("PRODUCTION_RELEASE_FINALIZE_PATCH_APPLIED")
