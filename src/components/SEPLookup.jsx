import { AlertTriangle, Filter, X, Map, MapPin } from "lucide-react";
import { useSEPLookup } from "../hooks/useSEPLookup";
import { SearchBar } from "./sep/SearchBar";
import { StatsBar } from "./sep/StatsBar";
import { SEPCard, ProductBadge } from "./sep/SEPCard";
import { PlanTable } from "./sep/PlanTable";
import { StateMap } from "./sep/StateMap";
import { CountyGrid } from "./sep/CountyGrid";
import { FemaFeed } from "./sep/FemaFeed";
import SEPResultsPanel, { SEP_FINDER_FULL_DISCLAIMER } from "./SEPResultsPanel";
import "../SEPLookupTool.css";

export default function SEPLookupTool() {
  const s = useSEPLookup();

  const handleCountySelect = (county) => {
    s.setSelectedCounty(county);
    s.loadPlansForCounty(s.state, county);
  };

  const showPlans = s.activeTab === "plans" &&
    (s.searchedZip || (s.selectedState && s.selectedCounty && s.plans));
  const showSeps = s.activeTab === "seps" && s.results;

  return (
    <div className="sep-tool">
      <div className="sep-tool-inner">

        {/* ═══ FEMA & Carrier Feed — top banner ═══ */}
        <FemaFeed
          femaDisasters={s.femaDisasters}
          femaSource={s.femaSource}
          liveNews={s.liveNews}
          bulletins={s.bulletins}
        />

        {/* Search */}
        <SearchBar
          zip={s.zip}
          setZip={s.setZip}
          handleSearch={s.handleSearch}
          handleKeyDown={s.handleKeyDown}
          isValidZip={s.isValidZip}
          loading={s.loading}
          inputRef={s.inputRef}
          hasResults={!!s.results || !!s.selectedState}
        />

        {(s.sepFinderZip || s.sepFinderLoading || s.sepFinderError || s.sepFinderResult) && (
          <div className="sep-intelligence-seps">
            <SEPResultsPanel
              zip={s.sepFinderZip || s.zip}
              result={s.sepFinderResult}
              loading={s.sepFinderLoading}
              error={s.sepFinderError}
              onRefresh={s.handleSearch}
              refreshDisabled={!s.isValidZip}
              className="sep-finder-panel--wide"
              disclaimer={SEP_FINDER_FULL_DISCLAIMER}
            />
          </div>
        )}

        {/* Loading */}
        {s.loading && (
          <div className="sep-loading">
            <div className="sep-spinner" />
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>
              Scanning sources for {s.zip}...
            </div>
            <div className="muted mono" style={{ marginTop: 4, letterSpacing: "0.06em" }}>
              FEMA • CMS • Medicare.gov • Carrier Networks
            </div>
          </div>
        )}

        {/* ═══ Map — always full-width ═══ */}
        {!s.loading && (
          <div className="sep-map-section">
            {!s.hasView && (
              <div className="sep-map-landing-label">
                <Map size={14} />
                <span>Click a state to explore plans & SEPs</span>
              </div>
            )}

            {s.hasView && (
              <div className="sep-map-active-label">
                <MapPin size={13} />
                <span>{s.selectedState || s.state}</span>
                {s.selectedCounty && (
                  <span className="sep-map-county-tag">{s.selectedCounty} County</span>
                )}
                <button
                  className="sep-map-reset"
                  onClick={() => s.handleStateClick(null)}
                >
                  <X size={12} /> Reset
                </button>
              </div>
            )}

            <StateMap
              selectedState={s.selectedState || s.state}
              onStateClick={s.handleStateClick}
            />

            {!s.hasView && (
              <div className="sep-map-landing-hint">
                Or enter a zip code above for carrier & SEP data
              </div>
            )}
          </div>
        )}

        {/* ═══ Content below map ═══ */}
        {s.hasView && !s.loading && (
          <div className="sep-below-map">
            {/* County grid (state-click or zip) */}
            {s.selectedState && (s.countyLoading || s.countyList.length > 0) && (
              <CountyGrid
                state={s.selectedState || s.state}
                counties={s.countyList}
                planCounts={s.countyPlanCounts}
                selectedCounty={s.selectedCounty}
                onCountySelect={handleCountySelect}
                loading={s.countyLoading}
              />
            )}

            {/* Stats bar (zip search only) */}
            {s.searchedZip && s.results && (
              <StatsBar
                searchedZip={s.searchedZip}
                state={s.state}
                selectedCounty={s.selectedCounty}
                filtered={s.filtered}
                plans={s.plans}
                femaActive={s.femaActive}
                carriers={s.carriers}
                filteredPlans={s.filteredPlans}
                activeTab={s.activeTab}
                setActiveTab={s.setActiveTab}
              />
            )}

            {/* Tab bar for state-click flow (no zip) */}
            {!s.searchedZip && s.selectedState && (
              <div className="sep-tab-bar">
                {s.selectedCounty && s.plans && s.plans.length > 0 && (
                  <button
                    className={`tab${s.activeTab === "plans" ? " active" : ""}`}
                    onClick={() => s.setActiveTab("plans")}
                  >
                    Plans ({s.filteredPlans.length})
                  </button>
                )}
                {s.results && (
                  <button
                    className={`tab${s.activeTab === "seps" ? " active" : ""}`}
                    onClick={() => s.setActiveTab("seps")}
                  >
                    SEPs ({s.filtered?.length || 0})
                  </button>
                )}
              </div>
            )}

            {/* Plans Tab */}
            {showPlans && (
              <>
                <PlanTable
                  planFilterCarrier={s.planFilterCarrier}
                  setPlanFilterCarrier={s.setPlanFilterCarrier}
                  planFilterType={s.planFilterType}
                  setPlanFilterType={s.setPlanFilterType}
                  planFilterSnp={s.planFilterSnp}
                  setPlanFilterSnp={s.setPlanFilterSnp}
                  planSearch={s.planSearch}
                  setPlanSearch={s.setPlanSearch}
                  filteredPlans={s.filteredPlans}
                  planCarrierOpts={s.planCarrierOpts}
                  planTypeOpts={s.planTypeOpts}
                  expandedPlans={s.expandedPlans}
                  setExpandedPlans={s.setExpandedPlans}
                />

                {/* Carriers grid (zip search only) */}
                {s.results && s.carriers.length > 0 && (
                  <div className="card" style={{ marginTop: 28 }}>
                    <h2>Carriers in {s.searchedZip} ({s.state})</h2>
                    <div className="sep-carrier-grid">
                      {s.carriers.map((c) => (
                        <div key={c.key} className="sep-carrier-item" style={{ borderColor: `${c.color}30` }}>
                          <div className="sep-carrier-stripe" style={{ background: c.color }} />
                          {c.logo ? (
                            <img
                              src={c.logo}
                              alt={c.abbr}
                              className="sep-carrier-logo"
                              onError={(e) => { e.target.style.display = "none"; }}
                            />
                          ) : null}
                          <div className="sep-carrier-name">{c.abbr}</div>
                          <div className="sep-carrier-full-name">{c.name}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                            {c.products.map((p) => <ProductBadge key={p} product={p} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* No county selected prompt */}
            {!s.searchedZip && s.selectedState && !s.selectedCounty && s.activeTab === "plans" && (
              <div className="sep-select-county-prompt">
                <MapPin size={18} />
                <div>
                  <div className="sep-select-county-title">Select a county to view plans</div>
                  <div className="sep-select-county-sub">
                    Medicare plan availability is county-specific — pick one above to load {s.selectedState} plans from CMS.
                  </div>
                </div>
              </div>
            )}

            {/* SEPs Tab */}
            {showSeps && (
              <>
                <div className="card sep-filter-bar">
                  <span className="sep-filter-label">
                    <Filter size={16} /> Filter
                  </span>
                  <select value={s.filterCategory} onChange={(e) => s.setFilterCategory(e.target.value)}>
                    <option value="all">All Categories</option>
                    {s.allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={s.filterProduct} onChange={(e) => s.setFilterProduct(e.target.value)}>
                    <option value="all">All Products</option>
                    {s.allProducts.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {(s.filterCategory !== "all" || s.filterProduct !== "all") && (
                    <button className="undo-btn" onClick={() => { s.setFilterCategory("all"); s.setFilterProduct("all"); }}>
                      <X size={14} /> Clear
                    </button>
                  )}
                </div>

                {s.femaActive.length > 0 && (
                  <div className="card sep-fema-alert">
                    <div style={{ color: "var(--accent-red)", flexShrink: 0, marginTop: 2 }}>
                      <AlertTriangle size={16} />
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
                        Active FEMA Disaster Declaration{s.femaActive.length > 1 ? "s" : ""} in This Area
                      </div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {s.femaActive.map((f) => f.event).join("; ")} — 60-day SEP applies for affected beneficiaries.
                      </div>
                    </div>
                  </div>
                )}

                <div className="flow">
                  {s.filtered && s.filtered.length > 0 ? (
                    s.filtered.map((sep) => (
                      <SEPCard
                        key={sep.id}
                        sep={sep}
                        isExpanded={!!s.expanded[sep.id]}
                        onToggle={() => s.setExpanded((prev) => ({ ...prev, [sep.id]: !prev[sep.id] }))}
                      />
                    ))
                  ) : (
                    <div className="text-center muted" style={{ padding: "48px 24px" }}>
                      <div style={{ fontSize: 16, fontWeight: 600 }}>No SEPs match current filters</div>
                      <div style={{ fontSize: 13, marginTop: 8 }}>Try adjusting filters above.</div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Disclaimer */}
            <div className="sep-disclaimer">
              <p>
                <strong>Disclaimer:</strong> FEMA disaster data is fetched live from the OpenFEMA API with verified
                fallback data. Plan data is sourced from CMS Landscape Files for CY2026 (138K rows via Supabase,
                county-level precision). Premiums, benefits, and service areas may vary — always verify on Medicare.gov.
                For agent/broker use only.
                {s.femaSource !== "unknown" && (
                  <span className={`sep-fema-source-badge ${s.femaSource === "live" ? "live" : "fallback"}`}>
                    {s.femaSource === "live" ? "Live FEMA" : "Fallback FEMA"}
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
