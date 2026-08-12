import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

type OtpPurpose = 'signup' | 'password_reset' | 'admin_device_verification';

export type OtpResendChallenge = {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
  devCode?: string;
};

type OtpResendSectionProps = {
  phone: string;
  purpose: OtpPurpose;
  deviceRecordId?: string;
  initialRetryAfterSeconds?: number;
  storageKey?: string;
  onResent?: (challenge: OtpResendChallenge) => void;
  onChallengeUnavailable?: () => void;
};

type ResendResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  challenge_id?: string;
  expires_at?: string;
  retry_after_seconds?: number;
  devCode?: string;
};

function clampSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed));
}

function previewDevCode(value: unknown): string | undefined {
  const code = String(value || '').trim();
  return /^\d{6}$/.test(code) ? code : undefined;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function createPhoneStorageId(phone: string): string {
  let hash = 5381;

  for (const character of phone.trim()) {
    hash = ((hash << 5) + hash) ^ character.charCodeAt(0);
  }

  return (hash >>> 0).toString(36);
}

export default function OtpResendSection({
  phone,
  purpose,
  deviceRecordId,
  initialRetryAfterSeconds = 0,
  storageKey,
  onResent,
  onChallengeUnavailable,
}: OtpResendSectionProps) {
  const { t } = useI18n();
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const resolvedStorageKey = useMemo(() => {
    if (storageKey) return storageKey;

    const phoneStorageId = createPhoneStorageId(phone);
    return `fawri_otp_resend_until_${purpose}_${phoneStorageId}`;
  }, [phone, purpose, storageKey]);

  const startCountdown = (seconds: number) => {
    const safeSeconds = clampSeconds(seconds);
    const resendAt = Date.now() + safeSeconds * 1000;

    setRetryAfterSeconds(safeSeconds);

    if (safeSeconds > 0) {
      sessionStorage.setItem(resolvedStorageKey, String(resendAt));
    } else {
      sessionStorage.removeItem(resolvedStorageKey);
    }
  };

  useEffect(() => {
    const storedResendAt = Number(sessionStorage.getItem(resolvedStorageKey) || 0);
    const storedRemaining = Math.max(
      0,
      Math.ceil((storedResendAt - Date.now()) / 1000)
    );
    const initialRemaining = clampSeconds(initialRetryAfterSeconds);

    startCountdown(Math.max(storedRemaining, initialRemaining));
  }, [initialRetryAfterSeconds, resolvedStorageKey]);

  useEffect(() => {
    if (retryAfterSeconds <= 0) return;

    const timer = window.setTimeout(() => {
      setRetryAfterSeconds(current => {
        const next = Math.max(0, current - 1);
        if (next === 0) {
          sessionStorage.removeItem(resolvedStorageKey);
        }
        return next;
      });
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [retryAfterSeconds, resolvedStorageKey]);

  const handleResend = async () => {
    const requiresDeviceRecord = purpose === 'admin_device_verification';
    if (
      isResending ||
      retryAfterSeconds > 0 ||
      !phone.trim() ||
      (requiresDeviceRecord && !deviceRecordId)
    ) {
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch(
        requiresDeviceRecord
          ? '/api/auth/admin/device-otp/resend'
          : '/api/auth/otp/resend',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            requiresDeviceRecord
              ? {
                  phone: phone.trim(),
                  device_record_id: deviceRecordId,
                }
              : {
                  phone: phone.trim(),
                  purpose,
                },
          ),
        },
      );

      const result = (await response.json().catch(() => null)) as ResendResponse | null;
      const serverRetryAfter = clampSeconds(result?.retry_after_seconds);

      if (!response.ok || !result?.ok) {
        if (serverRetryAfter > 0) {
          startCountdown(serverRetryAfter);
        }

        toast.error(result?.error || t.forgot_error_generic);
        return;
      }

      const challengeId = String(result.challenge_id || '').trim();
      if (!challengeId) {
        onChallengeUnavailable?.();
        toast.error(t.forgot_error_generic);
        return;
      }

      startCountdown(serverRetryAfter);
      toast.success(t.forgot_code_sent);
      onResent?.({
        challengeId,
        expiresAt: String(result.expires_at || '').trim(),
        retryAfterSeconds: serverRetryAfter,
        devCode: previewDevCode(result.devCode),
      });
    } catch (error) {
      console.error('OTP resend failed:', error);
      toast.error(t.forgot_error_connection);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="rounded-2xl border bg-muted/30 px-4 py-3 text-center">
      <p className="text-sm font-medium text-foreground">
        {t.otp_resend_prompt}
      </p>

      {retryAfterSeconds > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t.otp_resend_wait}{' '}
          <span dir="ltr" className="font-bold tabular-nums text-foreground">
            {formatCountdown(retryAfterSeconds)}
          </span>
        </p>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={
            isResending ||
            !phone.trim() ||
            (purpose === 'admin_device_verification' && !deviceRecordId)
          }
          className="mt-1 rounded-lg px-2 py-1 text-sm font-bold text-orange-600 transition hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
        >
          {isResending ? t.forgot_sending : t.otp_resend_action}
        </button>
      )}
    </div>
  );
}
