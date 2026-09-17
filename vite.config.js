import { defineConfig, loadEnv } from "vite";
import { assertNoPublicApiKeys } from "./src/lib/llm/config.js";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  assertNoPublicApiKeys({ ...loadEnv(mode, process.cwd(), ""), ...process.env });
  return {
  plugins: [react()],
  build: {
    // Avoid preloading deferred vendor chunks that are not consumed during the
    // initial load, which causes browser preload/service-worker warnings.
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("vite/preload-helper")) return "vendor-runtime";
          if (id.includes("/src/lib/llm/")) return "vendor-llm";
          if (!id.includes("node_modules")) return;
          if (id.includes("@clerk")) return "vendor-clerk";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("openai") || id.includes("@anthropic-ai")) return "vendor-llm";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("jspdf-autotable")) return "vendor-jspdf-autotable";
          if (id.includes("jspdf")) return "vendor-jspdf";
          if (id.includes("html2canvas")) return "vendor-html2canvas";
          if (id.includes("dompurify") || id.includes("purify")) return "vendor-dompurify";
          if (id.includes("xlsx")) return "vendor-xlsx";
          if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
        },
      },
    },
  },
  };
});
