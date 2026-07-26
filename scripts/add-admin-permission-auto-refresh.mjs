import fs from "node:fs";
import { execSync } from "node:child_process";

const pagePath = "artifacts/fawri/src/pages/AdminPage.tsx";
const selfPath = "scripts/add-admin-permission-auto-refresh.mjs";
const branch = "feature/admin-permissions-v2";

function run(command) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: "inherit", shell: "/bin/bash" });
}

function replaceOnce(source, label, before, after) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one match, found ${count}`);
  }
  return source.replace(before, after);
}

let page = fs.readFileSync(pagePath, "utf8");

page = replaceOnce(
  page,
  "React useRef import",
  'import React, { useState, useEffect, useCallback } from "react";',
  'import React, { useState, useEffect, useCallback, useRef } from "react";',
);

page = replaceOnce(
  page,
  "permission refresh in-flight state",
  `  const [deletionRequests, setDeletionRequests] = useState<\n    MerchantDeletionRequest[]\n  >([]);\n\n  const refreshCurrentAdminFromApi = useCallback(async (): Promise<Merchant | null> => {\n    try {\n      const response = await fetch("/api/auth/admin/me", {\n        headers: getAdminAuthHeaders(),\n      });\n      const data = await response.json().catch(() => null);\n\n      if (!response.ok || !data?.ok || !data.admin?.is_admin) {\n        clearSession();\n        setCurrentAdmin(undefined);\n        setLocation("/login");\n        return null;\n      }\n\n      const serverAdmin = data.admin as Merchant;\n      setCurrentAdmin(serverAdmin);\n      return serverAdmin;\n    } catch (error) {\n      console.error("Current admin API refresh failed:", error);\n      clearSession();\n      setCurrentAdmin(undefined);\n      setLocation("/login");\n      return null;\n    }\n  }, [setLocation]);\n\n  useEffect(() => {\n    void refreshCurrentAdminFromApi();\n  }, [refreshCurrentAdminFromApi]);`,
  `  const [deletionRequests, setDeletionRequests] = useState<\n    MerchantDeletionRequest[]\n  >([]);\n  const permissionRefreshInFlightRef = useRef(false);\n\n  const refreshCurrentAdminFromApi = useCallback(async (\n    options: { preserveOnTransientError?: boolean } = {},\n  ): Promise<Merchant | null> => {\n    try {\n      const response = await fetch("/api/auth/admin/me", {\n        headers: getAdminAuthHeaders(),\n      });\n      const data = await response.json().catch(() => null);\n\n      if (!response.ok || !data?.ok || !data.admin?.is_admin) {\n        const sessionIsInvalid = response.status === 401 || response.status === 403;\n        if (sessionIsInvalid || !options.preserveOnTransientError) {\n          clearSession();\n          setCurrentAdmin(undefined);\n          setLocation("/login");\n        }\n        return null;\n      }\n\n      const serverAdmin = data.admin as Merchant;\n      setCurrentAdmin(serverAdmin);\n      return serverAdmin;\n    } catch (error) {\n      console.error("Current admin API refresh failed:", error);\n      if (!options.preserveOnTransientError) {\n        clearSession();\n        setCurrentAdmin(undefined);\n        setLocation("/login");\n      }\n      return null;\n    }\n  }, [setLocation]);\n\n  const refreshAdminPermissions = useCallback(async () => {\n    if (permissionRefreshInFlightRef.current) return;\n\n    permissionRefreshInFlightRef.current = true;\n    try {\n      await refreshCurrentAdminFromApi({ preserveOnTransientError: true });\n    } finally {\n      permissionRefreshInFlightRef.current = false;\n    }\n  }, [refreshCurrentAdminFromApi]);\n\n  useEffect(() => {\n    void refreshCurrentAdminFromApi();\n  }, [refreshCurrentAdminFromApi]);\n\n  useEffect(() => {\n    const refreshWhenVisible = () => {\n      if (document.visibilityState === "visible") {\n        void refreshAdminPermissions();\n      }\n    };\n\n    const intervalId = window.setInterval(refreshWhenVisible, 15_000);\n    window.addEventListener("focus", refreshWhenVisible);\n    document.addEventListener("visibilitychange", refreshWhenVisible);\n\n    return () => {\n      window.clearInterval(intervalId);\n      window.removeEventListener("focus", refreshWhenVisible);\n      document.removeEventListener("visibilitychange", refreshWhenVisible);\n    };\n  }, [refreshAdminPermissions]);\n\n  useEffect(() => {\n    const merchantStatusConfirmTypes = new Set<ConfirmType>([\n      "approve",\n      "reject",\n      "suspend",\n      "unsuspend",\n      "restore_pending",\n    ]);\n    const subscriptionConfirmTypes = new Set<ConfirmType>([\n      "reset_replies",\n      "stop_auto_reply",\n    ]);\n\n    setConfirmDialog((current) => {\n      if (!current) return current;\n      if (!canManageMerchants && merchantStatusConfirmTypes.has(current.type)) {\n        return null;\n      }\n      if (!canManageSubscriptions && subscriptionConfirmTypes.has(current.type)) {\n        return null;\n      }\n      return current;\n    });\n\n    if (!canManageSubscriptions) {\n      setPlanModal(null);\n      setRepliesModal(null);\n      setFilterPlan("all");\n    }\n    if (!canManageMerchants) {\n      setDeleteMerchantTarget(null);\n    }\n    if (!canViewMerchantData) {\n      setDetailsMerchant(null);\n    }\n  }, [canManageMerchants, canManageSubscriptions, canViewMerchantData]);`,
);

fs.writeFileSync(pagePath, page, "utf8");

const updated = fs.readFileSync(pagePath, "utf8");
for (const marker of [
  'window.setInterval(refreshWhenVisible, 15_000)',
  'window.addEventListener("focus", refreshWhenVisible)',
  'document.addEventListener("visibilitychange", refreshWhenVisible)',
  'preserveOnTransientError: true',
  'setPlanModal(null)',
  'setDeleteMerchantTarget(null)',
]) {
  if (!updated.includes(marker)) {
    throw new Error(`Missing expected permission-refresh marker: ${marker}`);
  }
}

run("pnpm run typecheck");
run("PORT=3000 BASE_PATH=/ pnpm --filter @workspace/fawri run build");
run("pnpm --filter @workspace/api-server run test:admin-permissions");
run("pnpm --filter @workspace/api-server run test:merchant-session");

fs.rmSync(selfPath);
run("git diff --check");
run(`git add ${pagePath} ${selfPath}`);
run('git commit -m "Refresh admin permissions automatically"');
run(`git push origin ${branch}`);

console.log("\nCompleted: administrator permissions now refresh every 15 seconds and immediately on focus or tab visibility changes.");
