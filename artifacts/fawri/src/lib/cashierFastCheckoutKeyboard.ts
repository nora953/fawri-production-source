import { CASHIER_POS_ENHANCEMENT_COPY } from './cashierPosEnhancementCopy';
import { CASHIER_RECEIPT_COPY } from './cashierReceiptPrinting';
import { readStoredCashierLanguage } from './cashierUiCopy';

const CASHIER_FAST_CHECKOUT_KEY = 'F8';
const CASHIER_RECEIPT_PRINT_KEY = 'F9';
const CASHIER_CART_UNDO_KEY = 'Delete';
const CASHIER_DECREMENT_LABEL = '−';

function checkoutIsOpen(): boolean {
  return Boolean(document.querySelector('[data-cashier-checkout="open"]'));
}

function cashierPosIsActive(): boolean {
  return document.documentElement.dataset.cashierView === 'pos';
}

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

function receiptPrintButton(): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null;
  const label = CASHIER_RECEIPT_COPY[readStoredCashierLanguage()].printReceipt;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  return buttons.find(button =>
    !button.disabled &&
    button.textContent?.includes(label),
  ) || null;
}

function activeCartDecrementButton(): HTMLButtonElement | null {
  if (typeof document === 'undefined') return null;
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('aside button'));
  return buttons.find(button =>
    !button.disabled &&
    button.textContent?.trim() === CASHIER_DECREMENT_LABEL &&
    Boolean(button.nextElementSibling?.matches('span')),
  ) || null;
}

function normalizeLocalizedDigits(value: string): string {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩';
  const easternArabic = '۰۱۲۳۴۵۶۷۸۹';
  return value
    .split('')
    .map(character => {
      const arabicIndex = arabicIndic.indexOf(character);
      if (arabicIndex >= 0) return String(arabicIndex);
      const easternIndex = easternArabic.indexOf(character);
      if (easternIndex >= 0) return String(easternIndex);
      return character;
    })
    .join('');
}

function activeCartQuantity(button: HTMLButtonElement): number | null {
  const text = normalizeLocalizedDigits(button.nextElementSibling?.textContent || '').trim();
  if (!/^\d+$/.test(text)) return null;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
}

function editableTargetOwnsDelete(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;

  const type = (target.type || 'text').toLowerCase();
  const textLike = new Set([
    'text',
    'search',
    'number',
    'tel',
    'url',
    'email',
    'password',
  ]);
  if (!textLike.has(type)) return true;

  // The POS search field normally owns focus. When it is empty, Delete can safely
  // act as the cart undo key; once the cashier has typed, normal text editing wins.
  return target.value.length > 0;
}

function nextRender(): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, 0));
}

async function removeWholeActiveCartLine(initialButton: HTMLButtonElement): Promise<void> {
  const quantity = activeCartQuantity(initialButton);
  if (!quantity) return;

  // Capture the original quantity and execute exactly that many decrements. The
  // final click removes the active line; the fixed iteration count prevents the
  // shortcut from spilling into whichever line React activates next.
  for (let index = 0; index < quantity; index += 1) {
    const button = index === 0 ? initialButton : activeCartDecrementButton();
    if (!button) return;
    button.click();
    if (index + 1 < quantity) await nextRender();
  }
}

export function installCashierFastCheckoutKeyboard(): () => void {
  if (typeof window === 'undefined') return () => undefined;

  let wholeLineRemovalRunning = false;

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!cashierPosIsActive()) return;

    // Ctrl/Cmd+P belongs to the browser and would print the whole POS page.
    // Block it inside the cashier surface so operators use F9 for the receipt.
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'p'
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.defaultPrevented ||
      wholeLineRemovalRunning ||
      checkoutIsOpen()
    ) {
      return;
    }

    if (event.key === CASHIER_FAST_CHECKOUT_KEY && !event.shiftKey) {
      const button = checkoutButton();
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      button.click();
      return;
    }

    if (event.key === CASHIER_RECEIPT_PRINT_KEY && !event.shiftKey) {
      const button = receiptPrintButton();
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();
      button.click();
      return;
    }

    if (event.key !== CASHIER_CART_UNDO_KEY || editableTargetOwnsDelete(event.target)) {
      return;
    }

    const button = activeCartDecrementButton();
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    if (!event.shiftKey) {
      button.click();
      return;
    }

    wholeLineRemovalRunning = true;
    void removeWholeActiveCartLine(button).finally(() => {
      wholeLineRemovalRunning = false;
    });
  };

  window.addEventListener('keydown', handleKeyDown, true);
  return () => window.removeEventListener('keydown', handleKeyDown, true);
}