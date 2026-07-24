import { normalizePhoneNumber, validatePassword } from './validators';
type PasswordResetResult = {
  ok: boolean;
  error?: string;
  message?: string;
  devCode?: string;
  retry_after_seconds?: number;
};

async function readApiResult(response: Response): Promise<PasswordResetResult> {
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    return {
      ok: false,
      error: result?.error || 'تعذر تنفيذ العملية',
    };
  }

  return {
    ok: true,
    message: result.message,
    devCode: result.devCode,
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

    return await readApiResult(response);
  } catch (error) {
    console.error('Password reset request failed:', error);
    return { ok: false, error: 'تعذر الاتصال بالسيرفر' };
  }
}

export async function resetPasswordWithOtp(
  phone: string,
  code: string,
  newPassword: string,
  confirmPassword: string
): Promise<PasswordResetResult> {
  const cleanPhone = normalizePhoneNumber(phone);
  const cleanCode = code.trim();

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
        code: cleanCode,
        newPassword,
        confirmPassword,
      }),
    });

    return await readApiResult(response);
  } catch (error) {
    console.error('Password reset confirm failed:', error);
    return { ok: false, error: 'تعذر الاتصال بالسيرفر' };
  }
}
