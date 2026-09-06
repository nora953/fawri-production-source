const ADAPTIVE_IDENTIFIER_SELECTOR = [
  'input.font-mono',
  'input[type="text"][inputmode="numeric"]',
].join(', ');

const MIN_IDENTIFIER_FONT_PX = 8.5;
const MIN_MONO_IDENTIFIER_FONT_PX = 5.75;
const IDENTIFIER_SAFETY_INSET_PX = 10;
const MONO_IDENTIFIER_SAFETY_INSET_PX = 8;
const MONO_IDENTIFIER_SIDE_PADDING_PX = 5;
const baseFontSizes = new WeakMap<HTMLInputElement, number>();
let measurementCanvas: HTMLCanvasElement | null = null;

function numericCssValue(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textWidthAtBaseSize(input: HTMLInputElement, text: string, baseSize: number): number {
  measurementCanvas ||= document.createElement('canvas');
  const context = measurementCanvas.getContext('2d');
  if (!context) return 0;

  const style = getComputedStyle(input);
  context.font = `${style.fontStyle} ${style.fontWeight} ${baseSize}px ${style.fontFamily}`;
  const measured = context.measureText(text).width;
  const letterSpacing = style.letterSpacing === 'normal' ? 0 : numericCssValue(style.letterSpacing);
  return measured + Math.max(0, text.length - 1) * letterSpacing;
}

function resetAdaptiveIdentifierStyles(input: HTMLInputElement) {
  input.style.removeProperty('font-size');
  input.style.removeProperty('padding-inline');
  input.style.removeProperty('letter-spacing');
}

function fitIdentifierInput(input: HTMLInputElement) {
  if (!input.isConnected || !input.matches(ADAPTIVE_IDENTIFIER_SELECTOR)) return;

  let baseSize = baseFontSizes.get(input);
  if (!baseSize) {
    resetAdaptiveIdentifierStyles(input);
    baseSize = numericCssValue(getComputedStyle(input).fontSize) || 14;
    baseFontSizes.set(input, baseSize);
  }

  const text = input.value || input.placeholder || '';
  resetAdaptiveIdentifierStyles(input);
  if (!text) return;

  const style = getComputedStyle(input);
  const isMonoIdentifier = input.matches('input.font-mono');
  const normalAvailableWidth = Math.max(
    1,
    input.clientWidth
      - numericCssValue(style.paddingLeft)
      - numericCssValue(style.paddingRight)
      - IDENTIFIER_SAFETY_INSET_PX,
  );
  const measuredWidth = textWidthAtBaseSize(input, text, baseSize);

  if (!measuredWidth || measuredWidth <= normalAvailableWidth) return;

  /* Long SKUs are business identifiers, so showing the whole value is more
   * important than preserving the default font size. Keep the field/table
   * geometry unchanged, reclaim only a few pixels of inner padding, and scale
   * the monospace text until both ends remain visibly inside the control. */
  if (isMonoIdentifier) {
    const compactAvailableWidth = Math.max(
      1,
      input.clientWidth
        - (MONO_IDENTIFIER_SIDE_PADDING_PX * 2)
        - MONO_IDENTIFIER_SAFETY_INSET_PX,
    );
    const fittedSize = Math.max(
      MIN_MONO_IDENTIFIER_FONT_PX,
      baseSize * (compactAvailableWidth / measuredWidth),
    );

    input.style.setProperty('padding-inline', `${MONO_IDENTIFIER_SIDE_PADDING_PX}px`, 'important');
    if (text.length >= 24) input.style.setProperty('letter-spacing', '-0.025em', 'important');
    input.style.setProperty('font-size', `${fittedSize.toFixed(2)}px`, 'important');
    return;
  }

  const fittedSize = Math.max(MIN_IDENTIFIER_FONT_PX, baseSize * (normalAvailableWidth / measuredWidth));
  input.style.setProperty('font-size', `${fittedSize.toFixed(2)}px`, 'important');
}

function fitAllIdentifierInputs(root: ParentNode = document) {
  root.querySelectorAll<HTMLInputElement>(ADAPTIVE_IDENTIFIER_SELECTOR).forEach(fitIdentifierInput);
}

export function installAdaptiveIdentifierInputs() {
  if (typeof document === 'undefined') return;

  const scheduleAll = () => requestAnimationFrame(() => fitAllIdentifierInputs());

  document.addEventListener('input', event => {
    if (event.target instanceof HTMLInputElement && event.target.matches(ADAPTIVE_IDENTIFIER_SELECTOR)) {
      requestAnimationFrame(() => fitIdentifierInput(event.target as HTMLInputElement));
    }
  }, true);

  document.addEventListener('focusin', event => {
    if (event.target instanceof HTMLInputElement && event.target.matches(ADAPTIVE_IDENTIFIER_SELECTOR)) {
      fitIdentifierInput(event.target);
    }
  }, true);

  /* Editor buttons can generate or copy identifiers programmatically without
   * dispatching a native input event. Re-fit after those React updates land. */
  document.addEventListener('click', () => {
    requestAnimationFrame(() => requestAnimationFrame(() => fitAllIdentifierInputs()));
  }, true);

  const observer = new MutationObserver(records => {
    let needsScan = false;
    for (const record of records) {
      if (record.type === 'childList' && record.addedNodes.length > 0) {
        needsScan = true;
        break;
      }
      if (record.type === 'attributes' && record.target instanceof HTMLInputElement) {
        fitIdentifierInput(record.target);
      }
    }
    if (needsScan) scheduleAll();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'class', 'inputmode', 'type'],
  });

  window.addEventListener('resize', scheduleAll, { passive: true });

  /* Font metrics can change after the initial render. Re-measure once the actual
   * language font has loaded so Arabic/Kurdish and English identifiers receive
   * the same visible edge clearance instead of fitting against fallback-font
   * measurements. */
  if ('fonts' in document) {
    void document.fonts.ready.then(scheduleAll);
    document.fonts.addEventListener('loadingdone', scheduleAll);
  }

  scheduleAll();
}
