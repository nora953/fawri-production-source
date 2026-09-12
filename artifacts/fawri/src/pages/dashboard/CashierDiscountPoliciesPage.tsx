import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';

type Staff = {
  id: string;
  display_name: string;
  role: 'cashier' | 'manager';
  status: 'active' | 'disabled' | 'revoked';
  version: number;
};

type Policy = {
  enabled: boolean;
  max_percentage_bps: number;
  max_amount_minor: number | null;
  can_approve_override: boolean;
  version: number;
};

type PolicyRow = {
  staff_id: string;
  staff_version: number;
  discount_policy: Policy;
};

type Draft = {
  enabled: boolean;
  maxPercent: string;
  maxAmount: string;
  canApproveOverride: boolean;
};

const TEXT: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'صلاحيات خصم موظفي الكاشير',
    subtitle: 'حدد لكل موظف هل يسمح له بالخصم، والحد الأقصى، ومن يملك اعتماد تجاوز الحد.',
    back: 'العودة للكاشيرات والموظفين',
    enabled: 'السماح بخصم يدوي',
    maxPercent: 'الحد الأقصى للنسبة %',
    maxAmount: 'الحد الأقصى للمبلغ (اختياري)',
    override: 'السماح لهذا المدير باعتماد خصم يتجاوز حد موظف آخر',
    save: 'حفظ سياسة الخصم',
    saving: 'جارٍ الحفظ...',
    loading: 'جارٍ تحميل الموظفين...',
    failed: 'تعذر تحميل أو حفظ سياسة الخصم.',
    saved: 'تم حفظ سياسة الخصم.',
    percentRequired: 'أدخل الحد الأقصى للنسبة. اكتب 0 صراحةً إذا كنت تقصد أن يكون الحد صفراً.',
    disabledPolicy: 'الخصم اليدوي غير مسموح لهذا الموظف.',
    active: 'نشط', disabledStatus: 'معطل', cashier: 'كاشير', manager: 'مدير',
    hint: 'لا يغيّر الخصم السعر الأصلي للمنتج. يحفظ كسطر مستقل بعد خصومات العروض حتى تبقى الأرباح والتقارير قابلة للتدقيق.',
    permissionHint: 'عند حفظ سياسة الخصم، يحدّث فوري صلاحيات الخصم المرتبطة للموظف تلقائيًا. لا تحتاج لتفعيلها مرة ثانية من صفحة الكاشيرات والموظفين.',
  },
  ku: {
    title: 'دەسەڵاتی داشکاندنی کارمەندانی کاشێر',
    subtitle: 'بۆ هەر کارمەندێک ڕێگەپێدان و سنووری داشکاندن دیاری بکە.',
    back: 'گەڕانەوە بۆ کاشێر و کارمەندان',
    enabled: 'ڕێگەدان بە داشکاندنی دەستی', maxPercent: 'زۆرترین ڕێژە %',
    maxAmount: 'زۆرترین بڕ (ئارەزوومەندانە)', override: 'ڕێگەدان بە بەڕێوەبەر بۆ پەسەندکردنی تێپەڕاندنی سنووری کارمەندێکی تر',
    save: 'پاشەکەوتکردنی سیاسەت', saving: 'پاشەکەوت دەکرێت...', loading: 'کارمەندان بار دەکرێن...',
    failed: 'بارکردن یان پاشەکەوتکردن سەرکەوتوو نەبوو.', saved: 'سیاسەتی داشکاندن پاشەکەوت کرا.',
    percentRequired: 'زۆرترین ڕێژە بنووسە. ئەگەر مەبەستت سنووری سفرە، 0 بە ڕوونی بنووسە.',
    disabledPolicy: 'داشکاندنی دەستی بۆ ئەم کارمەندە ڕێگەپێدراو نییە.', active: 'چالاک', disabledStatus: 'ناچالاک', cashier: 'کاشێر', manager: 'بەڕێوەبەر',
    hint: 'داشکاندن نرخی بنەڕەتی کاڵا ناگۆڕێت؛ بە جیاوازی دوای داشکاندنی ئۆفەرەکان تۆمار دەکرێت.',
    permissionHint: 'کاتێک سیاسەتی داشکاندن پاشەکەوت دەکەیت، فەوری دەسەڵاتە پەیوەندیدارەکانی داشکاندن بۆ کارمەند بە خۆکار نوێ دەکاتەوە؛ پێویست ناکات دووبارە لە پەڕەی کاشێر و کارمەندان چالاکیان بکەیت.',
  },
  en: {
    title: 'Cashier employee discount authority',
    subtitle: 'Set who may discount, their maximum range, and who may approve an override.',
    back: 'Back to cashiers & staff', enabled: 'Allow manual discount', maxPercent: 'Maximum percentage %',
    maxAmount: 'Maximum amount (optional)', override: 'Allow this manager to approve a discount above another employee’s limit',
    save: 'Save discount policy', saving: 'Saving...', loading: 'Loading staff...', failed: 'Could not load or save the discount policy.', saved: 'Discount policy saved.',
    percentRequired: 'Enter the maximum percentage. Type 0 explicitly if you intend the limit to be zero.',
    disabledPolicy: 'Manual discount is not allowed for this employee.', active: 'Active', disabledStatus: 'Disabled', cashier: 'Cashier', manager: 'Manager',
    hint: 'Manual discount never changes the product list price. It is recorded separately after promotion discounts so profit and reporting remain auditable.',
    permissionHint: 'Saving this discount policy automatically syncs the staff member’s related discount permissions. No second permission change is needed on the Cashiers & Staff page.',
  },
};

function draftFromPolicy(policy: Policy): Draft {
  return {
    enabled: policy.enabled,
    maxPercent: String(policy.max_percentage_bps / 100),
    maxAmount: policy.max_amount_minor === null ? '' : String(policy.max_amount_minor),
    canApproveOverride: policy.can_approve_override,
  };
}

export default function CashierDiscountPoliciesPage() {
  const { lang, dir } = useI18n();
  const copy = TEXT[lang];
  const [staff, setStaff] = useState<Staff[]>([]);
  const [policies, setPolicies] = useState<Record<string, PolicyRow>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [staffResponse, policyResponse] = await Promise.all([
        fetch('/api/cashier/management/staff', { cache: 'no-store' }),
        fetch('/api/cashier/management/discount-policies', { cache: 'no-store' }),
      ]);
      const staffPayload = await staffResponse.json();
      const policyPayload = await policyResponse.json();
      if (!staffResponse.ok || staffPayload.ok !== true || !policyResponse.ok || policyPayload.ok !== true) {
        throw new Error('LOAD_FAILED');
      }
      const staffList = (Array.isArray(staffPayload.staff) ? staffPayload.staff : []) as Staff[];
      const rows = (Array.isArray(policyPayload.policies) ? policyPayload.policies : []) as PolicyRow[];
      const nextPolicies: Record<string, PolicyRow> = {};
      const nextDrafts: Record<string, Draft> = {};
      for (const row of rows) {
        nextPolicies[row.staff_id] = row;
        nextDrafts[row.staff_id] = draftFromPolicy(row.discount_policy);
      }
      setStaff(staffList.filter(item => item.status !== 'revoked'));
      setPolicies(nextPolicies);
      setDrafts(nextDrafts);
    } catch {
      setMessage({ kind: 'error', text: copy.failed });
    } finally {
      setLoading(false);
    }
  }, [copy.failed]);

  useEffect(() => { void load(); }, [load]);

  const visibleStaff = useMemo(() => staff.filter(item => policies[item.id]), [policies, staff]);

  const updateDraft = (staffId: string, patch: Partial<Draft>) => {
    setDrafts(current => ({
      ...current,
      [staffId]: { ...current[staffId], ...patch },
    }));
  };

  const save = async (member: Staff) => {
    const row = policies[member.id];
    const draft = drafts[member.id];
    if (!row || !draft) return;
    const percentInput = draft.maxPercent.trim();
    if (percentInput === '') {
      setMessage({ kind: 'error', text: copy.percentRequired });
      return;
    }
    const percent = Number(percentInput);
    const amount = draft.maxAmount.trim() === '' ? null : Number(draft.maxAmount);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100 || (amount !== null && (!Number.isSafeInteger(amount) || amount < 0))) {
      setMessage({ kind: 'error', text: copy.failed });
      return;
    }
    setSavingId(member.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/cashier/management/staff/${encodeURIComponent(member.id)}/discount-policy`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_version: row.staff_version,
          discount_policy: {
            enabled: draft.enabled,
            max_percentage_bps: Math.round(percent * 100),
            max_amount_minor: amount,
            can_approve_override:
              member.role === 'manager' && draft.enabled && draft.canApproveOverride,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(String(payload.code || 'SAVE_FAILED'));
      const nextRow: PolicyRow = {
        staff_id: member.id,
        staff_version: Number(payload.staff_version),
        discount_policy: payload.discount_policy as Policy,
      };
      setPolicies(current => ({ ...current, [member.id]: nextRow }));
      setDrafts(current => ({ ...current, [member.id]: draftFromPolicy(nextRow.discount_policy) }));
      setMessage({ kind: 'ok', text: copy.saved });
    } catch {
      setMessage({ kind: 'error', text: copy.failed });
      await load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-1" dir={dir}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-950">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        <a href="/dashboard/cashiers" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">{copy.back}</a>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">{copy.hint}</div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{copy.permissionHint}</div>
      {message ? <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{message.text}</div> : null}

      {loading ? <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">{copy.loading}</div> : (
        <div className="space-y-3">
          {visibleStaff.map(member => {
            const draft = drafts[member.id];
            if (!draft) return null;
            return (
              <section key={member.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-black text-slate-950">{member.display_name}</h2>
                    <p className="mt-1 text-xs text-slate-500">{member.role === 'manager' ? copy.manager : copy.cashier} · {member.status === 'active' ? copy.active : copy.disabledStatus}</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <input type="checkbox" checked={draft.enabled} onChange={event => updateDraft(member.id, { enabled: event.target.checked, canApproveOverride: event.target.checked ? draft.canApproveOverride : false })} />
                    {copy.enabled}
                  </label>
                </div>

                {draft.enabled ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-bold text-slate-700">
                      {copy.maxPercent}
                      <input type="number" min="0" max="100" step="0.01" value={draft.maxPercent} onChange={event => updateDraft(member.id, { maxPercent: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-orange-400" dir="ltr" />
                    </label>
                    <label className="text-sm font-bold text-slate-700">
                      {copy.maxAmount}
                      <input type="number" min="0" step="1" value={draft.maxAmount} onChange={event => updateDraft(member.id, { maxAmount: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-orange-400" dir="ltr" />
                    </label>
                    {member.role === 'manager' ? (
                      <label className="md:col-span-2 flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                        <input type="checkbox" checked={draft.canApproveOverride} onChange={event => updateDraft(member.id, { canApproveOverride: event.target.checked })} className="mt-1" />
                        <span>{copy.override}</span>
                      </label>
                    ) : null}
                  </div>
                ) : <p className="mt-3 text-sm text-slate-500">{copy.disabledPolicy}</p>}

                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => void save(member)} disabled={savingId === member.id} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50">
                    {savingId === member.id ? copy.saving : copy.save}
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
