import App from "./App";
import { createRoot } from "react-dom/client";
import { initI18n } from "./utils/i18nUtils";
import { QueryProvider, PolarisProvider } from "./components";

// Ensure that locales are loaded before rendering the app
initI18n().then(() => {
  const root = createRoot(document.getElementById("app"));
  root.render(
    <PolarisProvider>
      <QueryProvider>
        <App />
      </QueryProvider>
    </PolarisProvider>
  );
});
