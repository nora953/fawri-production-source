import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  RefreshCw,
  Save,
  WalletCards,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getAdminAuthHeaders } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import {
  PROVIDER_COST_METER_LABELS,
  PROVIDER_COST_SETTINGS_TEXT,
  PROVIDER_COST_UNIT_LABELS,
  type ProviderCostSettingsLanguage,
} from "@/lib/translations/features/pages/ProviderCostSettings";

type SourceType = "owner_configured" | "provider_rate_card" | "provider_api";
type UsageAuthority = "connected" | "not_connected";

type MeterDefinition = {
  meter_key: string;
  unit_code: string;
  category: string;
  usage_authority: UsageAuthority;
  report_component: string | null;
};

type Rate = {
  id: string;
  meter_key: string;
  provider_key: string;
  unit_code: string;
  dimension_key: string;
  dimension_value: string;
  rate_usd: number;
  source_type: SourceType;
  source_reference: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type Configuration = {
  generated_at: string;
  catalog: MeterDefinition[];
  monthly_budget_usd: number | null;
  current_rates: Rate[];
  history: Rate[];
};

type Draft = {
  provider_key: string;
  rate_usd: string;
  source_type: "owner_configured" | "provider_rate_card";
  source_reference: string;
  effective_month: string;
  notes: string;
};

const GROUPS = [
  { key: "ai", label: "aiGroup", meters: ["ai_input_tokens_per_1m", "ai_output_tokens_per_1m"] },
  { key: "messaging", label: "messagingGroup", meters: ["outbound_messages_per_1000", "otp_message", "meta_whatsapp_marketing_message", "meta_whatsapp_utility_message", "meta_whatsapp_authentication_message", "email_message"] },
  { key: "infrastructure", label: "infrastructureGroup", meters: ["support_storage_gb_month", "database_storage_gb_month", "network_egress_gb", "object_storage_gb_month"] },
  { key: "external", label: "externalGroup", meters: ["external_api_1000_requests"] },
] as const;

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthOf(value?: string | null) {
  return value ? value.slice(0, 7) : currentMonth();
}

function unitLabel(unit: string) {
  return PROVIDER_COST_UNIT_LABELS[unit] || unit;
}

function draftFor(rate?: Rate): Draft {
  return {
    provider_key: rate?.provider_key || "",
    rate_usd: rate ? String(rate.rate_usd) : "",
    source_type: rate?.source_type === "provider_rate_card" ? "provider_rate_card" : "owner_configured",
    source_reference: rate?.source_reference || "",
    effective_month: monthOf(rate?.effective_from),
    notes: rate?.notes || "",
  };
}

export default function ProviderCostSettings({ root }: { root: HTMLElement | null }) {
  const { lang } = useI18n();
  const locale = lang as ProviderCostSettingsLanguage;
  const t = PROVIDER_COST_SETTINGS_TEXT[locale];
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [savingKey, setSavingKey] = useState("");
  const [budget, setBudget] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["ai"]));
  const [editingMeter, setEditingMeter] = useState<string | null>(null);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/admin/provider-costs", {
        headers: getAdminAuthHeaders(),
        cache: "no-store",
      });
      if (response.status === 403 || response.status === 401) {
        setAllowed(false);
        return;
      }
      if (!response.ok) throw new Error(`provider_costs_${response.status}`);
      const body = (await response.json()) as { configuration?: Configuration };
      if (!body.configuration) throw new Error("provider_costs_payload");
      const next = body.configuration;
      setAllowed(true);
      setConfiguration(next);
      setBudget(next.monthly_budget_usd === null ? "" : String(next.monthly_budget_usd));
      const currentByMeter = new Map(
        next.current_rates
          .filter((rate) => rate.dimension_key === "global" && rate.dimension_value === "global")
          .map((rate) => [rate.meter_key, rate]),
      );
      setDrafts(Object.fromEntries(
        next.catalog.map((meter) => [meter.meter_key, draftFor(currentByMeter.get(meter.meter_key))]),
      ));
    } catch {
      setAllowed(false);
      if (open) setError(t.loadFailed);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [open, t.loadFailed]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!root || !allowed) {
      setPortalTarget(null);
      return;
    }
    const locate = () => {
      setPortalTarget(root.querySelector<HTMLElement>("[data-provider-cost-settings-launcher]"));
    };
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(root, { subtree: true, childList: true });
    return () => observer.disconnect();
  }, [allowed, root]);

  const currentByMeter = useMemo(() => new Map(
    (configuration?.current_rates || [])
      .filter((rate) => rate.dimension_key === "global" && rate.dimension_value === "global")
      .map((rate) => [rate.meter_key, rate]),
  ), [configuration]);

  const catalogByKey = useMemo(
    () => new Map((configuration?.catalog || []).map((meter) => [meter.meter_key, meter])),
    [configuration],
  );

  const setDraft = (meterKey: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [meterKey]: { ...(current[meterKey] || draftFor()), ...patch },
    }));
  };

  const saveRate = async (meter: MeterDefinition) => {
    const draft = drafts[meter.meter_key] || draftFor();
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.effective_month)) {
      setError(t.saveFailed);
      return;
    }
    setSavingKey(meter.meter_key);
    setSaved("");
    setError("");
    try {
      const response = await fetch(`/api/auth/admin/provider-costs/rates/${encodeURIComponent(meter.meter_key)}`, {
        method: "PUT",
        headers: { ...getAdminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_key: draft.provider_key,
          rate_usd: draft.rate_usd,
          source_type: draft.source_type,
          source_reference: draft.source_reference || null,
          effective_month: draft.effective_month,
          notes: draft.notes || null,
          dimension_key: "global",
          dimension_value: "global",
        }),
      });
      if (!response.ok) throw new Error(`provider_cost_rate_${response.status}`);
      setSaved(meter.meter_key);
      setEditingMeter(null);
      await load(false);
    } catch {
      setError(t.saveFailed);
    } finally {
      setSavingKey("");
    }
  };

  const saveBudget = async () => {
    setSavingKey("budget");
    setSaved("");
    setError("");
    try {
      const response = await fetch("/api/auth/admin/provider-costs/settings", {
        method: "PATCH",
        headers: { ...getAdminAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ monthly_budget_usd: budget === "" ? null : budget }),
      });
      if (!response.ok) throw new Error(`provider_cost_budget_${response.status}`);
      setSaved("budget");
      await load(false);
    } catch {
      setError(t.saveFailed);
    } finally {
      setSavingKey("");
    }
  };

  const toggleGroup = (key: string) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!allowed || !configuration) return null;

  const launcher = portalTarget ? createPortal(
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-[10px] font-black text-foreground shadow-sm hover:bg-muted"
    >
      <WalletCards className="h-3.5 w-3.5 text-primary" />
      <span className="hidden sm:inline">{t.launch}</span>
    </button>,
    portalTarget,
  ) : null;

  return (
    <>
      {launcher}
      {open && createPortal(
        <div
          data-provider-cost-settings-modal
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-6"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setOpen(false);
          }}
        >
          <section
            className="provider-cost-settings-modal flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl"
            dir={lang === "en" ? "ltr" : "rtl"}
          >
            <header className="flex shrink-0 items-start gap-3 border-b px-4 py-3 sm:px-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <WalletCards className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-black">{t.title}</h2>
                <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{t.subtitle}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setOpen(false)}
                title={t.close}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-800">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_auto]">
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] leading-5">
                  <p className="font-bold text-foreground">{t.costMeaning}</p>
                  <p className="mt-1 text-muted-foreground">{t.sourceProtected}</p>
                  <p className="mt-1 text-muted-foreground">{t.overlapGuard}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="grid min-w-56 gap-1.5 text-xs font-bold">
                      <span>{t.budget}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={budget}
                        onChange={(event) => setBudget(event.target.value)}
                        placeholder={t.budgetHint}
                        className="h-9 rounded-lg border bg-background px-3 outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                        dir="ltr"
                      />
                    </label>
                    <Button
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={() => void saveBudget()}
                      disabled={savingKey === "budget"}
                    >
                      {savingKey === "budget" ? <Loader2 className="h-4 w-4 animate-spin" /> : saved === "budget" ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                      {saved === "budget" ? t.saved : t.saveBudget}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5"
                      onClick={() => void load(true)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {t.refresh}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {GROUPS.map((group) => {
                  const meters = group.meters
                    .map((key) => catalogByKey.get(key))
                    .filter((meter): meter is MeterDefinition => Boolean(meter));
                  const isOpen = openGroups.has(group.key);
                  const pricedCount = meters.filter((meter) => currentByMeter.has(meter.meter_key)).length;
                  return (
                    <section key={group.key} className="overflow-hidden rounded-xl border bg-card">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-muted/30"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-black">{t[group.label]}</span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {pricedCount}/{meters.length} {t.configured} · {t.groupHint}
                          </span>
                        </span>
                        {isOpen ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      </button>

                      {isOpen && (
                        <div className="divide-y border-t">
                          {meters.map((meter) => {
                            const current = currentByMeter.get(meter.meter_key);
                            const draft = drafts[meter.meter_key] || draftFor(current);
                            const isEditing = editingMeter === meter.meter_key;
                            return (
                              <article key={meter.meter_key} className="px-4 py-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="min-w-[220px] flex-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <h3 className="text-xs font-black">{PROVIDER_COST_METER_LABELS[meter.meter_key]?.[locale] || meter.meter_key}</h3>
                                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${meter.usage_authority === "connected" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-muted/40 text-muted-foreground"}`}>
                                        {meter.usage_authority === "connected" ? t.connected : t.notConnected}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] text-muted-foreground">
                                      <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono">{unitLabel(meter.unit_code)}</span>
                                      {current && <span dir="ltr">{current.provider_key}</span>}
                                    </div>
                                  </div>

                                  <div className="min-w-28 text-end text-[10px]">
                                    <span className="text-muted-foreground">{t.current}: </span>
                                    <b dir="ltr">{current ? `$${current.rate_usd}` : t.noRate}</b>
                                  </div>

                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    onClick={() => setEditingMeter(isEditing ? null : meter.meter_key)}
                                  >
                                    {isEditing ? <X className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
                                    {isEditing ? t.cancel : t.edit}
                                  </Button>
                                </div>

                                {isEditing && (
                                  <div className="mt-3 rounded-xl border bg-muted/15 p-3">
                                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                      <label className="grid gap-1 text-[10px] font-bold">
                                        <span>{t.provider}</span>
                                        <input
                                          value={draft.provider_key}
                                          onChange={(event) => setDraft(meter.meter_key, { provider_key: event.target.value })}
                                          placeholder={t.providerPlaceholder}
                                          className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                                          dir="ltr"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-[10px] font-bold">
                                        <span>{t.rate} · {unitLabel(meter.unit_code)}</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="any"
                                          value={draft.rate_usd}
                                          onChange={(event) => setDraft(meter.meter_key, { rate_usd: event.target.value })}
                                          className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                                          dir="ltr"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-[10px] font-bold">
                                        <span>{t.source}</span>
                                        <select
                                          value={draft.source_type}
                                          onChange={(event) => setDraft(meter.meter_key, { source_type: event.target.value as Draft["source_type"] })}
                                          className="h-9 rounded-lg border bg-background px-2 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                                        >
                                          <option value="owner_configured">{t.ownerConfigured}</option>
                                          <option value="provider_rate_card">{t.rateCard}</option>
                                        </select>
                                      </label>
                                      <label className="grid gap-1 text-[10px] font-bold">
                                        <span>{t.effective} · {t.effectiveMonthFormat}</span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="\d{4}-(0[1-9]|1[0-2])"
                                          maxLength={7}
                                          value={draft.effective_month}
                                          onChange={(event) => setDraft(meter.meter_key, { effective_month: event.target.value })}
                                          placeholder="2026-08"
                                          className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                                          dir="ltr"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-[10px] font-bold">
                                        <span>{t.reference}</span>
                                        <input
                                          value={draft.source_reference}
                                          onChange={(event) => setDraft(meter.meter_key, { source_reference: event.target.value })}
                                          placeholder={t.referencePlaceholder}
                                          className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                                        />
                                      </label>
                                      <label className="grid gap-1 text-[10px] font-bold">
                                        <span>{t.notes}</span>
                                        <input
                                          value={draft.notes}
                                          onChange={(event) => setDraft(meter.meter_key, { notes: event.target.value })}
                                          placeholder={t.notesPlaceholder}
                                          className="h-9 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/15"
                                        />
                                      </label>
                                    </div>
                                    <div className="mt-3 flex justify-end">
                                      <Button
                                        size="sm"
                                        className="h-8 gap-1.5"
                                        onClick={() => void saveRate(meter)}
                                        disabled={savingKey === meter.meter_key || !draft.provider_key.trim() || draft.rate_usd === "" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.effective_month)}
                                      >
                                        {savingKey === meter.meter_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved === meter.meter_key ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                                        {saved === meter.meter_key ? t.saved : t.save}
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border bg-card p-3 sm:p-4">
                <h3 className="text-sm font-black">{t.history}</h3>
                {configuration.history.length === 0 ? (
                  <p className="mt-3 text-xs text-muted-foreground">{t.rateHistoryEmpty}</p>
                ) : (
                  <div className="mt-3 overflow-auto rounded-lg border">
                    <table className="w-full min-w-[760px] text-[11px]">
                      <thead className="bg-muted/50 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-start">{t.month}</th>
                          <th className="px-3 py-2 text-start">{t.provider}</th>
                          <th className="px-3 py-2 text-start">{t.rate}</th>
                          <th className="px-3 py-2 text-start">{t.sourceLabel}</th>
                          <th className="px-3 py-2 text-start">{t.meter}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {configuration.history.map((rate) => (
                          <tr key={rate.id}>
                            <td className="px-3 py-2" dir="ltr">{rate.effective_from.slice(0, 7)}</td>
                            <td className="px-3 py-2" dir="ltr">{rate.provider_key}</td>
                            <td className="px-3 py-2 font-bold" dir="ltr">${rate.rate_usd}</td>
                            <td className="px-3 py-2">
                              {rate.source_type === "provider_api" ? t.providerApi : rate.source_type === "provider_rate_card" ? t.rateCard : t.ownerConfigured}
                            </td>
                            <td className="px-3 py-2 font-mono text-[10px]" dir="ltr">{rate.meter_key}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
