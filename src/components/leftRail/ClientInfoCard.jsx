import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useScript } from "../../context/ScriptContext";
import { useLiveCall } from "../../context/LiveCallContext";
import { useInboundCall } from "../../context/InboundCallContext";
import { useContactMutations } from "../../hooks/useContacts";

const NAME_STOP_WORDS = new Set([
  "a",
  "about",
  "and",
  "calling",
  "coverage",
  "current",
  "currently",
  "for",
  "from",
  "good",
  "here",
  "insurance",
  "line",
  "medicaid",
  "medicare",
  "member",
  "my",
  "on",
  "plan",
  "right",
  "speaking",
  "that",
  "the",
  "them",
  "this",
  "today",
  "with",
  "you",
  "yourself",
  "your",
]);

function calcAge(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const monthDelta = today.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < d.getDate())) {
    age -= 1;
  }
  return age;
}

function formatDob(dob) {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return dob;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${m}/${day}/${d.getFullYear()}`;
}

function toTitleName(value) {
  return value
    .split(/([\s'-])/)
    .map((part) =>
      /^[a-z]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
    )
    .join("");
}

function cleanNameCandidate(value) {
  const words = String(value || "")
    .split(/[,.!?;:]/)[0]
    .replace(/[^a-zA-Z'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const nameWords = [];
  for (const word of words) {
    const normalized = word.toLowerCase().replace(/[^a-z'-]/g, "");
    if (!normalized || NAME_STOP_WORDS.has(normalized)) break;
    if (!/^[a-z][a-z'-]{1,}$/i.test(normalized)) break;
    nameWords.push(word);
    if (nameWords.length === 3) break;
  }

  if (!nameWords.length) return null;

  const displayName = toTitleName(nameWords.join(" "));
  const [firstName, ...lastParts] = displayName.split(" ");
  return {
    firstName,
    lastName: lastParts.join(" "),
  };
}

function extractNameFromEntry(entry) {
  const text = String(entry?.text || "").trim();
  if (!text) return null;

  const patterns =
    entry.speaker === "customer"
      ? [
          /\bmy name is\s+([a-zA-Z'\s-]{2,60})/i,
          /\bthis is\s+([a-zA-Z'\s-]{2,60})/i,
        ]
      : [
          /\b(?:am i|are you)\s+speaking\s+(?:with|to)\s+([a-zA-Z'\s-]{2,60})/i,
          /\b(?:do i have|is this)\s+([a-zA-Z'\s-]{2,60})/i,
        ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const name = cleanNameCandidate(match?.[1]);
    if (name?.firstName) return name;
  }

  return null;
}

function inferCustomerName(mergedTranscript) {
  if (!Array.isArray(mergedTranscript)) return null;

  for (let index = mergedTranscript.length - 1; index >= 0; index -= 1) {
    const entry = mergedTranscript[index];
    if (!entry?.isFinal) continue;
    const name = extractNameFromEntry(entry);
    if (name) return name;
  }

  return null;
}

const ClientInfoCard = memo(function ClientInfoCard({ countyLabel = "" }) {
  const { state, dispatch } = useScript();
  const { liveCall } = useLiveCall();
  const inbound = useInboundCall();
  const { updateContact, createContact } = useContactMutations();
  const notes = useMemo(() => state.notes || {}, [state.notes]);

  const setNote = (field, value) =>
    dispatch({ type: "SET_NOTE", field, value });

  // Edits save back to the contact record, not just session state.
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const savedContactIdRef = useRef(null);
  const saveResetTimerRef = useRef(null);
  const linkedContactId = savedContactIdRef.current || inbound?.contact?.id || null;

  useEffect(() => {
    return () => window.clearTimeout(saveResetTimerRef.current);
  }, []);

  const handleSaveToContact = useCallback(async () => {
    if (saveState === "saving") return;
    setSaveState("saving");
    try {
      const mbi = String(notes.customerMbi || "").replace(/[^a-zA-Z0-9]/g, "");
      const fields = {
        first_name: notes.customerFirstName?.trim() || null,
        last_name: notes.customerLastName?.trim() || null,
        phone: notes.customerPhone?.trim() || null,
        email: notes.customerEmail?.trim() || null,
        dob: notes.customerDob || null,
        state: notes.customerState?.trim() || null,
        county: (countyLabel || notes.customerCounty || "").trim() || null,
        mbi_last4: mbi.length >= 4 ? mbi.slice(-4) : null,
        current_carrier: (notes.currentCoverage || notes.previousCarrier || "").trim() || null,
        ...(notes.partsABStatus === "Active" ? { medicare_parts: "ab" } : {}),
      };
      const cleaned = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== null)
      );

      if (linkedContactId) {
        await updateContact(linkedContactId, cleaned);
      } else {
        const created = await createContact({ ...cleaned, source: "manual" });
        savedContactIdRef.current = created.id;
      }
      setSaveState("saved");
    } catch (err) {
      console.error("[ClientInfoCard] save to contact failed:", err);
      setSaveState("error");
    } finally {
      window.clearTimeout(saveResetTimerRef.current);
      saveResetTimerRef.current = window.setTimeout(() => setSaveState("idle"), 2500);
    }
  }, [saveState, notes, countyLabel, linkedContactId, updateContact, createContact]);

  const fullName = useMemo(() => {
    const first = (notes.customerFirstName || "").trim();
    const last = (notes.customerLastName || "").trim();
    return [first, last].filter(Boolean).join(" ");
  }, [notes.customerFirstName, notes.customerLastName]);
  const inferredName = useMemo(
    () => inferCustomerName(liveCall.mergedTranscript),
    [liveCall.mergedTranscript]
  );

  useEffect(() => {
    const hasManualName = Boolean(
      notes.customerFirstName?.trim() || notes.customerLastName?.trim()
    );
    if (hasManualName || !inferredName?.firstName) return;

    dispatch({
      type: "SET_NOTE",
      field: "customerFirstName",
      value: inferredName.firstName,
    });

    if (inferredName.lastName) {
      dispatch({
        type: "SET_NOTE",
        field: "customerLastName",
        value: inferredName.lastName,
      });
    }
  }, [
    dispatch,
    inferredName?.firstName,
    inferredName?.lastName,
    notes.customerFirstName,
    notes.customerLastName,
  ]);

  const age = calcAge(notes.customerDob);
  const dobDisplay = formatDob(notes.customerDob);
  const subline = [dobDisplay && `DOB ${dobDisplay}`, age != null && `${age} yrs`]
    .filter(Boolean)
    .join(" - ");

  const partsAB = notes.partsABStatus || "";
  const currentCoverage = notes.currentCoverage || notes.previousCarrier || "";
  const county = countyLabel || notes.customerCounty || notes.customerState || "";

  return (
    <div className="eg-rail-card">
      <div className="eg-rail-card__label">CLIENT</div>

      <input
        className="eg-rail-card__name"
        style={{ background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 }}
        value={fullName}
        placeholder=""
        onChange={(e) => {
          const parts = e.target.value.trim().split(/\s+/);
          setNote("customerFirstName", parts[0] || "");
          setNote("customerLastName", parts.slice(1).join(" ") || "");
        }}
        aria-label="Client name"
      />

      <div className="eg-rail-card__sub">{subline}</div>

      <div className="eg-rail-card__grid">
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">MBI</div>
          <input
            className={`eg-rail-card__field-value${notes.customerMbi ? "" : " is-empty"}`}
            value={notes.customerMbi || ""}
            placeholder=""
            onChange={(e) => setNote("customerMbi", e.target.value)}
            aria-label="MBI"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">COUNTY</div>
          <input
            className={`eg-rail-card__field-value${county ? "" : " is-empty"}`}
            value={county}
            placeholder=""
            onChange={(e) => setNote("customerCounty", e.target.value)}
            aria-label="County"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">PARTS A/B</div>
          <input
            className={`eg-rail-card__field-value${partsAB === "Active" ? " is-good" : partsAB ? "" : " is-empty"}`}
            value={partsAB}
            placeholder=""
            onChange={(e) => setNote("partsABStatus", e.target.value)}
            aria-label="Parts A and B status"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">CURRENT</div>
          <input
            className={`eg-rail-card__field-value${currentCoverage ? "" : " is-empty"}`}
            value={currentCoverage}
            placeholder=""
            onChange={(e) => setNote("currentCoverage", e.target.value)}
            aria-label="Current coverage"
          />
        </div>
      </div>

      <button
        type="button"
        className={`eg-rail-card__save-contact is-${saveState}`}
        onClick={handleSaveToContact}
        disabled={saveState === "saving"}
      >
        {saveState === "saving"
          ? "SAVING..."
          : saveState === "saved"
            ? "SAVED ✓"
            : saveState === "error"
              ? "SAVE FAILED"
              : linkedContactId
                ? "SAVE TO CONTACT"
                : "CREATE CONTACT"}
      </button>
    </div>
  );
});

export default ClientInfoCard;
