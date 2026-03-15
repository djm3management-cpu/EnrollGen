import React, { useState } from "react";
import { AlertTriangle, Radio, ChevronDown, ChevronUp, MapPin, Clock, ExternalLink } from "lucide-react";

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function carrierColor(c) {
  const map = {
    UHC: "#003DA5", Humana: "#4CAF50", Aetna: "#7B2D8E",
    BCBS: "#0072CE", Wellcare: "#00796B", CMS: "#E8002D",
    Cigna: "#F58220", Molina: "#1B5E20", Devoted: "#FF6F00",
  };
  return map[c] || "#666";
}

export function FemaFeed({ femaDisasters = [], femaSource = "unknown", bulletins = [] }) {
  const [expandedItems, setExpandedItems] = useState({});
  const [showAllFema, setShowAllFema] = useState(false);
  const [showAllBulletins, setShowAllBulletins] = useState(false);

  const sortedDisasters = [...femaDisasters]
    .sort((a, b) => new Date(b.declaredDate) - new Date(a.declaredDate));

  const displayDisasters = showAllFema ? sortedDisasters : sortedDisasters.slice(0, 4);
  const displayBulletins = showAllBulletins ? bulletins : bulletins.slice(0, 4);

  const toggleItem = (id) =>
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="fema-feed-hz">
      {/* Top bar: title + source */}
      <div className="fema-feed-hz-bar">
        <div className="fema-feed-title">
          <Radio size={13} className="fema-feed-pulse" />
          <span>FEMA & Carrier Feed</span>
        </div>
        <div className="fema-feed-source">
          {femaSource === "live" && <span className="fema-dot live" />}
          {femaSource === "fallback" && <span className="fema-dot fallback" />}
          <span>{femaSource === "live" ? "Live" : femaSource === "fallback" ? "Cached" : ""}</span>
          <span className="fema-feed-hz-footnote">Updated weekly</span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="fema-feed-hz-columns">
        {/* Left: FEMA declarations */}
        <div className="fema-feed-hz-col">
          <div className="fema-feed-section-label">
            <AlertTriangle size={11} />
            Disaster Declarations
            {sortedDisasters.length > 0 && (
              <span className="fema-feed-badge">{sortedDisasters.length}</span>
            )}
          </div>

          <div className="fema-feed-hz-items">
            {displayDisasters.length === 0 && (
              <div className="fema-feed-hz-empty">No active FEMA data loaded yet — search a zip or click a state</div>
            )}
            {displayDisasters.map((d) => {
              const isOpen = expandedItems[d.id];
              const hasIA = d.iaProgram || d.ihProgram;
              return (
                <div
                  key={d.id}
                  className={`fema-feed-item ${hasIA ? "has-sep" : "pa-only"}`}
                >
                  <button className="fema-feed-item-header" onClick={() => toggleItem(d.id)}>
                    <div className="fema-feed-item-top">
                      <span className={`fema-feed-type ${hasIA ? "ia" : "pa"}`}>
                        {hasIA ? "SEP ACTIVE" : "PA ONLY"}
                      </span>
                      <span className="fema-feed-state">{d.state}</span>
                      <span className="fema-feed-time">{timeAgo(d.declaredDate)}</span>
                    </div>
                    <div className="fema-feed-item-title">{d.title}</div>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {isOpen && (
                    <div className="fema-feed-item-body">
                      <div className="fema-feed-detail">
                        <Clock size={10} />
                        <span>Declared {d.declaredDate}</span>
                        {d.isOngoing && <span className="fema-ongoing-tag">ONGOING</span>}
                      </div>
                      <div className="fema-feed-detail">
                        <MapPin size={10} />
                        <span>{d.counties.length} {d.counties.length === 1 ? "county" : "counties"}: {d.counties.slice(0, 8).join(", ")}{d.counties.length > 8 ? ` +${d.counties.length - 8} more` : ""}</span>
                      </div>
                      {hasIA && d.sepEndDate && (
                        <div className="fema-feed-detail">
                          <span className="fema-feed-sep-window">
                            SEP Window → {d.isOngoing ? "Open (ongoing)" : d.sepEndDate}
                          </span>
                        </div>
                      )}
                      <div className="fema-feed-id">{d.id}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {sortedDisasters.length > 4 && (
              <button className="fema-feed-show-all" onClick={() => setShowAllFema(!showAllFema)}>
                {showAllFema ? "Show fewer" : `Show all ${sortedDisasters.length}`}
              </button>
            )}
          </div>
        </div>

        {/* Right: Carrier bulletins */}
        <div className="fema-feed-hz-col">
          <div className="fema-feed-section-label">
            <ExternalLink size={11} />
            Carrier & CMS Bulletins
          </div>

          <div className="fema-feed-hz-items">
            {displayBulletins.map((b, i) => {
              const isOpen = expandedItems[`bulletin-${i}`];
              return (
                <div key={i} className="fema-feed-bulletin">
                  <button
                    className="fema-feed-item-header"
                    onClick={() => toggleItem(`bulletin-${i}`)}
                  >
                    <div className="fema-feed-item-top">
                      <span
                        className="fema-feed-carrier-tag"
                        style={{ borderColor: carrierColor(b.carrier), color: carrierColor(b.carrier) }}
                      >
                        {b.carrier}
                      </span>
                      {b.states.length > 0 && (
                        <span className="fema-feed-states">{b.states.join(", ")}</span>
                      )}
                      <span className="fema-feed-time">{timeAgo(b.date)}</span>
                    </div>
                    <div className="fema-feed-item-title">{b.title}</div>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {isOpen && (
                    <div className="fema-feed-item-body">
                      <p>{b.body}</p>
                      {b.link && (
                        <a
                          href={b.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="fema-feed-link"
                        >
                          Source <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {bulletins.length > 4 && (
              <button className="fema-feed-show-all" onClick={() => setShowAllBulletins(!showAllBulletins)}>
                {showAllBulletins ? "Show fewer" : `Show all ${bulletins.length}`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
