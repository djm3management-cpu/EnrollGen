/**
 * ACAScript.jsx — ACA On-Exchange entry point
 * Wraps ACAFlow with ACAProvider
 */

import { ACAProvider } from "./ACAContext";
import ACAFlow from "./ACAFlow";
import ACAChecklist from "./ACAChecklist";
import AcaCopilot from "../../components/AcaCopilot";

export default function ACAScript() {
  return (
    <ACAProvider>
      <AcaCopilot />
      <ACAFlow />
      <ACAChecklist />
    </ACAProvider>
  );
}
