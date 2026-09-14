import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/lib/i18n';
import type { Lang } from '@/lib/types';
import { endCashierOperatorShiftWithPin } from '@/lib/cashierEndShiftRuntime';

const COPY: Record<Lang, {
  endShift: string;
  title: string;
  hint: string;
  pin: string;
  cancel: string;
  confirm: string;
  confirming: string;
  invalidPin: string;
  pinLocked: string;
  pendingSync: string;
  offline: string;
  sessionEnded: string;
  failed: string;
}> = {
  ar: {
    endShift: 'إنهاء المناوبة',
    title: 'تأكيد إنهاء المناوبة',
    hint: 'أدخل رمز PIN الخاص بالموظف الحالي لتأكيد إنهاء المناوبة.',
    pin: 'رمز PIN',
    cancel: 'إلغاء',
    confirm: 'إنهاء المناوبة',
    confirming: 'جارٍ إنهاء المناوبة...',
    invalidPin: 'رمز PIN غير صحيح.',
    pinLocked: 'تم إيقاف محاولات PIN مؤقتًا بسبب تكرار الإدخال الخاطئ.',
    pendingSync: 'يجب مزامنة العمليات المعلقة قبل إنهاء المناوبة.',
    offline: 'يجب الاتصال بالإنترنت لإنهاء المناوبة بأمان.',
    sessionEnded: 'انتهت مناوبة الموظف أو لم تعد الجلسة صالحة.',
    failed: 'تعذر إنهاء المناوبة. حاول مرة أخرى.',
  },
  ku: {
    endShift: 'کۆتایی مناوبە',
    title: 'پشتڕاستکردنەوەی کۆتایی مناوبە',
    hint: 'PIN ـی کارمەندی ئێستا بنووسە بۆ پشتڕاستکردنەوەی کۆتایی مناوبە.',
    pin: 'کۆدی PIN',
    cancel: 'هەڵوەشاندنەوە',
    confirm: 'کۆتایی مناوبە',
    confirming: 'مناوبە کۆتایی پێدێت...',
    invalidPin: 'PIN دروست نییە.',
    pinLocked: 'هەوڵدانی PIN بۆ ماوەیەک ڕاگیرا.',
    pendingSync: 'پێش کۆتایی مناوبە پێویستە کردارە چاوەڕوانەکان هاوکات بکرێن.',
    offline: 'بۆ کۆتایی مناوبە پێویستە ئینتەرنێت هەبێت.',
    sessionEnded: 'مناوبەکە کۆتایی هاتووە یان دانیشتنەکە چیتر دروست نییە.',
    failed: 'کۆتاییهێنان بە مناوبە سەرکەوتوو نەبوو. دووبارە هەوڵ بدە.',
  },
  en: {
    endShift: 'End shift',
    title: 'Confirm end shift',
    hint: 'Enter the current employee PIN to confirm ending this shift.',
    pin: 'PIN',
    cancel: 'Cancel',
    confirm: 'End shift',
    confirming: 'Ending shift...',
    invalidPin: 'The PIN is incorrect.',
    pinLocked: 'PIN attempts are temporarily locked after repeated failures.',
    pendingSync: 'Pending operations must synchronize before ending the shift.',
    offline: 'Internet access is required to end the shift safely.',
    sessionEnded: 'The employee shift has ended or the session is no longer valid.',
    failed: 'The shift could not be ended. Please try again.',
  },
};

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || '');
  }
  return '';
}

export default function CashierEndShiftButton({
  operatorName,
  onEnded,
  onStationBindingInvalid,
}: {
  operatorName: string;
  onEnded: () => Promise<void>;
  onStationBindingInvalid: (error: unknown) => Promise<boolean>;
}) {
  const { lang, dir } = useI18n();
  const labels = COPY[lang] || COPY.en;
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [headerTarget, setHeaderTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (lang !== 'en' || typeof document === 'undefined') {
      setHeaderTarget(null);
      return;
    }

    const resolveTarget = () => {
      if (document.documentElement.dataset.cashierView !== 'pos') {
        setHeaderTarget(null);
        return;
      }
      const nextTarget = document.querySelector<HTMLElement>(
        "html[lang='en'][data-cashier-view='pos'] main > div > header > div:first-child",
      );
      setHeaderTarget(current => current === nextTarget ? current : nextTarget);
    };

    resolveTarget();
    const observer = new MutationObserver(resolveTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [lang]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setPin('');
    setErrorMessage('');
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !/^\d{4,8}$/.test(pin)) return;

    setBusy(true);
    setErrorMessage('');
    try {
      await endCashierOperatorShiftWithPin(pin);
      setOpen(false);
      setPin('');
      await onEnded();
    } catch (error) {
      if (await onStationBindingInvalid(error)) {
        setOpen(false);
        setPin('');
        setErrorMessage('');
        return;
      }

      const code = errorCode(error);
      if (code === 'CASHIER_OPERATOR_SESSION_INVALID' || code === 'CASHIER_OPERATOR_LOGIN_REQUIRED') {
        setOpen(false);
        setPin('');
        await onEnded();
        return;
      }
      if (code === 'CASHIER_OPERATOR_INVALID' || code === 'CASHIER_PIN_INVALID' || code === 'CASHIER_PIN_REQUIRED') {
        setErrorMessage(labels.invalidPin);
      } else if (code === 'CASHIER_PIN_LOCKED') {
        setErrorMessage(labels.pinLocked);
      } else if (code === 'CASHIER_OPERATOR_PENDING_SYNC') {
        setErrorMessage(labels.pendingSync);
      } else if (code === 'CASHIER_OPERATOR_LOGOUT_OFFLINE') {
        setErrorMessage(labels.offline);
      } else {
        setErrorMessage(labels.failed);
      }
    } finally {
      setBusy(false);
    }
  };

  const modal = open && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]"
          dir={dir}
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="cashier-end-shift-title"
            aria-describedby="cashier-end-shift-hint"
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <h2 id="cashier-end-shift-title" className="text-lg font-bold text-slate-900">
              {labels.title}
            </h2>
            <p id="cashier-end-shift-hint" className="mt-2 text-sm leading-6 text-slate-500">
              {labels.hint}
            </p>
            {operatorName ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                {operatorName}
              </p>
            ) : null}

            <form onSubmit={submit} className="mt-4">
              <label className="block text-sm font-semibold text-slate-800">
                {labels.pin}
                <input
                  autoFocus
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={pin}
                  disabled={busy}
                  onChange={event => {
                    setPin(event.target.value.replace(/\D/g, '').slice(0, 8));
                    if (errorMessage) setErrorMessage('');
                  }}
                  autoComplete="off"
                  className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus:border-orange-400 disabled:bg-slate-50"
                  dir="ltr"
                />
              </label>

              {errorMessage ? (
                <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold leading-6 text-red-700" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <div className="mt-5 grid grid-cols-2 gap-3" dir="ltr">
                <button
                  type="button"
                  dir={dir}
                  disabled={busy}
                  onClick={close}
                  className="h-11 rounded-xl border border-slate-300 bg-white font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {labels.cancel}
                </button>
                <button
                  type="submit"
                  dir={dir}
                  disabled={busy || !/^\d{4,8}$/.test(pin)}
                  className="h-11 rounded-xl bg-orange-600 font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {busy ? labels.confirming : labels.confirm}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )
    : null;

  const trigger = (
    <button
      type="button"
      data-cashier-end-shift-trigger="true"
      onClick={() => {
        setPin('');
        setErrorMessage('');
        setOpen(true);
      }}
      className="h-8 shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
    >
      {labels.endShift}
    </button>
  );

  const triggerNode = lang === 'en'
    ? (headerTarget ? createPortal(trigger, headerTarget) : null)
    : trigger;

  return (
    <>
      {triggerNode}
      {modal}
    </>
  );
}
