import crypto from "node:crypto";
import type { AccountKind } from "./authPolicy";
import { AuthSecurityDataStore } from "./authSecurityDataStore";
import { AuthSecurityStoreError, MAX_TRUSTED_DEVICES_PER_ACCOUNT, type TrustedDeviceRecord } from "./authSecurityTypes";

export class AuthDeviceSecurity {
  constructor(private readonly db: AuthSecurityDataStore) {}
  register(input: { accountId: string; accountKind: AccountKind; deviceId: string; deviceLabel: string }): TrustedDeviceRecord {
    const data = this.db.read(), at = new Date(this.db.now()).toISOString();
    const hash = this.db.fingerprint("device", input.deviceId);
    let device = data.devices.find((x) => x.account_id === input.accountId && x.account_kind === input.accountKind && x.device_hash === hash);
    if (!device) {
      device = { id: crypto.randomUUID(), account_id: input.accountId, account_kind: input.accountKind, device_hash: hash, label: clean(input.deviceLabel), status: "pending", created_at: at, last_seen_at: at };
      data.devices.push(device);
    } else {
      device.last_seen_at = at; device.label = clean(input.deviceLabel) || device.label;
      if (device.status === "revoked") device.status = "pending";
    }
    this.db.write(data); return device;
  }
  trusted(accountId: string, kind: AccountKind, deviceId: string): boolean {
    const hash = this.db.fingerprint("device", deviceId);
    return this.db.read().devices.some((x) => x.account_id === accountId && x.account_kind === kind && x.device_hash === hash && x.status === "trusted");
  }
  setTrust(input: { deviceRecordId: string; trusted: boolean; actorAccountId: string }): TrustedDeviceRecord | null {
    const data = this.db.read(), device = data.devices.find((x) => x.id === input.deviceRecordId); if (!device) return null;
    if (input.trusted) {
      const count = data.devices.filter((x) => x.account_id === device.account_id && x.account_kind === device.account_kind && x.status === "trusted" && x.id !== device.id).length;
      if (count >= MAX_TRUSTED_DEVICES_PER_ACCOUNT) throw new AuthSecurityStoreError("TRUSTED_DEVICE_LIMIT_REACHED", "trusted device limit reached");
      device.status = "trusted"; device.trusted_at = new Date(this.db.now()).toISOString(); device.trusted_by = input.actorAccountId; delete device.revoked_at;
    } else {
      device.status = "revoked"; device.revoked_at = new Date(this.db.now()).toISOString();
      for (const session of data.sessions) if (!session.revoked_at && session.account_id === device.account_id && session.account_kind === device.account_kind && session.device_hash === device.device_hash) {
        session.revoked_at = device.revoked_at; session.revoked_reason = "device_revoked";
      }
    }
    this.db.write(data); return device;
  }
  list(accountId?: string): TrustedDeviceRecord[] {
    return this.db.read().devices.filter((x) => !accountId || x.account_id === accountId).map((x) => ({ ...x }));
  }
}
function clean(value: string): string { return String(value || "Unknown device").trim().replace(/\s+/g, " ").slice(0, 120); }
