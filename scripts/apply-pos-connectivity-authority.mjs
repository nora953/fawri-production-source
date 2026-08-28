import { readFile, writeFile } from 'node:fs/promises';

const changed = [];

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: expected source not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: expected source is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function edit(path, transform) {
  const source = await readFile(path, 'utf8');
  const next = transform(source);
  if (next === source) throw new Error(`${path}: transform made no change`);
  await writeFile(path, next);
  changed.push(path);
}

await edit('artifacts/fawri/src/lib/cashierOperatorSessionRuntime.ts', (source) => {
  source = replaceOnce(
    source,
    `} from './cashierOperatorLocalSecurity';\n\nconst BOOTSTRAP_DATABASE`,
    `} from './cashierOperatorLocalSecurity';\nimport {\n  cashierNetworkAttemptAllowed,\n  markCashierNetworkFailure,\n  markCashierNetworkResponse,\n  markCashierOffline,\n} from './cashierConnectivity';\n\nconst BOOTSTRAP_DATABASE`,
    'session connectivity import',
  );
  source = replaceOnce(
    source,
    `  if (typeof navigator !== 'undefined' && navigator.onLine === false) {\n    return session;\n  }\n\n  let response: Response;`,
    `  if (!cashierNetworkAttemptAllowed()) {\n    markCashierOffline();\n    return session;\n  }\n\n  let response: Response;`,
    'session browser offline gate',
  );
  source = replaceOnce(
    source,
    `    response = await fetch('/api/cashier/operator/me', {\n      headers: cashierOperatorHeaders(session),\n    });\n  } catch (cause) {\n    if (!(cause instanceof TypeError)) throw cause;`,
    `    response = await fetch('/api/cashier/operator/me', {\n      headers: cashierOperatorHeaders(session),\n    });\n    markCashierNetworkResponse();\n  } catch (cause) {\n    if (!(cause instanceof TypeError)) throw cause;\n    markCashierNetworkFailure();`,
    'session network evidence',
  );
  return source;
});

await edit('artifacts/fawri/src/lib/cashierOperatorPolicyRefresh.ts', (source) => {
  source = replaceOnce(
    source,
    `} from './cashierOperatorSessionRuntime';\n\nconst OPERATOR_STORAGE_KEY`,
    `} from './cashierOperatorSessionRuntime';\nimport {\n  cashierNetworkAttemptAllowed,\n  markCashierNetworkFailure,\n  markCashierNetworkResponse,\n  markCashierOffline,\n} from './cashierConnectivity';\n\nconst OPERATOR_STORAGE_KEY`,
    'policy connectivity import',
  );
  source = replaceOnce(
    source,
    `  if (typeof navigator !== 'undefined' && navigator.onLine === false) {\n    return session;\n  }\n\n  const response = await fetch('/api/cashier/operator/me', {\n    headers: cashierOperatorHeaders(session),\n    credentials: 'omit',\n    cache: 'no-store',\n  });`,
    `  if (!cashierNetworkAttemptAllowed()) {\n    markCashierOffline();\n    return session;\n  }\n\n  let response: Response;\n  try {\n    response = await fetch('/api/cashier/operator/me', {\n      headers: cashierOperatorHeaders(session),\n      credentials: 'omit',\n      cache: 'no-store',\n    });\n    markCashierNetworkResponse();\n  } catch (cause) {\n    if (cause instanceof TypeError) markCashierNetworkFailure();\n    throw cause;\n  }`,
    'policy network evidence',
  );
  return source;
});

await edit('artifacts/fawri/src/pages/CashierHistoryPage.tsx', (source) => {
  source = replaceOnce(
    source,
    `import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';\nimport { CASHIER_UI_COPY, cashierLocale } from '@/lib/cashierUiCopy';`,
    `import { publishCashierDashboardRefresh } from '@/lib/cashierDashboardRefresh';\nimport {\n  cashierConnectivityIsOnline,\n  cashierNetworkAttemptAllowed,\n  subscribeCashierConnectivity,\n} from '@/lib/cashierConnectivity';\nimport { CASHIER_UI_COPY, cashierLocale } from '@/lib/cashierUiCopy';`,
    'history connectivity import',
  );
  source = replaceOnce(
    source,
    `  const [online, setOnline] = useState(() => navigator.onLine);`,
    `  const [online, setOnline] = useState(cashierConnectivityIsOnline);`,
    'history connectivity initial state',
  );
  source = replaceOnce(
    source,
    `  useEffect(() => {\n    if (!runtime) return;\n    const updateOnline = () => setOnline(navigator.onLine);\n    const refreshLocal = () => void refresh(runtime).catch(() => undefined);\n    window.addEventListener('online', updateOnline);\n    window.addEventListener('offline', updateOnline);\n    window.addEventListener('focus', refreshLocal);\n    const interval = window.setInterval(refreshLocal, 2500);\n    return () => {\n      window.clearInterval(interval);\n      window.removeEventListener('online', updateOnline);\n      window.removeEventListener('offline', updateOnline);\n      window.removeEventListener('focus', refreshLocal);\n    };\n  }, [refresh, runtime]);`,
    `  useEffect(() => {\n    if (!runtime) return;\n    const unsubscribeConnectivity = subscribeCashierConnectivity(state => {\n      setOnline(state.online);\n    });\n    const refreshLocal = () => void refresh(runtime).catch(() => undefined);\n    window.addEventListener('focus', refreshLocal);\n    const interval = window.setInterval(refreshLocal, 2500);\n    return () => {\n      window.clearInterval(interval);\n      unsubscribeConnectivity();\n      window.removeEventListener('focus', refreshLocal);\n    };\n  }, [refresh, runtime]);`,
    'history connectivity subscription',
  );
  source = replaceOnce(
    source,
    `      if (navigator.onLine === false) return;`,
    `      if (!cashierNetworkAttemptAllowed()) return;`,
    'history sync connectivity gate',
  );
  return source;
});

await edit('artifacts/fawri/src/pages/CashierPosPage.tsx', (source) => {
  source = replaceOnce(
    source,
    `import type { Lang } from '@/lib/types';\n`,
    `import type { Lang } from '@/lib/types';\nimport {\n  cashierConnectivityIsOnline,\n  subscribeCashierConnectivity,\n} from '@/lib/cashierConnectivity';\n`,
    'pos connectivity import',
  );
  source = replaceOnce(
    source,
    `  const [online, setOnline] = useState(() => navigator.onLine);`,
    `  const [online, setOnline] = useState(cashierConnectivityIsOnline);`,
    'pos connectivity initial state',
  );
  source = replaceOnce(
    source,
    `  useEffect(() => {\n    const update = () => setOnline(navigator.onLine);\n    window.addEventListener('online', update);\n    window.addEventListener('offline', update);\n    return () => {\n      window.removeEventListener('online', update);\n      window.removeEventListener('offline', update);\n    };\n  }, []);`,
    `  useEffect(() =>\n    subscribeCashierConnectivity(state => setOnline(state.online)),\n  []);`,
    'pos connectivity subscription',
  );
  return source;
});

await edit('artifacts/fawri/src/cashierMain.tsx', (source) => {
  source = replaceOnce(
    source,
    `import { refreshCashierOperatorPolicyFromCloud } from '@/lib/cashierOperatorPolicyRefresh';\nimport { publishCashierCatalogRefresh } from '@/lib/cashierCatalogRefresh';`,
    `import { refreshCashierOperatorPolicyFromCloud } from '@/lib/cashierOperatorPolicyRefresh';\nimport {\n  cashierConnectivityIsOnline,\n  cashierNetworkAttemptAllowed,\n  markCashierOffline,\n} from '@/lib/cashierConnectivity';\nimport { publishCashierCatalogRefresh } from '@/lib/cashierCatalogRefresh';`,
    'entry connectivity import',
  );
  source = replaceOnce(
    source,
    `function cashierIsOnline(): boolean {\n  return navigator.onLine !== false;\n}`,
    `function cashierIsOnline(): boolean {\n  return cashierConnectivityIsOnline();\n}`,
    'entry connectivity getter',
  );
  source = replaceOnce(
    source,
    `    if (!cashierIsOnline()) {\n      publishCashierSyncUiState({`,
    `    if (!cashierNetworkAttemptAllowed()) {\n      markCashierOffline();\n      publishCashierSyncUiState({`,
    'entry network attempt gate',
  );
  return source;
});

console.log(`Applied cashier connectivity authority to ${changed.length} files:`);
for (const path of changed) console.log(`- ${path}`);
