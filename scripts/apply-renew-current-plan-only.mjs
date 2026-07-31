import fs from 'node:fs';

const filePath = 'artifacts/fawri/src/pages/AdminPage.tsx';

function replaceExactly(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Could not find ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Found more than one ${label}`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let source = fs.readFileSync(filePath, 'utf8');

source = replaceExactly(
  source,
  `interface PlanModalState {\n  merchantId: string;\n  merchantName: string;\n  mode: "activate" | "change" | "renew";\n}\n`,
  `interface PlanModalState {\n  merchantId: string;\n  merchantName: string;\n  mode: "activate" | "change" | "renew";\n  currentPlan?: PlanKey;\n}\n`,
  'PlanModalState',
);

source = replaceExactly(
  source,
  `  const [selected, setSelected] = useState<PlanKey | null>(null);\n`,
  `  const [selected, setSelected] = useState<PlanKey | null>(\n    state.mode === "renew" ? state.currentPlan ?? null : null,\n  );\n`,
  'renew selected plan state',
);

source = replaceExactly(
  source,
  `  const submitLabel: Record<PlanModalState["mode"], string> = {\n    activate: adminText.confirmActivateSubscription,\n    change: adminText.confirmChangePlan,\n    renew: adminText.confirmRenewPlan,\n  };\n\n  return (\n`,
  `  const submitLabel: Record<PlanModalState["mode"], string> = {\n    activate: adminText.confirmActivateSubscription,\n    change: adminText.confirmChangePlan,\n    renew: adminText.confirmRenewPlan,\n  };\n\n  const visiblePlanKeys: PlanKey[] =\n    state.mode === "renew"\n      ? state.currentPlan\n        ? [state.currentPlan]\n        : []\n      : (Object.keys(PLANS) as PlanKey[]);\n\n  return (\n`,
  'visible renewal plan keys',
);

source = replaceExactly(
  source,
  `          {(Object.keys(PLANS) as PlanKey[]).map((key) => (\n`,
  `          {visiblePlanKeys.map((key) => (\n`,
  'plan list rendering',
);

source = replaceExactly(
  source,
  `  const openConfirm = (type: ConfirmType, m: Merchant) =>\n    setConfirmDialog({ type, merchantId: m.id, merchantName: m.store_name });\n  const openPlan = (mode: PlanModalState["mode"], m: Merchant) =>\n    setPlanModal({ merchantId: m.id, merchantName: m.store_name, mode });\n  const openReplies = (mode: RepliesModalState["mode"], m: Merchant) => {\n`,
  `  const openConfirm = (type: ConfirmType, m: Merchant) =>\n    setConfirmDialog({ type, merchantId: m.id, merchantName: m.store_name });\n  const openPlan = (mode: PlanModalState["mode"], m: Merchant) => {\n    const currentSubscriptionPlan = getSub(m.id)?.plan_name;\n    const currentPlan =\n      currentSubscriptionPlan && currentSubscriptionPlan in PLANS\n        ? (currentSubscriptionPlan as PlanKey)\n        : undefined;\n\n    setPlanModal({\n      merchantId: m.id,\n      merchantName: m.store_name,\n      mode,\n      currentPlan: mode === "renew" ? currentPlan : undefined,\n    });\n  };\n  const openReplies = (mode: RepliesModalState["mode"], m: Merchant) => {\n`,
  'openPlan current plan binding',
);

fs.writeFileSync(filePath, source);
console.log('Renewal modal now keeps and displays only the current paid plan.');
