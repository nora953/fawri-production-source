const ADAPTIVE_IDENTIFIER_SELECTOR = [
  'input.font-mono',
  'input[type="text"][inputmode="numeric"]',
].join(', ');

const MIN_IDENTIFIER_FONT_PX = 8.5;
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

function fitIdentifierInput(input: HTMLInputElement) {
  if (!input.isConnected || !input.matches(ADAPTIVE_IDENTIFIER_SELECTOR)) return;

  let baseSize = baseFontSizes.get(input);
  if (!baseSize) {
    input.style.removeProperty('font-size');
    baseSize = numericCssValue(getComputedStyle(input).fontSize) || 14;
    baseFontSizes.set(input, baseSize);
  }

  const text = input.value || input.placeholder || '';
  if (!text) {
    input.style.removeProperty('font-size');
    return;
  }

  const style = getComputedStyle(input);
  const availableWidth = Math.max(
    1,
    input.clientWidth
      - numericCssValue(style.paddingLeft)
      - numericCssValue(style.paddingRight)
      - 4,
  );
  const measuredWidth = textWidthAtBaseSize(input, text, baseSize);

  if (!measuredWidth || measuredWidth <= availableWidth) {
    input.style.removeProperty('font-size');
    return;
  }

  const fittedSize = Math.max(MIN_IDENTIFIER_FONT_PX, baseSize * (availableWidth / measuredWidth));
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
  scheduleAll();
}
