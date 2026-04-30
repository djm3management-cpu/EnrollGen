import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useScript } from "../context/ScriptContext";
import { useAppAuth } from "../context/AuthContext";
import { useLiveCall } from "../context/LiveCallContext";
import {
  AGENCY_OPTIONS,
  CALL_OUTCOME_OPTIONS,
  INTAKE_CARRIER_OPTIONS,
  US_STATE_OPTIONS,
  WRITING_AGENT_OPTIONS,
  buildPostCallPayload,
  calculateSixtyDayDate,
  formatMbiInput,
  formatPhoneInput,
  formatPremiumInput,
  normalizeWritingAgent,
  savePostCallWrapUp,
  sendEnrollmentWebhookAfterSave,
} from "../lib/postCallPipeline";
import {
  getActiveSessionMetadata,
  setActivePostCallMetadata,
} from "../hooks/useSessionTracker";
import { ScriptBox, LockText, SectionToast } from "./SharedUI";

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function yesNoControl({ name, value, disabled, onChange }) {
  return (
    <div className="post-call-radio-row" role="radiogroup" aria-label={name}>
      {["No", "Yes"].map((option) => (
        <label key={option} className="post-call-radio-pill">
          <input
            type="radio"
            name={name}
            value={option}
            checked={(value || "No") === option}
            disabled={disabled}
            onChange={() => onChange(option)}
          />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}

export default React.memo(function SectionWrapUp() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const { liveCall } = useLiveCall();
  const { getToken } = useAppAuth();
  const [saveState, setSaveState] = useState({
    status: "idle",
    message: "",
    callRecordId: null,
    webhookStatus: "idle",
  });
  const { enrollOk, notes } = state;
  const isActive = activeSection === 8;
  const callOutcome = notes.callOutcome || "enrolled";
  const isEnrolled = callOutcome === "enrolled";
  const isSaving = saveState.status === "saving";

  const updateNote = useCallback(
    (field, value) => {
      dispatch({ type: "SET_NOTE", field, value });
    },
    [dispatch]
  );

  useEffect(() => {
    if (notes.writingAgent) return;
    const sessionMetadata = getActiveSessionMetadata();
    const matchedAgent = normalizeWritingAgent(sessionMetadata.agentName || state.agentName);
    if (matchedAgent) {
      updateNote("writingAgent", matchedAgent);
    }
  }, [notes.writingAgent, state.agentName, updateNote]);

  const validationError = useMemo(() => {
    if (!notes.customerFirstName?.trim()) return "Customer first name is required.";
    if (!notes.customerLastName?.trim()) return "Customer last name is required.";
    if (digitsOnly(notes.customerPhone).length !== 10) return "Enter a 10-digit customer phone number.";
    if (!callOutcome) return "Call outcome is required.";

    if (!isEnrolled) return "";

    if (!notes.customerDob) return "Date of birth is required for enrollments.";
    if (!notes.customerState) return "State is required for enrollments.";
    if (!notes.customerMbi?.trim()) return "MBI / Member ID is required for enrollments.";
    if (!notes.previousCarrier?.trim()) return "Previous carrier is required for enrollments.";
    if (!notes.carrierName) return "New carrier is required for enrollments.";
    if (!notes.enrollmentCode?.trim()) return "Plan / enrollment code is required for enrollments.";
    if (!notes.premium?.trim()) return "Monthly premium is required for enrollments.";
    if (!notes.effectiveDate) return "Effective date is required for enrollments.";
    if (!notes.sixtyDayDate) return "60 day follow-up date is required for enrollments.";
    if (!notes.agency) return "Agency is required for enrollments.";
    if (!notes.writingAgent) return "Writing agent is required for enrollments.";
    if ((notes.hra || "No") === "Yes" && !notes.hraDate) return "HRA date is required when HRA is completed.";
    return "";
  }, [callOutcome, isEnrolled, notes]);

  const handleEffectiveDateChange = useCallback(
    (value) => {
      updateNote("effectiveDate", value);
      updateNote("sixtyDayDate", calculateSixtyDayDate(value));
    },
    [updateNote]
  );

  const handleSaveWrapUp = useCallback(async () => {
    if (validationError) {
      setSaveState((current) => ({
        ...current,
        status: "error",
        message: validationError,
      }));
      return;
    }

    setSaveState((current) => ({
      status: "saving",
      message: "Saving call record...",
      callRecordId: current.callRecordId,
      webhookStatus: current.webhookStatus,
    }));

    try {
      const sessionMetadata = getActiveSessionMetadata();
      const payload = {
        ...buildPostCallPayload({
          state,
          liveCall,
          sessionMetadata,
          flow: "ma",
          final: true,
        }),
        call_outcome: callOutcome,
        agent_notes: notes.agentNotes || null,
      };

      const result = await savePostCallWrapUp(getToken, payload);
      const callRecordId = result.call_record_id || sessionMetadata.callRecordId || null;

      setActivePostCallMetadata({
        callRecordId,
        transcriptId: result.transcript_id || sessionMetadata.transcriptId || null,
      });

      setSaveState({
        status: "saved",
        message: "Call record saved.",
        callRecordId,
        webhookStatus: result.webhook_status || (isEnrolled ? "pending" : "skipped"),
      });

      if (isEnrolled && callRecordId && result.webhook_status !== "sent") {
        void sendEnrollmentWebhookAfterSave(getToken, {
          callRecordId,
          payload,
        }).then((webhookResult) => {
          if (webhookResult.status !== "sent") return;
          setSaveState((current) => ({
            ...current,
            webhookStatus: "sent",
          }));
        });
      }
    } catch (error) {
      console.error("[WrapUp] save failed:", error);
      setSaveState({
        status: "error",
        message: error?.message || "Call record save failed.",
        callRecordId: null,
        webhookStatus: "idle",
      });
    }
  }, [callOutcome, getToken, isEnrolled, liveCall, notes.agentNotes, state, validationError]);

  const statusClass = `post-call-save-status is-${saveState.status}`;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s8 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={8} timestamps={state.sectionTimestamps} />
      <h2>8) Wrap-Up</h2>

      {unlocked.s8 && isEnrolled && (
        <ScriptBox verbatim>
          {`"Great news, your Medicare enrollment is all set."

Call closing: "It's been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too."
End the call: "Thank you for [calling/choosing] [Carrier name] and have a great day!"`}
        </ScriptBox>
      )}

      <div className="post-call-core-panel">
        <div className="grid post-call-wrap-grid">
          <label>
            Customer First Name
            <input
              disabled={!enrollOk || isSaving}
              value={notes.customerFirstName}
              onChange={(e) => updateNote("customerFirstName", e.target.value)}
              placeholder="First name"
              required
            />
          </label>

          <label>
            Customer Last Name
            <input
              disabled={!enrollOk || isSaving}
              value={notes.customerLastName}
              onChange={(e) => updateNote("customerLastName", e.target.value)}
              placeholder="Last name"
              required
            />
          </label>

          <label>
            Phone
            <input
              type="tel"
              disabled={!enrollOk || isSaving}
              value={notes.customerPhone}
              onChange={(e) => updateNote("customerPhone", formatPhoneInput(e.target.value))}
              placeholder="(000) 000-0000"
              required
            />
          </label>

          <label>
            Call Outcome
            <select
              disabled={!enrollOk || isSaving}
              value={callOutcome}
              onChange={(e) => updateNote("callOutcome", e.target.value)}
              required
            >
              {CALL_OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className={`post-call-enrollment-panel ${isEnrolled ? "is-open" : ""}`}>
        <div className="post-call-section-heading">
          <span>Enrollment Intake</span>
          <small>Sent to GHL only when outcome is enrolled</small>
        </div>

        <div className="grid post-call-wrap-grid">
          <label>
            Email
            <input
              type="email"
              disabled={!enrollOk || isSaving}
              value={notes.customerEmail}
              onChange={(e) => updateNote("customerEmail", e.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label>
            Date of Birth
            <input
              type="date"
              disabled={!enrollOk || isSaving}
              value={notes.customerDob}
              onChange={(e) => updateNote("customerDob", e.target.value)}
              required={isEnrolled}
            />
          </label>

          <label>
            State
            <select
              disabled={!enrollOk || isSaving}
              value={notes.customerState}
              onChange={(e) => updateNote("customerState", e.target.value)}
              required={isEnrolled}
            >
              <option value="">Select</option>
              {US_STATE_OPTIONS.map((stateCode) => (
                <option key={stateCode} value={stateCode}>{stateCode}</option>
              ))}
            </select>
          </label>

          <label>
            MBI / Member ID
            <input
              disabled={!enrollOk || isSaving}
              value={notes.customerMbi}
              onChange={(e) => updateNote("customerMbi", formatMbiInput(e.target.value))}
              placeholder="XXXX-XXX-XXXX"
              required={isEnrolled}
            />
          </label>

          <label>
            Medicaid Eligible
            {yesNoControl({
              name: "medicaid",
              value: notes.medicaid,
              disabled: !enrollOk || isSaving,
              onChange: (value) => updateNote("medicaid", value),
            })}
          </label>

          {(notes.medicaid || "No") === "Yes" && (
            <label>
              Medicaid Number
              <input
                disabled={!enrollOk || isSaving}
                value={notes.medicaidNumber}
                onChange={(e) => updateNote("medicaidNumber", e.target.value)}
                placeholder="Medicaid ID"
              />
            </label>
          )}

          <label>
            Previous Carrier
            <input
              disabled={!enrollOk || isSaving}
              value={notes.previousCarrier}
              onChange={(e) => updateNote("previousCarrier", e.target.value)}
              placeholder="Previous carrier"
              required={isEnrolled}
            />
          </label>

          <label>
            New Carrier
            <select
              disabled={!enrollOk || isSaving}
              value={notes.carrierName}
              onChange={(e) => updateNote("carrierName", e.target.value)}
              required={isEnrolled}
            >
              <option value="">Select</option>
              {INTAKE_CARRIER_OPTIONS.map((carrier) => (
                <option key={carrier} value={carrier}>{carrier}</option>
              ))}
            </select>
          </label>

          <label>
            Plan Name
            <input
              disabled={!enrollOk || isSaving}
              value={notes.planName}
              onChange={(e) => updateNote("planName", e.target.value)}
              placeholder="Plan name"
            />
          </label>

          <label>
            Plan ID
            <input
              disabled={!enrollOk || isSaving}
              value={notes.planId}
              onChange={(e) => updateNote("planId", e.target.value)}
              placeholder="HMO/PPO ID"
            />
          </label>

          <label>
            Plan / Enrollment Code
            <input
              disabled={!enrollOk || isSaving}
              value={notes.enrollmentCode}
              onChange={(e) => updateNote("enrollmentCode", e.target.value)}
              placeholder="Enrollment code"
              required={isEnrolled}
            />
          </label>

          <label>
            Monthly Premium
            <input
              disabled={!enrollOk || isSaving}
              value={notes.premium}
              onChange={(e) => updateNote("premium", e.target.value)}
              onBlur={(e) => updateNote("premium", formatPremiumInput(e.target.value))}
              placeholder="$0.00"
              required={isEnrolled}
            />
          </label>

          <label>
            Sunfire Code
            <input
              disabled={!enrollOk || isSaving}
              value={notes.sunfireCode}
              onChange={(e) => updateNote("sunfireCode", e.target.value)}
              placeholder="Sunfire code"
            />
          </label>

          <label>
            Effective Date
            <input
              type="date"
              disabled={!enrollOk || isSaving}
              value={notes.effectiveDate}
              onChange={(e) => handleEffectiveDateChange(e.target.value)}
              required={isEnrolled}
            />
          </label>

          <label>
            60 Day Follow-Up Date
            <input
              type="date"
              disabled={!enrollOk || isSaving}
              value={notes.sixtyDayDate}
              onChange={(e) => updateNote("sixtyDayDate", e.target.value)}
              required={isEnrolled}
            />
          </label>

          <label>
            Confirmation Number
            <input
              disabled={!enrollOk || isSaving}
              value={notes.confirmation}
              onChange={(e) => updateNote("confirmation", e.target.value)}
              placeholder="Confirmation / reference #"
            />
          </label>

          <label>
            SEP
            {yesNoControl({
              name: "sep",
              value: notes.sep,
              disabled: !enrollOk || isSaving,
              onChange: (value) => updateNote("sep", value),
            })}
          </label>

          <label>
            Agency
            <select
              disabled={!enrollOk || isSaving}
              value={notes.agency}
              onChange={(e) => updateNote("agency", e.target.value)}
              required={isEnrolled}
            >
              <option value="">Select</option>
              {AGENCY_OPTIONS.map((agency) => (
                <option key={agency} value={agency}>{agency}</option>
              ))}
            </select>
          </label>

          <label>
            Writing Agent
            <select
              disabled={!enrollOk || isSaving}
              value={notes.writingAgent}
              onChange={(e) => updateNote("writingAgent", e.target.value)}
              required={isEnrolled}
            >
              <option value="">Select</option>
              {WRITING_AGENT_OPTIONS.map((agent) => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
          </label>

          <label>
            HRA Completed
            {yesNoControl({
              name: "hra",
              value: notes.hra,
              disabled: !enrollOk || isSaving,
              onChange: (value) => updateNote("hra", value),
            })}
          </label>

          {(notes.hra || "No") === "Yes" && (
            <label>
              HRA Date
              <input
                type="date"
                disabled={!enrollOk || isSaving}
                value={notes.hraDate}
                onChange={(e) => updateNote("hraDate", e.target.value)}
              />
            </label>
          )}
        </div>
      </div>

      <label>
        Agent Notes (optional)
        <textarea
          disabled={!enrollOk || isSaving}
          value={notes.agentNotes}
          onChange={(e) => updateNote("agentNotes", e.target.value)}
          placeholder="Disposition notes, callback details, carrier follow-up..."
          rows={3}
        />
      </label>

      {enrollOk && (
        <div className="post-call-save-row">
          <button
            type="button"
            className="primary"
            onClick={handleSaveWrapUp}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Call Record"}
          </button>

          {saveState.status !== "idle" && (
            <span className={statusClass}>{saveState.message}</span>
          )}

          {saveState.webhookStatus === "pending" && (
            <span className="post-call-webhook-status">GHL pending...</span>
          )}
          {saveState.webhookStatus === "sent" && (
            <span className="post-call-webhook-status is-sent">Sent to GHL ✓</span>
          )}
        </div>
      )}

      {!enrollOk && (
        <LockText>Locked until Enrollment is marked submitted.</LockText>
      )}
      {enrollOk && (
        <p className="ok">
          Flow complete. Save the call record to persist transcript, outcome, and compliance scoring.
        </p>
      )}
    </section>
  );
});
