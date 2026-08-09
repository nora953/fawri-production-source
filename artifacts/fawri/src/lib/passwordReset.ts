import { normalizePhoneNumber, validatePassword } from './validators';

export type PasswordResetResult = {
  ok: boolean;
  code?: string;
  error?: string;
  message?: string;
  challenge_id?: string;
  expires_at?: string;
  retry_after_seconds?: number;
};

async function readApiResult(response: Response): Promise<PasswordResetResult> {
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    return {
      ok: false,
      code: result?.code,
      error: result?.error || 'تعذر تنفيذ العملية',
      retry_after_seconds: result?.retry_after_seconds,
    };
  }

  return {
    ok: true,
    message: result.message,
    challenge_id: String(result.challenge_id || '').trim() || undefined,
    expires_at: String(result.expires_at || '').trim() || undefined,
    retry_after_seconds: result.retry_after_seconds,
  };
}

export async function requestPasswordReset(phone: string): Promise<PasswordResetResult> {
  const cleanPhone = normalizePhoneNumber(phone);

  if (!cleanPhone) {
    return { ok: false, error: 'اكتب رقم الهاتف' };
  }

  try {
    const response = await fetch('/api/auth/password-reset/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone }),
    });

    const result = await readApiResult(response);
    if (!result.ok) return result;

    if (!result.challenge_id) {
      return {
        ok: false,
        code: 'RECOVERY_CHALLENGE_MISSING',
        error: 'تعذر تنفيذ العملية',
      };
    }

    return result;
  } catch (error) {
    console.error('Password reset request failed:', error);
    return { ok: false, error: 'تعذر الاتصال بالسيرفر' };
  }
}

export async function resetPasswordWithOtp(
  challengeId: string,
  phone: string,
  code: string,
  newPassword: string,
  confirmPassword: string
): Promise<PasswordResetResult> {
  const cleanChallengeId = challengeId.trim();
  const cleanPhone = normalizePhoneNumber(phone);
  const cleanCode = code.trim();

  if (!cleanChallengeId) {
    return { ok: false, code: 'RECOVERY_CHALLENGE_MISSING', error: 'تعذر تنفيذ العملية' };
  }

  if (!cleanPhone) {
    return { ok: false, error: 'اكتب رقم الهاتف' };
  }

  if (!cleanCode) {
    return { ok: false, error: 'اكتب رمز التحقق' };
  }

  if (!validatePassword(newPassword)) {
    return { ok: false, error: 'كلمة المرور يجب أن تكون 8 خانات على الأقل، وتحتوي على رقم وحرف إنجليزي كبير، وتستخدم الإنجليزية فقط مع الرموز المسموحة (@ # $ % & ! _ -)' };
  }

  if (newPassword !== confirmPassword) {
    return { ok: false, error: 'كلمتا المرور غير متطابقتين' };
  }

  try {
    const response = await fetch('/api/auth/password-reset/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        challenge_id: cleanChallengeId,
        code: cleanCode,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });

    return await readApiResult(response);
  } catch (error) {
    console.error('Password reset confirm failed:', error);
    return { ok: false, error: 'تعذر الاتصال بالسيرفر' };
  }
}
