import { useCallback, useEffect, useState } from "react";

import AdminEarlyWarningWorkspacePageV2 from "./AdminEarlyWarningWorkspacePageV2";
import ProviderCostSettingsV2 from "./ProviderCostSettingsV2";
import "./adminEarlyWarningFinal.css";

function isolateYearMonthText(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) nodes.push(current);
    current = walker.nextNode();
  }
  for (const node of nodes) {
    const parent = node.parentElement;
    if (!parent || parent.closest("select, option")) continue;
    const value = node.nodeValue || "";
    if (!/20\d{2}-\d{2}/.test(value) || value.includes("\u2066")) continue;
    node.nodeValue = value.replace(/(20\d{2}-\d{2})/g, "\u2066$1\u2069");
  }
}

export default function AdminEarlyWarningWorkspacePageFinal() {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const captureRoot = useCallback((node: HTMLDivElement | null) => {
    setRoot(node);
  }, []);

  useEffect(() => {
    if (!root) return;
    isolateYearMonthText(root);
    const observer = new MutationObserver(() => {
      observer.disconnect();
      isolateYearMonthText(root);
      observer.observe(root, { subtree: true, childList: true, characterData: true });
    });
    observer.observe(root, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [root]);

  return (
    <div ref={captureRoot} className="early-warning-final">
      <AdminEarlyWarningWorkspacePageV2 />
      <ProviderCostSettingsV2 root={root} />
    </div>
  );
}
