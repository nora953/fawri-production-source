export type CashierScannerBuffer = {
  value: string;
  started_at_ms: number;
  last_at_ms: number;
  gaps_ms: number[];
};

const MAX_INTER_KEY_GAP_MS = 90;
const MAX_AVERAGE_GAP_MS = 65;
const MAX_TOTAL_DURATION_MS = 900;
const MIN_SCAN_LENGTH = 4;
const MAX_SCAN_LENGTH = 160;

export function emptyCashierScannerBuffer(): CashierScannerBuffer {
  return { value: '', started_at_ms: 0, last_at_ms: 0, gaps_ms: [] };
}

export function appendCashierScannerKey(
  current: CashierScannerBuffer,
  key: string,
  atMs: number,
): CashierScannerBuffer {
  const printable = typeof key === 'string' && key.length === 1 && key >= ' ';
  if (!printable || !Number.isFinite(atMs)) return current;

  const gap = current.last_at_ms > 0 ? atMs - current.last_at_ms : 0;
  const shouldRestart =
    !current.value ||
    gap < 0 ||
    gap > MAX_INTER_KEY_GAP_MS ||
    current.value.length >= MAX_SCAN_LENGTH;

  if (shouldRestart) {
    return {
      value: key,
      started_at_ms: atMs,
      last_at_ms: atMs,
      gaps_ms: [],
    };
  }

  return {
    value: `${current.value}${key}`,
    started_at_ms: current.started_at_ms,
    last_at_ms: atMs,
    gaps_ms: [...current.gaps_ms, gap],
  };
}

export function completeCashierScannerBuffer(
  current: CashierScannerBuffer,
  atMs: number,
): string | null {
  const value = current.value.trim();
  if (value.length < MIN_SCAN_LENGTH || value.length > MAX_SCAN_LENGTH) return null;
  if (!Number.isFinite(atMs) || current.started_at_ms <= 0) return null;

  const totalDuration = atMs - current.started_at_ms;
  if (totalDuration < 0 || totalDuration > MAX_TOTAL_DURATION_MS) return null;

  const averageGap = current.gaps_ms.length > 0
    ? current.gaps_ms.reduce((total, gap) => total + gap, 0) / current.gaps_ms.length
    : totalDuration;
  if (!Number.isFinite(averageGap) || averageGap > MAX_AVERAGE_GAP_MS) return null;

  return value;
}

export function isCashierScannerTerminator(key: string): boolean {
  return key === 'Enter' || key === 'Tab';
}
