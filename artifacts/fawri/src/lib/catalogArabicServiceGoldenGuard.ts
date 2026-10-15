const ARABIC_SERVICE_AVAILABILITY_TITLE = 'متاح للطلب';
const ARABIC_SERVICE_AVAILABILITY_HINT = 'حدد ما إذا كانت هذه الخدمة متاحة حاليًا للعملاء.';
const ARABIC_SERVICE_BOOKING_TITLE = 'تحتاج إلى حجز';

function directSwitchCard(root: Element): HTMLElement | null {
  for (const child of Array.from(root.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.querySelector(':scope > button[role="switch"]')) return child;
  }
  return null;
}

function syncArabicServiceGoldenText(): void {
  if (typeof document === 'undefined' || document.documentElement.lang !== 'ar') return;

  const grid = document.querySelector('.catalog-editor-body-grid');
  if (!grid) return;

  const serviceDetails = grid.querySelector<HTMLElement>('[data-catalog-service-details="true"]');
  if (!serviceDetails) return;

  const bookingCard = directSwitchCard(serviceDetails);
  const bookingTitle = bookingCard?.querySelector<HTMLElement>(':scope > div > p:first-child');
  if (bookingTitle && bookingTitle.textContent !== ARABIC_SERVICE_BOOKING_TITLE) {
    bookingTitle.textContent = ARABIC_SERVICE_BOOKING_TITLE;
  }

  const availabilityCard = directSwitchCard(grid);
  const availabilityText = availabilityCard?.querySelectorAll<HTMLElement>(':scope > div > p');
  const availabilityTitle = availabilityText?.item(0);
  const availabilityHint = availabilityText?.item(1);

  if (availabilityTitle && availabilityTitle.textContent !== ARABIC_SERVICE_AVAILABILITY_TITLE) {
    availabilityTitle.textContent = ARABIC_SERVICE_AVAILABILITY_TITLE;
  }
  if (availabilityHint && availabilityHint.textContent !== ARABIC_SERVICE_AVAILABILITY_HINT) {
    availabilityHint.textContent = ARABIC_SERVICE_AVAILABILITY_HINT;
  }
}

export function installCatalogArabicServiceGoldenGuard(): void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;

  const observer = new MutationObserver(() => syncArabicServiceGoldenText());
  const start = () => {
    syncArabicServiceGoldenText();
    if (!document.body) return;
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

export const CATALOG_ARABIC_SERVICE_GOLDEN_TEXT = Object.freeze({
  availabilityTitle: ARABIC_SERVICE_AVAILABILITY_TITLE,
  availabilityHint: ARABIC_SERVICE_AVAILABILITY_HINT,
  bookingTitle: ARABIC_SERVICE_BOOKING_TITLE,
});
