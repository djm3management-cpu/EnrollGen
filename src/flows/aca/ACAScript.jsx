/**
 * ACAScript.jsx — ACA On-Exchange entry point
 * Wraps ACAFlow with ACAProvider
 */

import { ACAProvider } from "./ACAContext";
import ACAFlow from "./ACAFlow";
import ACAChecklist from "./ACAChecklist";

export default function ACAScript() {
  return (
    <ACAProvider>
      <ACAFlow />
      <ACAChecklist />
    </ACAProvider>
  );
}
