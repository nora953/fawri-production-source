import type { Express } from "express";

/**
 * Render web services terminate TLS upstream and forward the observed client IP.
 * Without this bounded hop, req.ip resolves to a shared edge/load-balancer IP:
 * Google OIDC per-IP rate limits then accidentally become global limits.
 *
 * Do not enable Express trust-proxy=true (trusts caller-controlled leftmost IP).
 * On non-Render and non-web deployments keep Express's safe default false.
 * Hosted ingress and spoofed-header behavior still require separate acceptance.
 */
export function configureRenderIngressProxyTrust(
  app: Express,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    env.RENDER_SERVICE_TYPE === "web" &&
    /^srv-[a-z0-9]{8,}$/.test(String(env.RENDER_SERVICE_ID || ""))
  ) {
    app.set("trust proxy", 1);
  }
}
