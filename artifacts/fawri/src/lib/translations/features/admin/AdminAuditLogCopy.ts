import type { Lang } from "@/lib/types";
import { earlyWarningIncidentLabel } from "@/lib/translations/features/lib/earlyWarningCoverageCopy";

const ACTION_LABELS: Record<Lang, Record<string, string>> = {
  ar: {
    early_warning_incident_opened: "فتح تنبيه مبكر",
    early_warning_incident_resolved: "معالجة تنبيه مبكر",
    emergency_duration_expiry_time_reconciled: "تسوية وقت انتهاء الوصول الطارئ",
  },
  ku: {
    early_warning_incident_opened: "کردنەوەی ئاگاداریی پێشوەخت",
    early_warning_incident_resolved: "چارەسەرکردنی ئاگاداریی پێشوەخت",
    emergency_duration_expiry_time_reconciled: "ڕێکخستنەوەی کاتی کۆتایی دەستگەیشتنی فریاکەوتن",
  },
  en: {
    early_warning_incident_opened: "Early warning opened",
    early_warning_incident_resolved: "Early warning resolved",
    emergency_duration_expiry_time_reconciled: "Emergency access expiry time reconciled",
  },
};

export function localizedAuditAction(lang: Lang, action: string): string {
  return ACTION_LABELS[lang]?.[action] ?? action;
}

export function localizedAuditReason(lang: Lang, reason: string): string {
  if (!reason) return reason;
  if (/^[A-Z][A-Z0-9_]+$/.test(reason)) {
    const translated = earlyWarningIncidentLabel(lang, reason);
    const genericLabels = {
      ar: "إنذار تشغيلي",
      ku: "ئاگادارییەکی کارکردن",
      en: "Operational alert",
    };
    return translated === genericLabels[lang] ? reason : translated;
  }
  return reason;
}
