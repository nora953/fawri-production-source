import type { CashierCommitSaleResult } from './cashierLocalContracts';

export class CashierSaleCommitSingleFlight {
  private readonly flights = new Map<string, Promise<CashierCommitSaleResult>>();

  run(
    key: string,
    task: () => Promise<CashierCommitSaleResult>,
  ): Promise<CashierCommitSaleResult> {
    const normalized = String(key || '').normalize('NFKC').trim();
    if (!normalized) {
      return Promise.reject(new Error('CASHIER_SALE_COMMIT_KEY_REQUIRED'));
    }

    const existing = this.flights.get(normalized);
    if (existing) return existing;

    const flight = Promise.resolve().then(task);
    this.flights.set(normalized, flight);

    void flight.finally(() => {
      if (this.flights.get(normalized) === flight) {
        this.flights.delete(normalized);
      }
    }).catch(() => undefined);

    return flight;
  }
}

export const cashierSaleCommitSingleFlight = new CashierSaleCommitSingleFlight();
