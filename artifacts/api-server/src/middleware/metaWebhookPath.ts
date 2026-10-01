/** Match the same casing and optional trailing slash as the Express route. */
export function isMetaWebhookPost(req: {
  method?: string;
  originalUrl?: string;
  path?: string;
}): boolean {
  const pathname = String(req.originalUrl || req.path || "").split("?", 1)[0];
  return req.method === "POST" && /^\/api\/meta\/webhook\/?$/i.test(pathname);
}
