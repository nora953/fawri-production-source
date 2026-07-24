import { validatePassword } from '@/lib/validators';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';type ChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
  phone: string;
};

export default function ChangePasswordModal({ open, onClose, phone }: ChangePasswordModalProps) {
  const { t, lang, isRTL } = useI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const closeModal = () => {
    if (isLoading) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  const handleSave = async () => {
    if (!currentPassword.trim()) {
      toast.error(t.change_password_modal_current_required);
      return;
    }

    if (!validatePassword(newPassword)) {
      toast.error(t.change_password_modal_password_rules);
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t.change_password_modal_passwords_do_not_match);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, currentPassword, newPassword, confirmPassword }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        toast.error(t.change_password_modal_server_error);
        return;
      }

      toast.success(t.change_password_modal_success);
      closeModal();
    } catch (error) {
      console.error(error);
      toast.error(t.change_password_modal_error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 py-8 backdrop-blur-sm" dir={isRTL ? 'rtl' : 'ltr'}>
      <button type="button" className="absolute inset-0 cursor-default" onClick={closeModal} aria-label={t.change_password_modal_close} />

      <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-3xl border bg-background p-5 shadow-2xl">
        <div className="mb-5 text-center">
          <h2 className="text-2xl font-extrabold text-foreground">{t.change_password_modal_title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t.change_password_modal_desc}</p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-password">{t.change_password_modal_current_password}</Label>
            <PasswordInput
              id="current-password"
              value={currentPassword}
              onChange={event => setCurrentPassword(event.target.value)}
              className="h-12 rounded-2xl text-left"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">{t.change_password_modal_new_password}</Label>
            <PasswordInput
              id="new-password"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              className="h-12 rounded-2xl text-left"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-new-password">{t.change_password_modal_confirm_password}</Label>
            <PasswordInput
              id="confirm-new-password"
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              className="h-12 rounded-2xl text-left"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button type="button" variant="outline" className="h-12 rounded-2xl font-bold" onClick={closeModal} disabled={isLoading}>
            {t.change_password_modal_cancel}
          </Button>

          <Button type="button" className="h-12 rounded-2xl bg-orange-500 font-extrabold text-white hover:bg-orange-600" onClick={handleSave} disabled={isLoading}>
            {isLoading ? t.change_password_modal_saving : t.change_password_modal_save_password}
          </Button>
        </div>
      </div>
    </div>
  );
}
