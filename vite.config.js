import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@clerk")) return "vendor-clerk";
          if (id.includes("@supabase")) return "vendor-supabase";
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
});
