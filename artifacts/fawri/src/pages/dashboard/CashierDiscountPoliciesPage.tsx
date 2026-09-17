import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n';
import { getMerchantRegionalContext, type MerchantRegionalContext } from '@/lib/merchantRegionalUiApi';
import {
  merchantCurrencyLabel,
  merchantMoneyMajorInputToMinor,
  merchantMoneyMinorToMajorInput,
  merchantSafeFractionDigits,
} from '@/lib/moneyUi';
import type { Lang } from '@/lib/types';

type DiscountKind = 'amount' | 'percentage';

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

type DiscountSetting = {
  discount_kind: DiscountKind;
  version: number;
};

type Draft = {
  enabled: boolean;
  maxPercent: string;
  maxAmount: string;
  canApproveOverride: boolean;
};

const TEXT: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'صلاحيات خصم الكاشير',
    subtitle: 'اختر نوع الخصم وحدد حد كل موظف.',
    back: 'العودة للكاشيرات والموظفين',
    discountType: 'نوع الخصم المعتمد',
    discountTypeHint: 'يُطبّق على جميع الكاشير والمديرين ولا يمكن تغييره من شاشة البيع.',
    amountType: 'مبلغ ثابت',
    percentageType: 'نسبة مئوية',
    saveType: 'حفظ نوع الخصم',
    typeSaved: 'تم حفظ نوع الخصم.',
    enabled: 'السماح بالخصم اليدوي',
    maxPercent: 'الحد الأقصى لنسبة الخصم (%)',
    maxAmount: 'الحد الأقصى للخصم بالمبلغ',
    independentLimitHint: 'تجاوز هذا الحد يتطلب موافقة مدير مخوّل.',
    managerLimitHint: 'هذا الحد هو أقصى ما يمكن لهذا المدير اعتماده.',
    override: 'السماح باعتماد تجاوزات الموظفين ضمن هذا الحد.',
    save: 'حفظ', saving: 'جارٍ الحفظ...', loading: 'جارٍ تحميل الموظفين...',
    failed: 'تعذر تحميل أو حفظ سياسة الخصم.', saved: 'تم حفظ سياسة الخصم.',
    percentRequired: 'أدخل الحد الأقصى للنسبة من 0 إلى 100.',
    amountRequired: 'أدخل حد الخصم بالمبلغ أكبر من صفر.',
    disabledPolicy: 'الخصم اليدوي غير مسموح لهذا الموظف.',
    active: 'نشط', disabledStatus: 'معطل', cashier: 'كاشير', manager: 'مدير',
    hint: 'الخصم اليدوي لا يغيّر سعر المنتج الأصلي.',
    permissionHint: 'الحفظ يحدّث الصلاحيات تلقائيًا، وتبقى حدود النوع الآخر محفوظة.',
  },
  ku: {
    title: 'دەسەڵاتی داشکاندنی کارمەندانی کاشێر',
    subtitle: 'یەک جۆری داشکاندن بۆ بازرگان هەڵبژێرە، پاشان سنووری هەر کارمەند دیاری بکە.',
    back: 'گەڕانەوە بۆ کاشێر و کارمەندان',
    discountType: 'جۆری داشکاندنی پەسەندکراو',
    discountTypeHint: 'ئەم هەڵبژاردنە بۆ هەموو کاشێر و بەڕێوەبەران جێبەجێ دەکرێت و کارمەند ناتوانێت لە کاتی فرۆشتن بیگۆڕێت.',
    amountType: 'بڕی جێگیر', percentageType: 'ڕێژەی سەدی', saveType: 'پاشەکەوتکردنی جۆری داشکاندن', typeSaved: 'جۆری داشکاندنی بازرگان پاشەکەوت کرا.',
    enabled: 'ڕێگەدان بە داشکاندنی دەستی',
    maxPercent: 'زۆرترین سنووری داشکاندن بە ڕێژە %', maxAmount: 'زۆرترین سنووری داشکاندن بە بڕ',
    independentLimitHint: 'تێپەڕاندنی سنووری کارمەند پەسەندی بەڕێوەبەری مۆڵەتپێدراو پێویستە.',
    managerLimitHint: 'ئەمە زۆرترین سنووری دەسەڵاتی ئەم بەڕێوەبەرە و ناتوانێت لێی تێپەڕێت.',
    override: 'ڕێگەدان بە بەڕێوەبەر بۆ پەسەندکردنی تێپەڕاندنی سنووری کارمەندێکی تر لە سنووری خۆی.',
    save: 'پاشەکەوت', saving: 'پاشەکەوت دەکرێت...', loading: 'کارمەندان بار دەکرێن...',
    failed: 'بارکردن یان پاشەکەوتکردن سەرکەوتوو نەبوو.', saved: 'سیاسەتی داشکاندن پاشەکەوت کرا.',
    percentRequired: 'زۆرترین ڕێژە لە 0 تا 100 بنووسە.', amountRequired: 'سنووری داشکاندن بە بڕێکی لە سفر زیاتر بنووسە.',
    disabledPolicy: 'داشکاندنی دەستی بۆ ئەم کارمەندە ڕێگەپێدراو نییە.',
    active: 'چالاک', disabledStatus: 'ناچالاک', cashier: 'کاشێر', manager: 'بەڕێوەبەر',
    hint: 'داشکاندنی دەستی نرخی بنەڕەتی کاڵا ناگۆڕێت و بە جیاوازی تۆمار دەکرێت.',
    permissionHint: 'پاشەکەوتکردنی سیاسەت دەسەڵاتەکان نوێ دەکاتەوە و گۆڕینی جۆر سنووری جۆری تر ناسڕێتەوە.',
  },
  en: {
    title: 'Cashier discount permissions',
    subtitle: 'Choose the discount type and set each employee’s limit.',
    back: 'Back to cashiers & staff',
    discountType: 'Active discount type',
    discountTypeHint: 'Applies to all cashiers and managers and cannot be changed at checkout.',
    amountType: 'Fixed amount', percentageType: 'Percentage', saveType: 'Save discount type', typeSaved: 'Discount type saved.',
    enabled: 'Allow manual discount',
    maxPercent: 'Maximum discount (%)', maxAmount: 'Maximum discount amount',
    independentLimitHint: 'Exceeding this limit requires approval from an authorized manager.',
    managerLimitHint: 'This is the maximum this manager can approve.',
    override: 'Allow this manager to approve employee limit overrides within this limit.',
    save: 'Save', saving: 'Saving...', loading: 'Loading staff...',
    failed: 'Could not load or save the discount policy.', saved: 'Discount policy saved.',
    percentRequired: 'Enter a percentage from 0 to 100.', amountRequired: 'Enter a discount amount greater than zero.',
    disabledPolicy: 'Manual discount is not allowed for this employee.',
    active: 'Active', disabledStatus: 'Disabled', cashier: 'Cashier', manager: 'Manager',
    hint: 'Manual discounts do not change the product’s original price.',
    permissionHint: 'Saving updates permissions automatically, and the other type’s limits stay saved.',
  },
};

function draftFromPolicy(policy: Policy, fractionDigits: number): Draft {
  return {
    enabled: policy.enabled,
    maxPercent: String(policy.max_percentage_bps / 100),
    maxAmount: policy.max_amount_minor === null
      ? ''
      : merchantMoneyMinorToMajorInput(policy.max_amount_minor, fractionDigits),
    canApproveOverride: policy.can_approve_override,
  };
}

function parseDiscountSetting(value: unknown): DiscountSetting {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SETTING_INVALID');
  const raw = value as Record<string, unknown>;
  if (raw.discount_kind !== 'amount' && raw.discount_kind !== 'percentage') throw new Error('SETTING_INVALID');
  const version = Number(raw.version);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('SETTING_INVALID');
  return { discount_kind: raw.discount_kind, version };
}

export default function CashierDiscountPoliciesPage() {
  const { lang, dir } = useI18n();
  const copy = TEXT[lang];
  const [staff, setStaff] = useState<Staff[]>([]);
  const [policies, setPolicies] = useState<Record<string, PolicyRow>>({});
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [discountSetting, setDiscountSetting] = useState<DiscountSetting | null>(null);
  const [discountKindDraft, setDiscountKindDraft] = useState<DiscountKind>('amount');
  const [regional, setRegional] = useState<MerchantRegionalContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingKind, setSavingKind] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [staffResponse, policyResponse, regionalContext] = await Promise.all([
        fetch('/api/cashier/management/staff', { cache: 'no-store' }),
        fetch('/api/cashier/management/discount-policies', { cache: 'no-store' }),
        getMerchantRegionalContext(),
      ]);
      const staffPayload = await staffResponse.json();
      const policyPayload = await policyResponse.json();
      if (!staffResponse.ok || staffPayload.ok !== true || !policyResponse.ok || policyPayload.ok !== true) {
        throw new Error('LOAD_FAILED');
      }
      const setting = parseDiscountSetting(policyPayload.discount_setting);
      const staffList = (Array.isArray(staffPayload.staff) ? staffPayload.staff : []) as Staff[];
      const rows = (Array.isArray(policyPayload.policies) ? policyPayload.policies : []) as PolicyRow[];
      const nextPolicies: Record<string, PolicyRow> = {};
      const nextDrafts: Record<string, Draft> = {};
      const fractionDigits = merchantSafeFractionDigits(regionalContext.currency_fraction_digits);
      for (const row of rows) {
        nextPolicies[row.staff_id] = row;
        nextDrafts[row.staff_id] = draftFromPolicy(row.discount_policy, fractionDigits);
      }
      setRegional(regionalContext);
      setStaff(staffList.filter(item => item.status !== 'revoked'));
      setPolicies(nextPolicies);
      setDrafts(nextDrafts);
      setDiscountSetting(setting);
      setDiscountKindDraft(setting.discount_kind);
    } catch {
      setMessage({ kind: 'error', text: copy.failed });
    } finally {
      setLoading(false);
    }
  }, [copy.failed]);

  useEffect(() => { void load(); }, [load]);

  const visibleStaff = useMemo(() => staff.filter(item => policies[item.id]), [policies, staff]);
  const fractionDigits = merchantSafeFractionDigits(regional?.currency_fraction_digits ?? 0);
  const currencyLabel = merchantCurrencyLabel(regional?.currency_code ?? '', lang);
  const amountStep = fractionDigits === 0 ? '1' : `0.${'0'.repeat(Math.max(0, fractionDigits - 1))}1`;
  const updateDraft = (staffId: string, patch: Partial<Draft>) =>
    setDrafts(current => ({ ...current, [staffId]: { ...current[staffId], ...patch } }));

  const saveDiscountKind = async () => {
    if (!discountSetting || savingKind || savingId !== null) return;
    if (discountKindDraft === discountSetting.discount_kind) return;
    setSavingKind(true);
    setMessage(null);
    try {
      const response = await fetch('/api/cashier/management/discount-kind', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expected_version: discountSetting.version,
          discount_kind: discountKindDraft,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.ok !== true) throw new Error(String(payload.code || 'SAVE_FAILED'));
      const next = parseDiscountSetting(payload.discount_setting);
      setDiscountSetting(next);
      setDiscountKindDraft(next.discount_kind);
      setMessage({ kind: 'ok', text: copy.typeSaved });
    } catch {
      setMessage({ kind: 'error', text: copy.failed });
      await load();
    } finally {
      setSavingKind(false);
    }
  };

  const save = async (member: Staff) => {
    const row = policies[member.id];
    const draft = drafts[member.id];
    if (
      !row ||
      !draft ||
      !regional ||
      !discountSetting ||
      savingId !== null ||
      savingKind ||
      discountKindDraft !== discountSetting.discount_kind
    ) return;

    let percentageBps = row.discount_policy.max_percentage_bps;
    let amountMinor = row.discount_policy.max_amount_minor;
    if (draft.enabled && discountSetting.discount_kind === 'percentage') {
      const percentInput = draft.maxPercent.trim();
      const percent = Number(percentInput);
      const percentTimes100 = percent * 100;
      if (
        percentInput === '' ||
        !Number.isFinite(percent) ||
        percent < 0 ||
        percent > 100 ||
        !Number.isSafeInteger(Math.round(percentTimes100)) ||
        Math.abs(percentTimes100 - Math.round(percentTimes100)) > 1e-7
      ) {
        setMessage({ kind: 'error', text: copy.percentRequired });
        return;
      }
      percentageBps = Math.round(percentTimes100);
    }
    if (draft.enabled && discountSetting.discount_kind === 'amount') {
      amountMinor = merchantMoneyMajorInputToMinor(draft.maxAmount, fractionDigits);
      if (amountMinor === null || amountMinor <= 0) {
        setMessage({ kind: 'error', text: copy.amountRequired });
        return;
      }
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
            max_percentage_bps: draft.enabled ? percentageBps : 0,
            max_amount_minor: draft.enabled ? amountMinor : null,
            can_approve_override: member.role === 'manager' && draft.enabled && draft.canApproveOverride,
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
      setDrafts(current => ({
        ...current,
        [member.id]: draftFromPolicy(nextRow.discount_policy, fractionDigits),
      }));
      setMessage({ kind: 'ok', text: copy.saved });
    } catch {
      setMessage({ kind: 'error', text: copy.failed });
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
        <a href="/dashboard/cashiers" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
          {copy.back}
        </a>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">{copy.hint}</div>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{copy.permissionHint}</div>

      {message ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      ) : null}

      {!loading && discountSetting ? (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
          <h2 className="font-black text-slate-950">{copy.discountType}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{copy.discountTypeHint}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setDiscountKindDraft('amount')}
              disabled={savingKind || savingId !== null}
              className={`h-11 rounded-xl border px-4 text-sm font-black transition ${discountKindDraft === 'amount' ? 'border-orange-500 bg-white text-orange-700 ring-2 ring-orange-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {copy.amountType}
            </button>
            <button
              type="button"
              onClick={() => setDiscountKindDraft('percentage')}
              disabled={savingKind || savingId !== null}
              className={`h-11 rounded-xl border px-4 text-sm font-black transition ${discountKindDraft === 'percentage' ? 'border-orange-500 bg-white text-orange-700 ring-2 ring-orange-100' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {copy.percentageType}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void saveDiscountKind()}
            disabled={savingKind || savingId !== null || discountKindDraft === discountSetting.discount_kind}
            className="mt-3 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {savingKind ? copy.saving : copy.saveType}
          </button>
        </section>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">{copy.loading}</div>
      ) : (
        <div className="space-y-3">
          {visibleStaff.map(member => {
            const draft = drafts[member.id];
            if (!draft || !discountSetting) return null;
            const limitHint = member.role === 'manager' ? copy.managerLimitHint : copy.independentLimitHint;
            const saveButton = (
              <button
                type="button"
                onClick={() => void save(member)}
                disabled={
                  savingId !== null ||
                  savingKind ||
                  !regional ||
                  discountKindDraft !== discountSetting.discount_kind
                }
                className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {savingId === member.id ? copy.saving : copy.save}
              </button>
            );

            return (
              <section key={member.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-black text-slate-950">{member.display_name}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {member.role === 'manager' ? copy.manager : copy.cashier} · {member.status === 'active' ? copy.active : copy.disabledStatus}
                    </p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={event => updateDraft(member.id, {
                        enabled: event.target.checked,
                        canApproveOverride: event.target.checked ? draft.canApproveOverride : false,
                      })}
                      className="h-4 w-4 accent-orange-600"
                    />
                    {copy.enabled}
                  </label>
                </div>

                {draft.enabled ? (
                  <div className="mt-4 grid gap-3">
                    {discountKindDraft === 'percentage' ? (
                      <label className="text-sm font-bold text-slate-700">
                        {copy.maxPercent}
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={draft.maxPercent}
                          onChange={event => updateDraft(member.id, { maxPercent: event.target.value })}
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-orange-400"
                          dir="ltr"
                        />
                      </label>
                    ) : (
                      <label className="block text-sm font-bold text-slate-700">
                        {copy.maxAmount} ({currencyLabel})
                        <input
                          type="number"
                          min={amountStep}
                          step={amountStep}
                          value={draft.maxAmount}
                          onChange={event => updateDraft(member.id, { maxAmount: event.target.value })}
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-orange-400"
                          dir="ltr"
                        />
                      </label>
                    )}
                    <div className="flex justify-start">{saveButton}</div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-700">
                      <div>{limitHint}</div>
                    </div>
                    {member.role === 'manager' ? (
                      <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-950">
                        <input
                          type="checkbox"
                          checked={draft.canApproveOverride}
                          onChange={event => updateDraft(member.id, { canApproveOverride: event.target.checked })}
                          className="mt-1 h-4 w-4 accent-orange-600"
                        />
                        <span>{copy.override}</span>
                      </label>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    <p className="text-sm text-slate-500">{copy.disabledPolicy}</p>
                    <div className="flex justify-start">{saveButton}</div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
