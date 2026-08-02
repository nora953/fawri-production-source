from pathlib import Path


def replace_once(path: Path, old: str, new: str, label: str) -> None:
    text = path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 match, found {count}")
    path.write_text(text.replace(old, new, 1))


translations_path = Path("artifacts/fawri/src/lib/translations/ar.ts")
replace_once(
    translations_path,
    '  emergency_credit: "رصيد طوارئ",\n',
    '  emergency_credit: "رصيد الطوارئ",\n',
    "merchant emergency label",
)

admin_page_path = Path("artifacts/fawri/src/pages/AdminPage.tsx")
replace_once(
    admin_page_path,
    '  const permissionRefreshInFlightRef = useRef(false);\n',
    '  const permissionRefreshInFlightRef = useRef(false);\n  const adminLogRefreshInFlightRef = useRef(false);\n',
    "admin log refresh guard",
)

old_refresh_logs = '''  const refreshLogsFromApi = useCallback(async () => {
    if (!canViewLogs) {
      setLogs([]);
      return;
    }

    try {
      const response = await fetch("/api/auth/admin/logs", {
        headers: getAdminAuthHeaders(),
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !Array.isArray(data.logs)) {
        throw new Error(data?.error || "Could not load admin logs");
      }
      setLogs(data.logs as AdminLog[]);
    } catch (error) {
      console.error("Admin logs API sync failed:", error);
    }
  }, [canViewLogs, handleUnauthorizedAdminResponse]);
'''

new_refresh_logs = '''  const refreshLogsFromApi = useCallback(async () => {
    if (!canViewLogs) {
      setLogs([]);
      return;
    }
    if (adminLogRefreshInFlightRef.current) return;

    adminLogRefreshInFlightRef.current = true;
    try {
      const response = await fetch("/api/auth/admin/logs", {
        headers: getAdminAuthHeaders(),
        cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (handleUnauthorizedAdminResponse(response)) return;
      if (!response.ok || !data?.ok || !Array.isArray(data.logs)) {
        throw new Error(data?.error || "Could not load admin logs");
      }
      setLogs(data.logs as AdminLog[]);
    } catch (error) {
      console.error("Admin logs API sync failed:", error);
    } finally {
      adminLogRefreshInFlightRef.current = false;
    }
  }, [canViewLogs, handleUnauthorizedAdminResponse]);

  useEffect(() => {
    if (!canViewLogs) return;

    const refreshLogsWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      void refreshLogsFromApi();
    };

    const intervalId = window.setInterval(refreshLogsWhenVisible, 3_000);
    window.addEventListener("focus", refreshLogsWhenVisible);
    document.addEventListener("visibilitychange", refreshLogsWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshLogsWhenVisible);
      document.removeEventListener("visibilitychange", refreshLogsWhenVisible);
    };
  }, [canViewLogs, refreshLogsFromApi]);
'''

replace_once(
    admin_page_path,
    old_refresh_logs,
    new_refresh_logs,
    "automatic admin log refresh",
)

print("Emergency label and automatic admin log refresh applied.")
