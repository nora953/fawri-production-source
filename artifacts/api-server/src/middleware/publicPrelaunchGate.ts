import type { NextFunction, Request, Response } from "express";
import { publicPrelaunchGateActive } from "../lib/publicPrelaunchMode";

/** Public prelaunch surface only. This is not commercial release authority. */
function escapeHtml(value: string): string {
  const escapes: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, char => escapes[char]!);
}

export function createPublicPrelaunchGate(env: NodeJS.ProcessEnv) {
  const mode = env.FAWRI_PUBLIC_PRELAUNCH_ONLY;
  const gateActive = publicPrelaunchGateActive(env);
  const operator = (env.FAWRI_PUBLIC_BUSINESS_OPERATOR || "").trim();
  const phone = (env.FAWRI_PUBLIC_BUSINESS_PHONE || "").trim();
  const email = (env.FAWRI_PUBLIC_BUSINESS_EMAIL || "").trim();
  const phoneValid = /^\+[1-9][0-9]{7,14}$/.test(phone);
  const emailValid = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,63}$/.test(email) && email.length <= 254;
  const configured = operator.length > 1 && operator.length <= 160 && (phoneValid || emailValid);
  // Values are supplied only after approval for PUBLIC display. Never derive
  // them from credentials, private owner records, merchant records or DB queries.
  const contacts = [
    phoneValid ? '<a dir="ltr" href="tel:' + phone + '">' + phone + '</a>' : "",
    emailValid ? '<a href="mailto:' + escapeHtml(email) + '">' + escapeHtml(email) + '</a>' : "",
  ].filter(Boolean).join(" · ");
  const name = escapeHtml(operator);
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Fawri Reply | Merchant management platform</title>
<meta name="description" content="Fawri Reply is preparing a merchant catalog, stock and manual order management platform. Registration is closed.">
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f6f8;color:#16243a;font:17px/1.65 system-ui,sans-serif}main{max-width:850px;margin:auto;padding:52px 24px}header{border-bottom:1px solid #d9e1e7;padding-bottom:24px}h1{font-size:clamp(32px,6vw,52px);line-height:1.12;margin:12px 0}h2{font-size:24px;margin:0 0 10px}p{margin:8px 0 16px}section{background:white;border:1px solid #d9e1e7;border-radius:14px;padding:24px;margin:18px 0}a{color:#12634d;overflow-wrap:anywhere}.brand{font-weight:750;color:#12634d;letter-spacing:.04em}.status{color:#526478;font-weight:600}footer{font-size:14px;color:#526478}ul{padding-inline-start:24px}
</style></head><body><main>
<header><div class="brand">FAWRI REPLY · فوري</div><h1>Commerce management for merchants</h1><p>Fawri Reply is preparing its first release to help merchants organize products, inventory and manual orders, including cash-on-delivery status tracking.</p><p class="status">Prelaunch information only — registration and commercial services are not open.</p></header>
<section><h2>Planned first release</h2><ul><li>Product catalog and inventory management</li><li>Manual order management and cash-on-delivery tracking</li><li>Merchant account and subscription administration</li></ul><p>Automated social messaging, point of sale and online payment processing are not offered in this release.</p><p>WhatsApp verification is planned for merchant authentication, subject to provider approval and testing.</p></section>
<section lang="ar" dir="rtl"><h2>عن فوري</h2><p>فوري منصة قيد التجهيز لإدارة المنتجات والمخزون والطلبات اليدوية ومتابعة الدفع عند الاستلام. التسجيل التجاري غير متاح حالياً، ولا نقدم الردود الآلية أو الكاشير أو الدفع الإلكتروني في النسخة الأولى.</p><p>التحقق من الهاتف عبر واتساب مخطط له بعد اعتماد المزود واختباره.</p></section>
<section><h2>Business contact / التواصل</h2><p>Operator / المشغّل: ${name}</p><p>${contacts}</p><p><a href="https://fawrireply.com/">fawrireply.com</a></p></section>
<section><h2>Prelaunch privacy and terms / الخصوصية والشروط</h2><p>This information page does not offer registration, payment, or an online contact form. Normal web hosting may process connection and security logs. Contacting the operator is voluntary; do not send passwords or verification codes. Full merchant-service privacy and terms will be published after review and before commercial registration.</p><p lang="ar" dir="rtl">هذه الصفحة للتعريف فقط ولا تتيح التسجيل أو الدفع أو نموذج تواصل. قد تعالج الاستضافة سجلات الاتصال والأمان. لا ترسل كلمات المرور أو رموز التحقق. ستُنشر سياسات خدمة التجار بعد مراجعتها وقبل فتح التسجيل.</p></section>
<footer>Fawri Reply — prelaunch information, not an offer to purchase a subscription.</footer></main></body></html>`;
  return (req: Request, res: Response, next: NextFunction): void => {
    // Missing or explicit 0 preserves existing deployment behavior. A malformed
    // nonempty setting fails closed rather than silently exposing the app.
    if (!gateActive) { next(); return; }
    const read = req.method === "GET" || req.method === "HEAD";
    // Only the existing exact health probes may continue. No API, static SPA,
    // auth, admin, media, webhook or merchant action reaches downstream routes.
    if (read && (req.path === "/healthz" || req.path === "/readyz")) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (mode === "1" && configured && read && req.path === "/") {
      res.status(200).type("html").send(html);
      return;
    }
    res.status(503).type("text/plain").send("Fawri Reply — registration and commercial services are closed.");
  };
}
