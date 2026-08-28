import { readFile, writeFile } from 'node:fs/promises';

const changes = [];

async function edit(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`${path}: transform made no change`);
  await writeFile(path, next);
  changes.push(path);
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected source is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

await edit('artifacts/api-server/src/services/postgresCashierStaffAuthority.ts', (source) => {
  source = replaceOnce(
    source,
    `  offline_inventory_authority: boolean;\n  credential_version: number;\n  paired_at?: string;`,
    `  offline_inventory_authority: boolean;\n  configuration_etag: string;\n  credential_version: number;\n  paired_at?: string;`,
    'station view configuration etag type',
  );

  source = replaceOnce(
    source,
    `function hashSecret(value: string): string {\n  return crypto.createHash("sha256").update(value, "utf8").digest("hex");\n}\n\nfunction randomId`,
    `function hashSecret(value: string): string {\n  return crypto.createHash("sha256").update(value, "utf8").digest("hex");\n}\n\nfunction configurationEtag(value: unknown): string {\n  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();\n  if (!/^[a-f0-9]{64}$/.test(normalized)) {\n    throw new CashierStaffAuthorityError(\n      "CASHIER_STAFF_INPUT_INVALID",\n      "expected_configuration_etag is invalid",\n      400,\n      { field: "expected_configuration_etag" },\n    );\n  }\n  return normalized;\n}\n\nfunction cashierStationConfigurationEtag(row: StationRow): string {\n  return crypto\n    .createHash("sha256")\n    .update(\n      JSON.stringify([\n        row.name,\n        row.branch_key,\n        row.branch_label ?? null,\n        row.status,\n        Boolean(row.offline_inventory_authority),\n      ]),\n      "utf8",\n    )\n    .digest("hex");\n}\n\nfunction randomId`,
    'station configuration etag helpers',
  );

  source = replaceOnce(
    source,
    `    offline_inventory_authority: Boolean(row.offline_inventory_authority),\n    credential_version: Number(row.credential_version),`,
    `    offline_inventory_authority: Boolean(row.offline_inventory_authority),\n    configuration_etag: cashierStationConfigurationEtag(row),\n    credential_version: Number(row.credential_version),`,
    'station view etag projection',
  );

  source = replaceOnce(
    source,
    `export async function updateCashierStationAuthoritative(input: {\n  merchantId: unknown;\n  stationId: unknown;\n  name?: unknown;`,
    `export async function updateCashierStationAuthoritative(input: {\n  merchantId: unknown;\n  stationId: unknown;\n  expectedConfigurationEtag: unknown;\n  name?: unknown;`,
    'station update expected etag input',
  );

  source = replaceOnce(
    source,
    `  const merchantId = identifier(input.merchantId, "merchant_id");\n  const stationId = identifier(input.stationId, "station_id");\n  const name =`,
    `  const merchantId = identifier(input.merchantId, "merchant_id");\n  const stationId = identifier(input.stationId, "station_id");\n  const expectedConfigurationEtag = configurationEtag(\n    input.expectedConfigurationEtag,\n  );\n  const name =`,
    'station update etag normalization',
  );

  source = replaceOnce(
    source,
    `    if (current.status === "revoked") {\n      throw new CashierStaffAuthorityError(\n        "CASHIER_STATION_REVOKED",\n        "revoked cashier stations cannot be restored",\n        409,\n      );\n    }\n\n    const values: unknown[] = [merchantId, stationId];`,
    `    if (current.status === "revoked") {\n      throw new CashierStaffAuthorityError(\n        "CASHIER_STATION_REVOKED",\n        "revoked cashier stations cannot be restored",\n        409,\n      );\n    }\n    const currentEtag = cashierStationConfigurationEtag(current);\n    if (currentEtag !== expectedConfigurationEtag) {\n      throw new CashierStaffAuthorityError(\n        "CASHIER_STATION_VERSION_CONFLICT",\n        "cashier station configuration changed before this update",\n        409,\n        { current_configuration_etag: currentEtag },\n      );\n    }\n\n    const values: unknown[] = [merchantId, stationId];`,
    'station update optimistic conflict guard',
  );

  return source;
});

await edit('artifacts/api-server/src/routes/cashier-staff-operations.ts', (source) =>
  replaceOnce(
    source,
    `        merchantId: merchantId(res),\n        stationId: req.params.stationId,\n        name: req.body?.name,`,
    `        merchantId: merchantId(res),\n        stationId: req.params.stationId,\n        expectedConfigurationEtag: req.body?.expected_configuration_etag,\n        name: req.body?.name,`,
    'station route expected configuration etag',
  ),
);

await edit('artifacts/fawri/src/pages/dashboard/CashierManagementPage.tsx', (source) => {
  source = replaceOnce(
    source,
    `  offline_inventory_authority: boolean;\n  credential_version: number;\n};`,
    `  offline_inventory_authority: boolean;\n  configuration_etag: string;\n  credential_version: number;\n};`,
    'dashboard station etag type',
  );

  source = replaceOnce(
    source,
    `offlineBadge: 'مخزون متاح دون اتصال', saveStation: 'إضافة المحطة', paired: 'مربوطة', notPaired: 'غير مربوطة', pair: 'إنشاء رمز ربط',`,
    `offlineBadge: 'مخزون متاح دون اتصال', saveStation: 'إضافة المحطة', editStation: 'تعديل المحطة', paired: 'مربوطة', notPaired: 'غير مربوطة', pair: 'إنشاء رمز ربط',`,
    'arabic station edit copy',
  );
  source = replaceOnce(
    source,
    `versionConflict: 'تم تعديل بيانات الموظف في مكان آخر. حدّث الصفحة ثم أعد المحاولة.', offlineConflict: 'هناك محطة أخرى في هذا الفرع تملك صلاحية بيع المخزون أثناء انقطاع الإنترنت.',`,
    `versionConflict: 'تم تعديل بيانات الموظف في مكان آخر. حدّث الصفحة ثم أعد المحاولة.', stationVersionConflict: 'تم تعديل إعدادات المحطة في مكان آخر. حدّث الصفحة ثم أعد المحاولة.', offlineConflict: 'هناك محطة أخرى في هذا الفرع تملك صلاحية بيع المخزون أثناء انقطاع الإنترنت.',`,
    'arabic station conflict copy',
  );
  source = replaceOnce(
    source,
    `offlineBadge: 'فرۆشتنی کۆگا بەبێ ئینتەرنێت', saveStation: 'زیادکردنی وێستگە', paired: 'بەستراوە', notPaired: 'نەبەستراوە', pair: 'دروستکردنی کۆدی بەستنەوە',`,
    `offlineBadge: 'فرۆشتنی کۆگا بەبێ ئینتەرنێت', saveStation: 'زیادکردنی وێستگە', editStation: 'دەستکاری وێستگە', paired: 'بەستراوە', notPaired: 'نەبەستراوە', pair: 'دروستکردنی کۆدی بەستنەوە',`,
    'kurdish station edit copy',
  );
  source = replaceOnce(
    source,
    `versionConflict: 'زانیاری کارمەند لە شوێنێکی تر گۆڕدراوە. پەڕەکە نوێ بکەرەوە.', offlineConflict: 'وێستگەیەکی تر لەم لقە ئەم دەسەڵاتەی هەیە.',`,
    `versionConflict: 'زانیاری کارمەند لە شوێنێکی تر گۆڕدراوە. پەڕەکە نوێ بکەرەوە.', stationVersionConflict: 'ڕێکخستنەکانی وێستگە لە شوێنێکی تر گۆڕدراون. پەڕەکە نوێ بکەرەوە.', offlineConflict: 'وێستگەیەکی تر لەم لقە ئەم دەسەڵاتەی هەیە.',`,
    'kurdish station conflict copy',
  );
  source = replaceOnce(
    source,
    `offlineBadge: 'Offline inventory enabled', saveStation: 'Add station', paired: 'Paired', notPaired: 'Not paired', pair: 'Create pairing code',`,
    `offlineBadge: 'Offline inventory enabled', saveStation: 'Add station', editStation: 'Edit station', paired: 'Paired', notPaired: 'Not paired', pair: 'Create pairing code',`,
    'english station edit copy',
  );
  source = replaceOnce(
    source,
    `versionConflict: 'This employee changed elsewhere. Refresh the page and retry.', offlineConflict: 'Another station in this branch already owns offline inventory authority.',`,
    `versionConflict: 'This employee changed elsewhere. Refresh the page and retry.', stationVersionConflict: 'This station changed elsewhere. Refresh the page and retry.', offlineConflict: 'Another station in this branch already owns offline inventory authority.',`,
    'english station conflict copy',
  );

  source = replaceOnce(
    source,
    `  if (code === 'CASHIER_STAFF_VERSION_CONFLICT') return l.versionConflict;\n  if (code === 'CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS') return l.offlineConflict;`,
    `  if (code === 'CASHIER_STAFF_VERSION_CONFLICT') return l.versionConflict;\n  if (code === 'CASHIER_STATION_VERSION_CONFLICT') return l.stationVersionConflict;\n  if (code === 'CASHIER_OFFLINE_BRANCH_AUTHORITY_EXISTS') return l.offlineConflict;`,
    'dashboard station conflict localization',
  );

  source = replaceOnce(
    source,
    `  const [branchLabel, setBranchLabel] = useState('');\n  const [offlineAuthority, setOfflineAuthority] = useState(false);\n`,
    `  const [branchLabel, setBranchLabel] = useState('');\n  const [offlineAuthority, setOfflineAuthority] = useState(false);\n\n  const [editingStationId, setEditingStationId] = useState<string | null>(null);\n  const [editStationName, setEditStationName] = useState('');\n  const [editBranchKey, setEditBranchKey] = useState('');\n  const [editBranchLabel, setEditBranchLabel] = useState('');\n  const [editOfflineAuthority, setEditOfflineAuthority] = useState(false);\n`,
    'dashboard station edit state',
  );

  source = replaceOnce(
    source,
    `  const createPairing = async (station: StationView) => {`,
    `  const startStationEdit = (station: StationView) => {\n    setEditingStationId(station.id);\n    setEditStationName(station.name);\n    setEditBranchKey(station.branch_key);\n    setEditBranchLabel(station.branch_label || '');\n    setEditOfflineAuthority(station.offline_inventory_authority);\n    setError('');\n  };\n\n  const cancelStationEdit = () => {\n    if (busy) return;\n    setEditingStationId(null);\n  };\n\n  const saveStationEdit = async (station: StationView) => {\n    if (!editStationName.trim() || !editBranchKey.trim()) return;\n    setBusy(true);\n    setError('');\n    try {\n      await api(\`/api/cashier/management/stations/\${encodeURIComponent(station.id)}\`, {\n        method: 'PATCH',\n        body: JSON.stringify({\n          expected_configuration_etag: station.configuration_etag,\n          name: editStationName.trim(),\n          branch_key: editBranchKey.trim(),\n          branch_label: editBranchLabel.trim(),\n          offline_inventory_authority: editOfflineAuthority,\n        }),\n      });\n      setEditingStationId(null);\n      await load();\n    } catch (cause) {\n      setError(localizedError(cause, l));\n    } finally {\n      setBusy(false);\n    }\n  };\n\n  const createPairing = async (station: StationView) => {`,
    'dashboard station edit actions',
  );

  source = replaceOnce(
    source,
    `  const editingMember = editingStaffId\n    ? staff.find(member => member.id === editingStaffId) || null\n    : null;\n`,
    `  const editingMember = editingStaffId\n    ? staff.find(member => member.id === editingStaffId) || null\n    : null;\n  const editingStation = editingStationId\n    ? stations.find(station => station.id === editingStationId) || null\n    : null;\n`,
    'dashboard current editing station',
  );

  source = replaceOnce(
    source,
    `                    <button type="button" disabled={busy || station.status !== 'active'} onClick={() => void createPairing(station)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">\n                      {l.pair}\n                    </button>`,
    `                    <div className="flex shrink-0 gap-2">\n                      {station.status !== 'revoked' ? (\n                        <button type="button" disabled={busy} onClick={() => startStationEdit(station)} className="rounded-lg border px-3 py-2 text-xs font-bold hover:bg-accent disabled:opacity-50">\n                          {l.edit}\n                        </button>\n                      ) : null}\n                      <button type="button" disabled={busy || station.status !== 'active'} onClick={() => void createPairing(station)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">\n                        {l.pair}\n                      </button>\n                    </div>`,
    'dashboard station card edit control',
  );

  source = replaceOnce(
    source,
    `      {pairing ? (\n        <Modal dir={dir} onClose={() => { if (!busy) setPairing(null); }}>`,
    `      {editingStation ? (\n        <Modal dir={dir} onClose={cancelStationEdit}>\n          <div className="flex items-center justify-between gap-3">\n            <h3 className="text-lg font-bold">{l.editStation}</h3>\n            <button type="button" onClick={cancelStationEdit} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm font-bold">{l.close}</button>\n          </div>\n          <div className="mt-4 grid gap-3 sm:grid-cols-2">\n            <label className="text-sm font-semibold">{l.stationName}<input value={editStationName} onChange={event => setEditStationName(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>\n            <label className="text-sm font-semibold">{l.branchKey}<input value={editBranchKey} onChange={event => setEditBranchKey(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" dir="ltr" /></label>\n            <label className="text-sm font-semibold sm:col-span-2">{l.branchLabel}<input value={editBranchLabel} onChange={event => setEditBranchLabel(event.target.value)} autoComplete="off" className="mt-1.5 h-11 w-full rounded-lg border bg-background px-3 font-normal outline-none focus:border-primary" /></label>\n          </div>\n          <label className="mt-4 flex items-start gap-3 rounded-xl border p-3">\n            <input type="checkbox" checked={editOfflineAuthority} onChange={event => setEditOfflineAuthority(event.target.checked)} className="mt-1 h-4 w-4" />\n            <span><strong className="block text-sm">{l.offlineAuthority}</strong><span className="mt-1 block text-xs text-muted-foreground">{l.offlineHint}</span></span>\n          </label>\n          <div className="mt-4 flex gap-2">\n            <button type="button" onClick={cancelStationEdit} disabled={busy} className="flex-1 rounded-lg border px-4 py-2.5 text-sm font-bold">{l.cancel}</button>\n            <button type="button" onClick={() => void saveStationEdit(editingStation)} disabled={busy || !editStationName.trim() || !editBranchKey.trim()} className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">\n              {busy ? l.saving : l.saveChanges}\n            </button>\n          </div>\n        </Modal>\n      ) : null}\n\n      {pairing ? (\n        <Modal dir={dir} onClose={() => { if (!busy) setPairing(null); }}>`,
    'dashboard station edit modal',
  );

  return source;
});

await edit('artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts', (source) => {
  const before = `export async function validateCashierOperatorSession(): Promise<CashierOperatorSession | null> {\n  const session = await getCashierOperatorSession();\n  if (!session) return null;\n  if (typeof navigator !== 'undefined' && navigator.onLine === false) {\n    return session;\n  }\n  const response = await fetch('/api/cashier/operator/me', {\n    headers: cashierOperatorHeaders(session),\n  });\n  const payload = await responsePayload(response);\n  if (!response.ok || payload.ok !== true) {\n    if (response.status === 401 && typeof sessionStorage !== 'undefined') {\n      sessionStorage.removeItem(OPERATOR_STORAGE_KEY);\n      return null;\n    }\n    throw apiError(\n      response,\n      payload,\n      'CASHIER_OPERATOR_VALIDATE_FAILED',\n      'Could not validate cashier operator session',\n    );\n  }\n  return session;\n}\n`;
  const after = `export async function validateCashierOperatorSession(): Promise<CashierOperatorSession | null> {\n  const session = await getCashierOperatorSession();\n  if (!session) return null;\n  if (typeof navigator !== 'undefined' && navigator.onLine === false) {\n    return session;\n  }\n  const response = await fetch('/api/cashier/operator/me', {\n    headers: cashierOperatorHeaders(session),\n  });\n  const payload = await responsePayload(response);\n  if (!response.ok || payload.ok !== true) {\n    if (response.status === 401 && typeof sessionStorage !== 'undefined') {\n      sessionStorage.removeItem(OPERATOR_STORAGE_KEY);\n      return null;\n    }\n    throw apiError(\n      response,\n      payload,\n      'CASHIER_OPERATOR_VALIDATE_FAILED',\n      'Could not validate cashier operator session',\n    );\n  }\n  if (!payload.operator || typeof payload.operator !== 'object' || Array.isArray(payload.operator)) {\n    throw new CashierOperatorSessionClientError(\n      'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',\n      'Cashier operator validation response is invalid',\n      502,\n    );\n  }\n  const operator = payload.operator as Record<string, unknown>;\n  const permissions = Array.isArray(operator.permissions)\n    ? operator.permissions.map((value) => String(value)) as CashierClientPermission[]\n    : [];\n  const refreshedContext: CashierOperatorContext = {\n    merchant_id: String(operator.merchant_id || ''),\n    station_id: String(operator.station_id || ''),\n    station_name: String(operator.station_name || ''),\n    branch_key: String(operator.branch_key || ''),\n    ...(operator.branch_label ? { branch_label: String(operator.branch_label) } : {}),\n    offline_inventory_authority: operator.offline_inventory_authority === true,\n    station_token: session.context.station_token,\n    credential_expires_at: String(operator.credential_expires_at || ''),\n    device_id: String(operator.device_id || ''),\n    credential_id: String(operator.credential_id || ''),\n    credential_version: Number(operator.credential_version),\n    operator_session_id: String(operator.operator_session_id || ''),\n    staff_id: String(operator.staff_id || ''),\n    shift_id: String(operator.shift_id || ''),\n    role: operator.role === 'manager' ? 'manager' : 'cashier',\n    permissions,\n    operator_expires_at: String(operator.operator_expires_at || ''),\n  };\n  const sameImmutableContext =\n    refreshedContext.merchant_id === session.context.merchant_id &&\n    refreshedContext.station_id === session.context.station_id &&\n    refreshedContext.device_id === session.context.device_id &&\n    refreshedContext.credential_id === session.context.credential_id &&\n    refreshedContext.credential_version === session.context.credential_version &&\n    refreshedContext.operator_session_id === session.context.operator_session_id &&\n    refreshedContext.staff_id === session.context.staff_id &&\n    refreshedContext.shift_id === session.context.shift_id;\n  if (\n    !sameImmutableContext ||\n    !refreshedContext.station_name ||\n    !refreshedContext.branch_key ||\n    !refreshedContext.credential_expires_at ||\n    !refreshedContext.operator_expires_at\n  ) {\n    throw new CashierOperatorSessionClientError(\n      'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',\n      'Cashier operator validation context does not match the active shift',\n      502,\n    );\n  }\n\n  const identity = await getOrCreateCashierDeviceIdentity();\n  if (\n    identity.cloud_merchant_id !== refreshedContext.merchant_id ||\n    identity.device_id !== refreshedContext.device_id ||\n    identity.station_id !== refreshedContext.station_id\n  ) {\n    throw new CashierOperatorSessionClientError(\n      'CASHIER_OPERATOR_VALIDATE_RESPONSE_INVALID',\n      'Cashier local identity does not match the validated station',\n      409,\n    );\n  }\n  const nextIdentity: CashierDeviceIdentity = {\n    ...identity,\n    station_name: refreshedContext.station_name,\n    branch_key: refreshedContext.branch_key,\n    offline_inventory_authority: refreshedContext.offline_inventory_authority,\n    station_credential_expires_at: refreshedContext.credential_expires_at,\n  };\n  if (refreshedContext.branch_label) nextIdentity.branch_label = refreshedContext.branch_label;\n  else delete nextIdentity.branch_label;\n  await writeCashierDeviceIdentity(nextIdentity);\n\n  const refreshedSession: CashierOperatorSession = {\n    operator_token: session.operator_token,\n    context: refreshedContext,\n  };\n  if (typeof sessionStorage === 'undefined') {\n    throw new CashierOperatorSessionClientError(\n      'CASHIER_OPERATOR_STORAGE_UNAVAILABLE',\n      'Session storage is required for cashier operator validation',\n      503,\n    );\n  }\n  sessionStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(refreshedSession));\n  return refreshedSession;\n}\n`;
  return replaceOnce(source, before, after, 'operator validation policy refresh');
});

await edit('artifacts/fawri/src/cashierMain.tsx', (source) => {
  source = replaceOnce(
    source,
    `  getCashierOperatorSession,\n  invalidateCashierOperatorSession,`,
    `  getCashierOperatorSession,\n  invalidateCashierOperatorSession,\n  validateCashierOperatorSession,`,
    'cashier main validation import',
  );
  source = replaceOnce(
    source,
    `    try {\n      const result = await syncCashierOperatorOutboxToCloud();`,
    `    try {\n      if (reconcileCatalog || force) {\n        await validateCashierOperatorSession();\n      }\n      const result = await syncCashierOperatorOutboxToCloud();`,
    'cashier online policy reconciliation',
  );
  return source;
});

await edit('artifacts/fawri/src/lib/cashierUiCopy.ts', (source) => {
  source = replaceOnce(
    source,
    `      errorItemNotFound: 'أحد عناصر السلة لم يعد متاحًا.',\n      errorSaleFailed: 'تعذر إكمال البيع. لم يتم تسجيل العملية.',`,
    `      errorItemNotFound: 'أحد عناصر السلة لم يعد متاحًا.',\n      errorOfflineInventoryAuthorityRequired: 'هذه المحطة غير مخولة ببيع المنتجات التي يتتبع مخزونها أثناء انقطاع الإنترنت. فعّل مخزون دون اتصال لهذه المحطة من لوحة التاجر.',\n      errorSaleFailed: 'تعذر إكمال البيع. لم يتم تسجيل العملية.',`,
    'arabic offline authority sale error',
  );
  source = replaceOnce(
    source,
    `      errorItemNotFound: 'یەکێک لە کاڵاکانی سەبەتەکە چیتر بەردەست نییە.',\n      errorSaleFailed: 'فرۆشتن تەواو نەبوو. کردارەکە تۆمار نەکرا.',`,
    `      errorItemNotFound: 'یەکێک لە کاڵاکانی سەبەتەکە چیتر بەردەست نییە.',\n      errorOfflineInventoryAuthorityRequired: 'ئەم وێستگەیە ڕێگەی فرۆشتنی کۆگای بەدواداچووکراوی نییە لە کاتی نەبوونی ئینتەرنێت. دەسەڵاتی کۆگای ئۆفلاین لە داشبۆردی بازرگان چالاک بکە.',\n      errorSaleFailed: 'فرۆشتن تەواو نەبوو. کردارەکە تۆمار نەکرا.',`,
    'kurdish offline authority sale error',
  );
  source = replaceOnce(
    source,
    `      errorItemNotFound: 'An item in the cart is no longer available.',\n      errorSaleFailed: 'The sale could not be completed. No operation was recorded.',`,
    `      errorItemNotFound: 'An item in the cart is no longer available.',\n      errorOfflineInventoryAuthorityRequired: 'This station is not allowed to sell tracked inventory while offline. Enable offline inventory for this station from the merchant dashboard.',\n      errorSaleFailed: 'The sale could not be completed. No operation was recorded.',`,
    'english offline authority sale error',
  );
  return source;
});

await edit('artifacts/fawri/src/pages/CashierPosPage.tsx', (source) =>
  replaceOnce(
    source,
    `  if (message.includes('ITEM_NOT_FOUND')) {\n    return labels.errorItemNotFound;\n  }\n  return labels.errorSaleFailed;`,
    `  if (message.includes('ITEM_NOT_FOUND')) {\n    return labels.errorItemNotFound;\n  }\n  if (\n    code === 'CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED' ||\n    message.includes('CASHIER_OFFLINE_INVENTORY_AUTHORITY_REQUIRED')\n  ) {\n    return labels.errorOfflineInventoryAuthorityRequired;\n  }\n  return labels.errorSaleFailed;`,
    'cashier POS specific offline authority error',
  ),
);

console.log(`Applied POS offline policy hardening to ${changes.length} files:`);
for (const path of changes) console.log(`- ${path}`);
