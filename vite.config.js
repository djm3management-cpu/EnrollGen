import { deploymentProfile, publicDeploymentProfile, agencyPhone, staffedHoursLabel } from './telephony/src/lib/deploymentProfile.js';
import { deploymentFeatures } from './telephony/src/lib/deploymentFeatures.js';
import { assertSafeAuthEnvironment } from "./integrations/authSafety.js";
import process from "node:process";
import { defineConfig, loadEnv } from "vite";
import { assertNoPublicApiKeys } from "./src/lib/llm/config.js";
import react from "@vitejs/plugin-react";
import { noiseSuppressionAudioWorkletVitePlugin } from "@workadventure/noise-suppression/vite";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  if(Object.hasOwn(env,'VITE_DEPLOYMENT_PROFILE_JSON'))throw Error('Deployment profile must remain server-side');
  deploymentFeatures(env);
  const profile = publicDeploymentProfile(deploymentProfile(env));
  assertSafeAuthEnvironment(env, { build: true });
  assertNoPublicApiKeys(env);
  return {
  plugins: [{name:'deployment-public', enforce:'pre', resolveId(id) { if (id.endsWith('/deploymentPublic.js') || id.endsWith('/deploymentPublic')) return '\0deployment-public'; }, load(id) { if(id==='\0deployment-public') return `export const deploymentPublic=${JSON.stringify(profile)}; export const agencyName=deploymentPublic.agencyName; export const agencyLine=${JSON.stringify(agencyPhone(profile))}; export const agencyHours=${JSON.stringify(staffedHoursLabel(profile))};`; }}, react(), noiseSuppressionAudioWorkletVitePlugin()],
  build: {
    // Fetch a requested panel's dependent chunks together instead of waiting
    // for successive import round trips before the panel can render.
    modulePreload: true,
    rollupOptions: {
      input:{app:"index.html",status:"status-page/index.html"},
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
          if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
        },
      },
    },
  },
  };
});
