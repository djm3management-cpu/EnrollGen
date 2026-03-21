/**
 * U65Script.jsx — U65 Off-Exchange entry point
 * Wraps U65Flow with U65Provider
 */

import { U65Provider } from "./U65Context";
import U65Flow from "./U65Flow";
import U65Checklist from "./U65Checklist";
import U65Copilot from "../../components/U65Copilot";

export default function U65Script() {
  return (
    <U65Provider>
      <U65Copilot />
      <U65Flow />
      <U65Checklist />
    </U65Provider>
  );
}
