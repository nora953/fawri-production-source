import { CASHIER_POS_ENHANCEMENT_COPY } from './cashierPosEnhancementCopy';
import { readStoredCashierLanguage } from './cashierUiCopy';

function checkoutButton(): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null;
  const label = CASHIER_POS_ENHANCEMENT_COPY[readStoredCashierLanguage()].checkout;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  return buttons.find(button =>
    !button.disabled &&
    button.textContent?.trim() === label &&
    !button.closest('[data-cashier-checkout="open"]'),
  ) || null;
}

export function installCashierFastCheckoutKeyboard(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (
      event.key !== 'F8' ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }
    if (document.documentElement.dataset.cashierView !== 'pos') return;
    if (document.querySelector('[data-cashier-checkout="open"]')) return;

    const button = checkoutButton();
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    button.click();
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => window.removeEventListener('keydown', handleKeyDown, true);
}
