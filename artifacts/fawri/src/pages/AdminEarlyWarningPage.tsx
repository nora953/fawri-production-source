import { useCallback, useState } from "react";

import AdminEarlyWarningWorkspacePage from "./AdminEarlyWarningWorkspacePage";
import ProviderCostSettings from "./ProviderCostSettings";
import "./adminEarlyWarning.css";

export default function AdminEarlyWarningPage() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const captureRoot = useCallback((node: HTMLDivElement | null) => {
    setRoot(node);
  }, []);

  return (
    <div ref={captureRoot} className="early-warning-final">
      <AdminEarlyWarningWorkspacePage />
      <ProviderCostSettings root={root} />
    </div>
  );
}
