import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, ShieldPlus } from "lucide-react";
import { useAppAuth } from "../../context/AuthContext";
import { getAuthSupabase } from "../../lib/supabase";
import { useTenantConfig } from "../../hooks/useTenantConfig";
import { getActiveSessionMetadata } from "../../hooks/useSessionTracker";

const SCRIPT_LINES = {
  HIP_AFTER_MA:
    "Before we wrap up, I want to make sure you are protected if you ever have a hospital stay. Your Medicare Advantage plan has out-of-pocket costs for hospitalizations. A Hospital Protection plan pays you a fixed daily benefit in cash if you are admitted, which helps cover those costs. It is usually around $25-$60/month. Can I show you the details?",
  HIP_AFTER_MEDSUP_HDG:
    "Since you chose the High Deductible Plan G, I would recommend pairing it with a Hospital Protection plan. If you are hospitalized, it pays a daily cash benefit that offsets your deductible. Most clients in your situation add this. It is about $25-$60/month.",
  HIP_AFTER_MEDSUP_STANDARD:
    "One more thing before we finish. Even with Plan G or N, a hospital stay can come with costs Medicare does not fully cover, especially observation stays. A Hospital Protection plan pays you cash if you are admitted. It is a small monthly premium for significant protection.",
  DENTAL_AFTER_MOH:
    "Since you are with Mutual of Omaha, you actually qualify for a 15% discount if you bundle their dental coverage with your Medigap plan. Would you like me to show you what that looks like?",
  DENTAL_GENERAL:
    "Do you currently have dental and vision coverage? A lot of our clients add standalone dental and vision plans since Medicare does not cover routine dental or eye exams.",
  CANCER_CI:
    "A Cancer and Critical Illness plan pays cash directly to you if a major diagnosis happens. Clients use that money for deductibles, travel, recovery costs, or household bills while they focus on treatment.",
  ACCIDENT:
    "An Accident plan pays cash benefits for covered injuries, urgent care, ER visits, and follow-up care. It is a practical add-on for clients using private health coverage with higher out-of-pocket exposure.",
};

function isMutualOfOmaha(carrier) {
  const normalized = String(carrier || "").trim().toLowerCase();
  return normalized === "moh" || normalized.includes("mutual of omaha");
}

function getRecommendations({ primaryProduct, primaryCarrier, clientAge, isHDPG }) {
  const age = Number(clientAge);
  const senior = Number.isFinite(age) ? age >= 60 : primaryProduct !== "U65";

  if (primaryProduct === "MA") {
    return [
      {
        product: "HIP",
        title: "Hospital Indemnity",
        pitch: "Cash benefit for MA hospital copays and observation stays.",
        premiumRange: senior ? "$25-$60/mo" : "$20-$45/mo",
        script: SCRIPT_LINES.HIP_AFTER_MA,
      },
      {
        product: "Dental_Vision",
        title: "Dental / Vision",
        pitch: "Routine dental and eye care are common Medicare gaps.",
        premiumRange: "$25-$55/mo",
        script: SCRIPT_LINES.DENTAL_GENERAL,
      },
      {
        product: "Cancer_CI",
        title: "Cancer / CI",
        pitch: "Cash recovery benefit for major diagnosis exposure.",
        premiumRange: "$20-$70/mo",
        script: SCRIPT_LINES.CANCER_CI,
      },
    ];
  }

  if (primaryProduct === "MedSup") {
    const dentalScript = isMutualOfOmaha(primaryCarrier)
      ? SCRIPT_LINES.DENTAL_AFTER_MOH
      : SCRIPT_LINES.DENTAL_GENERAL;
    const dentalPitch = isMutualOfOmaha(primaryCarrier)
      ? "MOH Med Supp clients may qualify for a 15% dental bundle discount."
      : "Standalone dental helps cover routine services Medicare misses.";

    return [
      {
        product: "HIP",
        title: "Hospital Protection",
        pitch: isHDPG
          ? "Offsets the HDG deductible with cash benefits if hospitalized."
          : "Adds cash protection for hospital and observation-stay exposure.",
        premiumRange: "$25-$60/mo",
        script: isHDPG
          ? SCRIPT_LINES.HIP_AFTER_MEDSUP_HDG
          : SCRIPT_LINES.HIP_AFTER_MEDSUP_STANDARD,
      },
      {
        product: "Dental",
        title: "Dental",
        pitch: dentalPitch,
        premiumRange: "$25-$50/mo",
        script: dentalScript,
      },
      {
        product: "Cancer_CI",
        title: "Cancer / CI",
        pitch: "Cash benefit for diagnosis and recovery costs.",
        premiumRange: "$20-$70/mo",
        script: SCRIPT_LINES.CANCER_CI,
      },
    ];
  }

  if (primaryProduct === "U65") {
    return [
      {
        product: "Dental_Vision",
        title: "Dental / Vision",
        pitch: "Routine dental and vision coverage for private-plan clients.",
        premiumRange: "$25-$55/mo",
        script: SCRIPT_LINES.DENTAL_GENERAL,
      },
      {
        product: "Accident",
        title: "Accident",
        pitch: "Cash benefits for injury-related out-of-pocket exposure.",
        premiumRange: "$15-$45/mo",
        script: SCRIPT_LINES.ACCIDENT,
      },
      {
        product: "Cancer_CI",
        title: "Cancer / CI",
        pitch: "Cash diagnosis benefit for financial disruption risk.",
        premiumRange: "$20-$70/mo",
        script: SCRIPT_LINES.CANCER_CI,
      },
    ];
  }

  return [];
}

export default function CrossSellTrigger({
  primaryProduct,
  primaryCarrier = "",
  clientAge = "",
  clientState = "",
  enrolled = false,
  acknowledged = false,
  isHDPG = false,
  onAcknowledged,
}) {
  const { getToken } = useAppAuth();
  const { tenantId } = useTenantConfig();
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const recommendations = useMemo(
    () =>
      getRecommendations({
        primaryProduct,
        primaryCarrier,
        clientAge,
        isHDPG,
      }),
    [clientAge, isHDPG, primaryCarrier, primaryProduct]
  );

  const resolveToken = useCallback(async () => {
    try {
      const token = await getToken({ template: "supabase" });
      if (token) return token;
    } catch {
      // Fall back to default Clerk token.
    }
    return getToken();
  }, [getToken]);

  const logRows = useCallback(
    async (rows) => {
      if (!rows.length) return;
      const token = await resolveToken();
      if (!token) return;
      const session = getActiveSessionMetadata();
      const sb = getAuthSupabase(token);
      const payload = rows.map((row) => ({
        tenant_id: tenantId || undefined,
        agent_id: session.agentId || null,
        call_transcript_id: session.transcriptId || null,
        session_id: session.sessionId || null,
        primary_product: primaryProduct,
        primary_carrier: primaryCarrier || null,
        cross_sell_product: row.product,
        presented: row.presented,
        client_response: row.clientResponse || null,
        decline_reason: row.declineReason || null,
        metadata: {
          client_age: clientAge || null,
          client_state: clientState || null,
          is_hdg: Boolean(isHDPG),
        },
      }));

      const { error } = await sb.from("cross_sell_attempts").insert(payload);
      if (error) throw error;
    },
    [
      clientAge,
      clientState,
      isHDPG,
      primaryCarrier,
      primaryProduct,
      resolveToken,
      tenantId,
    ]
  );

  const acknowledge = useCallback(
    async (payload) => {
      setSaving(true);
      setStatusMessage("");
      try {
        await logRows(payload.rows);
        onAcknowledged?.(payload);
        setStatusMessage("Cross-sell prompt acknowledged.");
      } catch (error) {
        console.error("[CrossSellTrigger] log failed:", error);
        onAcknowledged?.({ ...payload, logError: error.message });
        setStatusMessage("Acknowledged locally. Remote logging needs the latest migration.");
      } finally {
        setSaving(false);
      }
    },
    [logRows, onAcknowledged]
  );

  const handlePresent = (item) => {
    setSelectedProduct(item);
    void acknowledge({
      status: "presented",
      product: item.product,
      script: item.script,
      rows: [{ product: item.product, presented: true }],
    });
  };

  const handleDeclineAll = () => {
    const reason = declineReason.trim();
    if (!reason) {
      setStatusMessage("Decline reason is required.");
      return;
    }
    void acknowledge({
      status: "declined_all",
      declineReason: reason,
      rows: recommendations.map((item) => ({
        product: item.product,
        presented: false,
        clientResponse: "declined",
        declineReason: reason,
      })),
    });
  };

  if (!enrolled || acknowledged || !recommendations.length) {
    return null;
  }

  return (
    <div className="sf-panel sf-cross-sell-panel">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--amber" />
        <span>Mandatory Cross-Sell</span>
      </div>
      <p className="sf-muted">
        Present one ancillary option before closing, or document why the client
        declined all recommendations.
      </p>

      <div className="sf-card-list">
        {recommendations.map((item) => (
          <article key={item.product} className="sf-mini-card">
            <div className="sf-mini-card-title-row">
              <ShieldPlus size={13} />
              <strong>{item.title}</strong>
            </div>
            <p>{item.pitch}</p>
            <div className="sf-meta-row">
              <span>{item.premiumRange}</span>
              {clientState ? <span>{clientState}</span> : null}
            </div>
            <button
              type="button"
              className="sf-action-button"
              onClick={() => handlePresent(item)}
              disabled={saving}
            >
              Present to Client
            </button>
          </article>
        ))}
      </div>

      {selectedProduct ? (
        <div className="sf-script-box">
          <div className="sf-script-label">
            <CheckCircle2 size={12} />
            Script loaded
          </div>
          <p>{selectedProduct.script}</p>
        </div>
      ) : null}

      <div className="sf-decline-box">
        <label>
          Client Declined All Reason
          <input
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
            placeholder="Required if no product is presented"
          />
        </label>
        <button
          type="button"
          className="sf-secondary-button"
          onClick={handleDeclineAll}
          disabled={saving}
        >
          Client Declined All
        </button>
      </div>

      {statusMessage ? <p className="sf-status-text">{statusMessage}</p> : null}
    </div>
  );
}
