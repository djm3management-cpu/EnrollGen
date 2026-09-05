import { useEffect, useMemo, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { BarChart3, Plus } from "lucide-react";
import { fetchMedSupRates, isCsgEnabled } from "../../services/rateQuoteService";
import { fetchCarrierProfiles } from "../../services/salesForumReferenceService";
import { useTenantConfig } from "../../hooks/useTenantConfig";

function currency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return `$${amount.toFixed(2)}`;
}

function normalizeCarrier(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function carrierKey(profile) {
  return normalizeCarrier(profile.carrier_code || profile.carrier_name);
}

function mapProfiles(profiles = []) {
  const map = new Map();
  profiles.forEach((profile) => {
    map.set(carrierKey(profile), profile);
    map.set(normalizeCarrier(profile.carrier_name), profile);
  });
  return map;
}

function findProfile(profileMap, rate) {
  return (
    profileMap.get(normalizeCarrier(rate.carrierCode)) ||
    profileMap.get(normalizeCarrier(rate.carrier)) ||
    null
  );
}

function findRtsAppointment(rows, rate, profile) {
  const candidates = [rate.carrier, rate.carrierCode, profile?.carrier_name, profile?.carrier_code]
    .map(normalizeCarrier)
    .filter(Boolean);
  const matches = rows.filter((row) => {
    const productLine = String(row.product_line || "").toLowerCase();
    const isMedSupLine =
      productLine.includes("supp") ||
      productLine.includes("medsup") ||
      productLine === "medicare" ||
      productLine === "health";
    if (!isMedSupLine) return false;
    const carrier = normalizeCarrier(row.carrier);
    return candidates.some(
      (candidate) =>
        carrier === candidate ||
        (candidate.length > 4 && carrier.includes(candidate)) ||
      (carrier.length > 4 && candidate.includes(carrier))
    );
  });
  return matches.find((row) => isReadyToSell(row.status)) || matches[0] || null;
}

function isReadyToSell(status) {
  return ["active", "rts", "complete"].includes(String(status || "").trim().toLowerCase());
}

function discountSummary(profile) {
  if (!profile) return "Unknown";
  if (Array.isArray(profile.household_discount_tiers) && profile.household_discount_tiers.length) {
    return profile.household_discount_tiers.map((tier) => tier.tier).join(" / ");
  }
  return profile.dental_bundle_discount_pct
    ? `${profile.dental_bundle_discount_pct}% dental bundle`
    : "None listed";
}

function buildDifferentiator(rates, profileMap) {
  if (rates.length < 2) return "";
  const top = rates.slice(0, 3);
  const moh = top.find((rate) => normalizeCarrier(rate.carrier).includes("mutualofomaha") || rate.carrierCode === "MOH");
  const wlb = top.find((rate) => normalizeCarrier(rate.carrier).includes("wellabe") || rate.carrierCode === "WLB");
  if (!moh || !wlb) return "";

  const delta = Math.abs(Number(moh.monthlyPremium) - Number(wlb.monthlyPremium));
  if (!Number.isFinite(delta) || delta > 5) return "";
  const mohProfile = findProfile(profileMap, moh);
  const wlbProfile = findProfile(profileMap, wlb);
  const mohPoints = [
    mohProfile?.has_policy_fee === false ? "no policy fee" : "",
    mohProfile?.rate_guarantee_months ? `${mohProfile.rate_guarantee_months}-month rate guarantee` : "",
    Array.isArray(mohProfile?.household_discount_tiers) ? "7-12% household discount" : "",
  ].filter(Boolean).join(", ");
  const wlbPoint = wlbProfile?.accel_uw_description || "accelerated underwriting";
  return `MOH and Wellabe are within ${currency(delta)}/mo. MOH: ${mohPoints || "carrier differentiators available"}. Wellabe: ${wlbPoint}.`;
}

export default function RateComparisonPanel({
  zipCode = "",
  age = "",
  gender = "",
  tobaccoUse = "",
  planLetter = "G",
  onManualRateAdded,
}) {
  const { user } = useUser();
  const { supabaseClient } = useTenantConfig();
  const [ratesState, setRatesState] = useState({
    source: isCsgEnabled() ? "loading" : "manual",
    rates: [],
    message: isCsgEnabled() ? "" : "CSG integration pending activation",
  });
  const [profiles, setProfiles] = useState([]);
  const [rtsAppointments, setRtsAppointments] = useState([]);
  const [manualRate, setManualRate] = useState({ carrier: "", monthlyPremium: "" });

  useEffect(() => {
    let cancelled = false;
    fetchCarrierProfiles({ productLine: "MedSup" })
      .then((rows) => {
        if (!cancelled) setProfiles(rows);
      })
      .catch((error) => {
        console.error("[RateComparisonPanel] carrier profiles:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!supabaseClient || !user?.id) {
      setRtsAppointments([]);
      return undefined;
    }
    let active = true;
    const loadAppointments = async () => {
      const { data, error } = await supabaseClient
        .from("carrier_rts")
        .select("carrier, product_line, status")
        .eq("clerk_user_id", user.id);
      if (active && !error) setRtsAppointments(data || []);
    };
    loadAppointments();
    const channel = supabaseClient
      .channel(`medsup-rts-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "carrier_rts" },
        loadAppointments
      )
      .subscribe();
    return () => {
      active = false;
      supabaseClient.removeChannel(channel);
    };
  }, [supabaseClient, user?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!isCsgEnabled()) return undefined;
    setRatesState((current) => ({ ...current, source: "loading" }));
    fetchMedSupRates({ zipCode, age, gender, tobaccoUse, planLetter }).then((result) => {
      if (!cancelled) setRatesState(result);
    });
    return () => {
      cancelled = true;
    };
  }, [age, gender, planLetter, tobaccoUse, zipCode]);

  const profileMap = useMemo(() => mapProfiles(profiles), [profiles]);
  const sortedRates = useMemo(
    () =>
      ratesState.rates
        .slice()
        .sort((a, b) => {
          const left = Number.isFinite(Number(a.monthlyPremium)) ? Number(a.monthlyPremium) : Infinity;
          const right = Number.isFinite(Number(b.monthlyPremium)) ? Number(b.monthlyPremium) : Infinity;
          return left - right;
        }),
    [ratesState.rates]
  );
  const differentiator = useMemo(
    () => buildDifferentiator(sortedRates, profileMap),
    [profileMap, sortedRates]
  );

  const addManualRate = () => {
    const amount = Number.parseFloat(String(manualRate.monthlyPremium).replace(/[^0-9.]/g, ""));
    if (!manualRate.carrier.trim() || !Number.isFinite(amount)) return;
    const next = {
      carrier: manualRate.carrier.trim(),
      planLetter,
      monthlyPremium: amount,
      annualPremium: amount * 12,
      ratingType: "",
      discountsAvailable: null,
    };
    setRatesState((current) => ({
      ...current,
      source: "manual",
      rates: [...current.rates, next],
    }));
    onManualRateAdded?.(next);
    setManualRate({ carrier: "", monthlyPremium: "" });
  };

  return (
    <div className="sf-panel">
      <div className="sf-panel-heading">
        <span className="sf-dot sf-dot--green" />
        <span>Rate Comparison</span>
      </div>

      {!isCsgEnabled() ? (
        <p className="sf-muted">
          Rate comparison available when CSG integration is activated. Enter
          competitive quotes manually for this call.
        </p>
      ) : ratesState.source === "loading" ? (
        <p className="sf-muted">Pulling carrier rates...</p>
      ) : null}

      <div className="sf-inline-form">
        <input
          value={manualRate.carrier}
          onChange={(event) => setManualRate((current) => ({ ...current, carrier: event.target.value }))}
          placeholder="Carrier"
        />
        <input
          value={manualRate.monthlyPremium}
          onChange={(event) => setManualRate((current) => ({ ...current, monthlyPremium: event.target.value }))}
          placeholder="$ / mo"
        />
        <button type="button" className="sf-icon-button" onClick={addManualRate} title="Add manual quote">
          <Plus size={13} />
        </button>
      </div>

      {sortedRates.length ? (
        <>
          <div className="sf-rate-table" role="table" aria-label="Med Sup carrier rates">
            <div className="sf-rate-row sf-rate-row--head" role="row">
              <span>Rank</span>
              <span>Carrier</span>
              <span>Monthly</span>
              <span>HH Disc.</span>
              <span>Fee</span>
            </div>
            {sortedRates.map((rate, index) => {
              const profile = findProfile(profileMap, rate);
              const appointment = findRtsAppointment(rtsAppointments, rate, profile);
              const notContracted = !appointment || !isReadyToSell(appointment.status);
              return (
                <div
                  key={`${rate.carrier}-${rate.monthlyPremium}-${index}`}
                  className={`sf-rate-row${index < 3 ? " is-top" : ""}${
                    notContracted ? " is-not-contracted" : ""
                  }`}
                  role="row"
                >
                  <span>{index + 1}</span>
                  <span>
                    {rate.carrier}
                    {rate.ratingType || profile?.rating_type ? (
                      <small>{rate.ratingType || profile?.rating_type}</small>
                    ) : null}
                    {notContracted ? (
                      <small className="sf-rts-warning">
                        {appointment?.status || "Not contracted"}
                      </small>
                    ) : null}
                  </span>
                  <span>{currency(rate.monthlyPremium)}</span>
                  <span>{discountSummary(profile)}</span>
                  <span>{profile?.has_policy_fee ? currency(profile.policy_fee_amount) : "No"}</span>
                </div>
              );
            })}
          </div>
          {differentiator ? (
            <div className="sf-callout">
              <BarChart3 size={13} />
              <span>{differentiator}</span>
            </div>
          ) : null}
        </>
      ) : (
        <div className="sf-empty-state">No rates entered yet.</div>
      )}

      {ratesState.source === "error" ? (
        <p className="sf-status-text">{ratesState.message}</p>
      ) : null}
    </div>
  );
}
