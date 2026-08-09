import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  Clock3,
  Loader2,
  PauseCircle,
  RefreshCw,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { clearMerchantTabSession } from '@/lib/store';
import { secureMerchantLogout } from '@/lib/authClientCutover';
import {
  checkMerchantLifecycle,
  lifecyclePollDelay,
  shouldPollMerchantLifecycle,
} from '@/lib/merchantLifecycle';

type PendingView =
  | 'checking'
  | 'pending_review'
  | 'rejected'
  | 'suspended'
  | 'unavailable';

export default function PendingPage() {
  const { isRTL, lang } = useI18n();
  const [, setLocation] = useLocation();
  const [view, setView] = useState<PendingView>('checking');
  const [checking, setChecking] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);

  const brandName = lang === 'ar' ? 'فوري' : lang === 'ku' ? 'فورى' : 'Fawri';
  const text = {
    ar: {
      checkingTitle: 'جارٍ التحقق من حالة الحساب',
      checkingBody: 'نتحقق من حالة حسابك مباشرة من خادم فوري.',
      pendingTitle: 'طلبك قيد المراجعة',
      pendingBody:
        'تم التحقق من رقمك بنجاح، وحسابك ما زال بانتظار مراجعة الإدارة. لا توجد نسبة تقدم أو موافقة تلقائية؛ ستتغير هذه الصفحة عندما تتغير حالة الحساب في النظام.',
      rejectedTitle: 'لم تتم الموافقة على الحساب',
      rejectedBody:
        'حالة حسابك الحالية هي مرفوض. لا يمكن الدخول إلى لوحة التحكم بهذه الحالة.',
      suspendedTitle: 'تم تعليق الحساب',
      suspendedBody:
        'حالة حسابك الحالية هي معلّق. لا يمكن استخدام لوحة التحكم إلى أن تغيّر الإدارة حالة الحساب.',
      unavailableTitle: 'تعذر التحقق من حالة الحساب',
      unavailableBody:
        'لم نتمكن من الوصول إلى حالة الحساب من الخادم الآن. لم نفترض أي موافقة أو رفض. يمكنك المحاولة مجددًا.',
      refresh: 'تحقق من الحالة',
      checking: 'جارٍ التحقق…',
      logout: 'تسجيل الخروج',
    },
    en: {
      checkingTitle: 'Checking account status',
      checkingBody: 'We are checking your account state directly with the Fawri server.',
      pendingTitle: 'Your request is under review',
      pendingBody:
        'Your phone number is verified and your account is still awaiting administrative review. There is no simulated progress or automatic approval; this page changes only when the server-side account state changes.',
      rejectedTitle: 'Account not approved',
      rejectedBody:
        'Your current account state is rejected. Dashboard access is not available in this state.',
      suspendedTitle: 'Account suspended',
      suspendedBody:
        'Your current account state is suspended. Dashboard access remains unavailable until an administrator changes the account state.',
      unavailableTitle: 'Account status is unavailable',
      unavailableBody:
        'The server status could not be reached right now. No approval or rejection was inferred. You can try again.',
      refresh: 'Check status',
      checking: 'Checking…',
      logout: 'Log out',
    },
    ku: {
      checkingTitle: 'پشکنینی دۆخی هەژمار',
      checkingBody: 'دۆخی هەژمارەکەت ڕاستەوخۆ لە سێرڤەری فۆری پشکنین دەکرێت.',
      pendingTitle: 'داواکارییەکەت لە ژێر پێداچوونەوەدایە',
      pendingBody:
        'ژمارەی مۆبایلەکەت پشتڕاست کراوەتەوە و هەژمارەکەت هێشتا چاوەڕێی پێداچوونەوەی بەڕێوەبەرایەتییە. هیچ پێشکەوتنی ساختە یان پەسەندکردنی خۆکار نییە؛ تەنها کاتێک ئەم پەڕەیە دەگۆڕێت کە دۆخی هەژمار لە سێرڤەر بگۆڕێت.',
      rejectedTitle: 'هەژمارەکە پەسەند نەکرا',
      rejectedBody:
        'دۆخی ئێستای هەژمارەکەت ڕەتکراوەتەوە و دەستگەیشتن بە داشبۆرد ڕێگەپێنەدراوە.',
      suspendedTitle: 'هەژمارەکە هەڵپەسێردراوە',
      suspendedBody:
        'دۆخی ئێستای هەژمارەکەت هەڵپەسێردراوە و تا بەڕێوەبەر دۆخەکە نەگۆڕێت داشبۆرد بەردەست نییە.',
      unavailableTitle: 'دۆخی هەژمار بەردەست نییە',
      unavailableBody:
        'ئێستا نەتوانرا دۆخی هەژمار لە سێرڤەر وەربگیرێت. هیچ دۆخێک بە خەیاڵ دانەنراوە؛ دەتوانیت دووبارە هەوڵ بدەیتەوە.',
      refresh: 'پشکنینی دۆخ',
      checking: 'پشکنین…',
      logout: 'چوونەدەرەوە',
    },
  }[lang];

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    let failureCount = 0;

    function schedule(nextState: 'pending_review' | 'suspended' | 'unavailable') {
      if (!shouldPollMerchantLifecycle(nextState)) return;
      const delay = lifecyclePollDelay(
        nextState === 'unavailable' ? failureCount : 0,
      );
      timer = window.setTimeout(() => void runCheck(), delay);
    }

    async function runCheck() {
      controller?.abort();
      controller = new AbortController();
      setChecking(true);

      try {
        const result = await checkMerchantLifecycle(controller.signal);
        if (cancelled) return;

        if (!result.ok) {
          if (result.reason === 'unauthenticated') {
            clearMerchantTabSession();
            setLocation('/login');
            return;
          }

          failureCount += 1;
          setView('unavailable');
          schedule('unavailable');
          return;
        }

        failureCount = 0;
        const status = result.lifecycle.account_status;
        if (status === 'approved') {
          setLocation('/dashboard');
          return;
        }

        setView(status);
        if (status === 'pending_review' || status === 'suspended') {
          schedule(status);
        }
      } catch (error) {
        if (cancelled || (error instanceof Error && error.name === 'AbortError')) {
          return;
        }
        failureCount += 1;
        setView('unavailable');
        schedule('unavailable');
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void runCheck();

    return () => {
      cancelled = true;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshKey, setLocation]);

  const viewConfig =
    view === 'rejected'
      ? {
          title: text.rejectedTitle,
          body: text.rejectedBody,
          Icon: XCircle,
          iconClass: 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300',
        }
      : view === 'suspended'
        ? {
            title: text.suspendedTitle,
            body: text.suspendedBody,
            Icon: PauseCircle,
            iconClass:
              'bg-orange-100 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300',
          }
        : view === 'unavailable'
          ? {
              title: text.unavailableTitle,
              body: text.unavailableBody,
              Icon: WifiOff,
              iconClass:
                'bg-muted text-muted-foreground',
            }
          : view === 'checking'
            ? {
                title: text.checkingTitle,
                body: text.checkingBody,
                Icon: Loader2,
                iconClass: 'bg-primary/10 text-primary',
              }
            : {
                title: text.pendingTitle,
                body: text.pendingBody,
                Icon: Clock3,
                iconClass:
                  'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
              };

  const StatusIcon = viewConfig.Icon;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    await secureMerchantLogout();
    clearMerchantTabSession();
    setLocation('/login');
  };

  return (
    <div
      className="flex min-h-[100dvh] items-center justify-center bg-muted/30 p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="flex w-full max-w-md flex-col items-center rounded-3xl border bg-card p-8 text-center shadow-xl">
        <Link
          href="/"
          className="mb-8 inline-block text-3xl font-extrabold leading-none tracking-tight text-primary fowri-header-brand-font"
        >
          {brandName}
        </Link>

        <div
          className={`mb-6 flex h-16 w-16 items-center justify-center rounded-full ${viewConfig.iconClass}`}
        >
          <StatusIcon
            className={`h-8 w-8 ${view === 'checking' || checking ? 'animate-spin' : ''}`}
          />
        </div>

        <h1 className="mb-4 text-2xl font-bold">{viewConfig.title}</h1>
        <p className="mb-8 leading-relaxed text-muted-foreground">
          {viewConfig.body}
        </p>

        <Button
          type="button"
          onClick={() => setRefreshKey((current) => current + 1)}
          disabled={checking || loggingOut}
          className="mb-3 h-11 w-full rounded-xl"
        >
          <RefreshCw className={`me-2 h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? text.checking : text.refresh}
        </Button>

        <Button
          variant="ghost"
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="h-11 w-full rounded-xl text-sm text-muted-foreground"
        >
          {text.logout}
        </Button>
      </div>
    </div>
  );
}
