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

await edit('artifacts/api-server/src/routes/cashier-staff-operations.ts', (source) => {
  source = replaceOnce(
    source,
    `import { buildCashierCentralReportAuthoritative } from "../services/postgresCashierCentralReportAuthority";`,
    `import { buildCashierCentralReportAuthoritative } from "../services/postgresCashierCentralReportAuthority";\nimport {\n  listCashierStationConfigurationsAuthoritative,\n  updateCashierStationConfigurationAuthoritative,\n} from "../services/cashierStationConfigurationAuthority";`,
    'station configuration authority import',
  );

  source = replaceOnce(
    source,
    `      const stations = await listCashierStationsAuthoritative(merchantId(res));`,
    `      const stations = await listCashierStationConfigurationsAuthoritative(merchantId(res));`,
    'station list configuration etag projection',
  );

  const anchor = `router.patch(\n  "/cashier/management/stations/:stationId",\n  requireMerchantAuthority,`;
  const configurationRoute = `router.patch(\n  "/cashier/management/stations/:stationId/configuration",\n  requireMerchantAuthority,\n  async (req: Request, res: Response) => {\n    try {\n      const station = await updateCashierStationConfigurationAuthoritative({\n        merchantId: merchantId(res),\n        stationId: req.params.stationId,\n        expectedConfigurationEtag: req.body?.expected_configuration_etag,\n        name: req.body?.name,\n        branchKey: req.body?.branch_key,\n        branchLabel: req.body?.branch_label,\n        offlineInventoryAuthority: optionalBoolean(\n          req.body?.offline_inventory_authority,\n          "offline_inventory_authority",\n        ),\n      });\n      res.setHeader("Cache-Control", "no-store");\n      res.json({ ok: true, station });\n    } catch (error) {\n      sendError(res, error);\n    }\n  },\n);\n\n${anchor}`;
  source = replaceOnce(source, anchor, configurationRoute, 'station configuration patch route');
  return source;
});

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
    `  const startStationEdit = (station: StationView) => {\n    setEditingStationId(station.id);\n    setEditStationName(station.name);\n    setEditBranchKey(station.branch_key);\n    setEditBranchLabel(station.branch_label || '');\n    setEditOfflineAuthority(station.offline_inventory_authority);\n    setError('');\n  };\n\n  const cancelStationEdit = () => {\n    if (busy) return;\n    setEditingStationId(null);\n  };\n\n  const saveStationEdit = async (station: StationView) => {\n    if (!editStationName.trim() || !editBranchKey.trim()) return;\n    setBusy(true);\n    setError('');\n    try {\n      await api(\`/api/cashier/management/stations/\${encodeURIComponent(station.id)}/configuration\`, {\n        method: 'PATCH',\n        body: JSON.stringify({\n          expected_configuration_etag: station.configuration_etag,\n          name: editStationName.trim(),\n          branch_key: editBranchKey.trim(),\n          branch_label: editBranchLabel.trim(),\n          offline_inventory_authority: editOfflineAuthority,\n        }),\n      });\n      setEditingStationId(null);\n      await load();\n    } catch (cause) {\n      setError(localizedError(cause, l));\n    } finally {\n      setBusy(false);\n    }\n  };\n\n  const createPairing = async (station: StationView) => {`,
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

await edit('artifacts/fawri/src/lib/cashierUiCopy.ts', (source) => {
  source = replaceOnce(
    source,
    `      errorItemNotFound: 'أحد عناصر السلة لم يعد متاحًا.',\n      errorSaleFailed: 'تعذر إكمال البيع. لم يتم تسجيل العملية.',`,
    `      errorItemNotFound: 'أحد عناصر السلة لم يعد متاحًا.',\n      errorOfflineInventoryAuthorityRequired: 'هذه المحطة غير مخولة ببيع المنتجات التي يتتبع مخزونها أثناء انقطاع الإنترنت. فعّل مخزون دون اتصال لهذه المحطة من لوحة التاجر.',\n      errorSaleFailed: 'تعذر إكمال البيع. لم يتم تسجيل العملية.',`,
    'arabic offline authority sale error',
  );
  source = replaceOnce(
    source,
    `      errorItemNotFound: 'یەکێک لە دانەکانی سەبەتە چیتر بەردەست نییە.',\n      errorSaleFailed: 'فرۆشتن تەواو نەبوو و مامەڵەکە تۆمار نەکرا.',`,
    `      errorItemNotFound: 'یەکێک لە دانەکانی سەبەتە چیتر بەردەست نییە.',\n      errorOfflineInventoryAuthorityRequired: 'ئەم وێستگەیە ڕێگەی فرۆشتنی کۆگای بەدواداچووکراوی نییە لە کاتی نەبوونی ئینتەرنێت. دەسەڵاتی کۆگای ئۆفلاین لە داشبۆردی بازرگان چالاک بکە.',\n      errorSaleFailed: 'فرۆشتن تەواو نەبوو و مامەڵەکە تۆمار نەکرا.',`,
    'kurdish offline authority sale error',
  );
  source = replaceOnce(
    source,
    `      errorItemNotFound: 'An item in the cart is no longer available.',\n      errorSaleFailed: 'The sale could not be completed. Nothing was recorded.',`,
    `      errorItemNotFound: 'An item in the cart is no longer available.',\n      errorOfflineInventoryAuthorityRequired: 'This station is not allowed to sell tracked inventory while offline. Enable offline inventory for this station from the merchant dashboard.',\n      errorSaleFailed: 'The sale could not be completed. Nothing was recorded.',`,
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
