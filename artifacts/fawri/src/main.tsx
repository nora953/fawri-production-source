import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/fawriUiBaseline.css";
import "./styles/catalogSummaryCards.css";
import "./styles/fawriLanguageAuthority.css";
import "./styles/fawriFieldContent.css";
import { installAdaptiveIdentifierInputs } from "@/lib/adaptiveIdentifierInputs";
import { installCatalogEditorAutoDirection } from "@/lib/catalogEditorAutoDirection";
import { installCatalogArabicServiceGoldenGuard } from "@/lib/catalogArabicServiceGoldenGuard";
import { installCatalogDetailsTypeParity } from "@/lib/catalogDetailsTypeParity";
import { applyCatalogEditorEnglishSemanticParity } from "@/lib/catalogEditorEnglishSemanticParity";
import { applyCatalogEditorSoraniSemanticParity } from "@/lib/catalogEditorSoraniSemanticParity";
import { I18nProvider } from "@/lib/i18n";

applyCatalogEditorEnglishSemanticParity();
applyCatalogEditorSoraniSemanticParity();
installAdaptiveIdentifierInputs();
installCatalogEditorAutoDirection();
installCatalogArabicServiceGoldenGuard();
installCatalogDetailsTypeParity();

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
