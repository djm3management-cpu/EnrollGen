import { debugLog } from "../../lib/debugLog.js";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, UserRoundPlus } from "lucide-react";
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
  const isoDob = toIsoDob(dob);
  if (!isoDob) return null;
  const d = new Date(`${isoDob}T12:00:00`);
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
  const isoDob = toIsoDob(dob);
  if (!isoDob) return "";
  const [year, month, day] = isoDob.split("-");
  return `${month}/${day}/${year}`;
}

function formatDobInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function toIsoDob(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return value;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value || "");
  if (!match) return null;
  const [, month, day, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day)
    ? `${year}-${month}-${day}`
    : null;
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
        dob: toIsoDob(notes.customerDob),
        state: notes.customerState?.trim() || null,
        county: (countyLabel || notes.customerCounty || "").trim() || null,
        address: notes.customerAddress?.trim() || null,
        zip: (notes.customerZip || state.tpmoZip || "").trim() || null,
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
    } catch {
      debugLog("[ClientInfoCard] save to contact failed");
      setSaveState("error");
    } finally {
      window.clearTimeout(saveResetTimerRef.current);
      saveResetTimerRef.current = window.setTimeout(() => setSaveState("idle"), 2500);
    }
  }, [saveState, notes, countyLabel, state.tpmoZip, linkedContactId, updateContact, createContact]);

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

  const customerState = notes.customerState || "";
  const phone = notes.customerPhone || "";
  const dob = notes.customerDob || "";
  // Falls back to the ZIP already typed into the SEP Qualifier widget
  // above, so the agent doesn't have to enter it twice.
  const zip = notes.customerZip || state.tpmoZip || "";

  return (
    <div className="eg-rail-card">
      {subline ? <div className="eg-rail-card__sub">{subline}</div> : null}

      <div className="eg-rail-card__grid">
        <div className="eg-rail-card__field">
          <label className="eg-rail-card__field-key" htmlFor="left-rail-first-name">FIRST NAME</label>
          <input
            id="left-rail-first-name"
            className={`eg-rail-card__field-value${notes.customerFirstName ? "" : " is-empty"}`}
            value={notes.customerFirstName || ""}
            onChange={(e) => setNote("customerFirstName", e.target.value)}
            aria-label="First name"
          />
        </div>
        <div className="eg-rail-card__field">
          <label className="eg-rail-card__field-key" htmlFor="left-rail-last-name">LAST NAME</label>
          <input
            id="left-rail-last-name"
            className={`eg-rail-card__field-value${notes.customerLastName ? "" : " is-empty"}`}
            value={notes.customerLastName || ""}
            onChange={(e) => setNote("customerLastName", e.target.value)}
            aria-label="Last name"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">STATE</div>
          <input
            className={`eg-rail-card__field-value${customerState ? "" : " is-empty"}`}
            value={customerState}
            placeholder=""
            onChange={(e) => setNote("customerState", e.target.value)}
            aria-label="State"
          />
        </div>
        <div className="eg-rail-card__field">
          <div className="eg-rail-card__field-key">PHONE</div>
          <input
            className={`eg-rail-card__field-value${phone ? "" : " is-empty"}`}
            value={phone}
            placeholder=""
            onChange={(e) => setNote("customerPhone", e.target.value)}
            aria-label="Phone"
          />
        </div>
        <div className="eg-rail-card__field eg-rail-card__field--zip">
          <div className="eg-rail-card__field-key">ZIP</div>
          <input
            className={`eg-rail-card__field-value${zip ? "" : " is-empty"}`}
            value={zip}
            placeholder=""
            inputMode="numeric"
            maxLength={5}
            onChange={(e) => setNote("customerZip", e.target.value.replace(/\D/g, "").slice(0, 5))}
            aria-label="ZIP"
          />
        </div>
        <div className="eg-rail-card__field eg-rail-card__field--dob">
          <div className="eg-rail-card__field-key">DOB</div>
          <input
            className={`eg-rail-card__field-value${dob ? "" : " is-empty"}`}
            value={dob.includes("-") ? formatDob(dob) : dob}
            placeholder=""
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => setNote("customerDob", formatDobInput(e.target.value))}
            aria-label="Date of birth"
          />
          <button
            type="button"
            className={`eg-rail-card__save-contact eg-rail-card__save-contact--icon is-${saveState}`}
            onClick={handleSaveToContact}
            disabled={saveState === "saving"}
            aria-label={saveState === "saving" ? "Saving contact" : saveState === "saved" ? "Contact saved" : saveState === "error" ? "Contact save failed, retry" : linkedContactId ? "Save to contact" : "Create contact"}
            title={saveState === "saving" ? "Saving contact" : saveState === "saved" ? "Contact saved" : saveState === "error" ? "Save failed — retry" : linkedContactId ? "Save to contact" : "Create contact"}
          >
            {saveState === "saving" ? <LoaderCircle size={14} /> : saveState === "saved" ? <Check size={14} /> : saveState === "error" ? <CircleAlert size={14} /> : <UserRoundPlus size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ClientInfoCard;
