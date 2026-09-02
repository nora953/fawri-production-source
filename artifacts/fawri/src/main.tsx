import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./styles/fawriUiBaseline.css";
import "./styles/catalogSummaryCards.css";
import "./styles/fawriLanguageAuthority.css";
import "./styles/fawriFieldContent.css";
import { I18nProvider } from "@/lib/i18n";

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
