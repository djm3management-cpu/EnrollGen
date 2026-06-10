import { useState } from "react";
import {
  AlertTriangle,
  Radio,
  ChevronDown,
  ChevronUp,
  MapPin,
  Clock,
  ExternalLink,
} from "lucide-react";

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now - d) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function carrierColor(carrier) {
  const map = {
    UHC: "#003DA5",
    Humana: "#4CAF50",
    Aetna: "#7B2D8E",
    BCBS: "#0072CE",
    Wellcare: "#00796B",
    Centene: "#00796B",
    Elevance: "#2563eb",
    Anthem: "#2563eb",
    CMS: "#E8002D",
    Cigna: "#F58220",
    Molina: "#1B5E20",
    Devoted: "#FF6F00",
    Kaiser: "#009688",
    Alignment: "#ec4899",
    Clover: "#22c55e",
    SCAN: "#f59e0b",
  };
  return map[carrier] || "#666";
}

function FeedLoading({ label }) {
  return (
    <div className="fema-feed-hz-loading">
      <span className="fema-feed-hz-spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function FemaFeed({
  femaDisasters = [],
  femaSource = "unknown",
  liveNews = [],
  bulletins = [],
  feedLoading = false,
}) {
  const [expandedItems, setExpandedItems] = useState({});
  const [showAllFema, setShowAllFema] = useState(false);
  const [showAllNews, setShowAllNews] = useState(false);
  const [showAllBulletins, setShowAllBulletins] = useState(false);
  const [rightTab, setRightTab] = useState("news");

  const sortedDisasters = [...femaDisasters].sort(
    (a, b) => new Date(b.declaredDate) - new Date(a.declaredDate)
  );

  const displayDisasters = showAllFema
    ? sortedDisasters
    : sortedDisasters.slice(0, 4);
  const displayNews = showAllNews
    ? liveNews
    : liveNews.slice(0, 6);
  const displayBulletins = showAllBulletins
    ? bulletins
    : bulletins.slice(0, 8);

  const toggleItem = (id) =>
    setExpandedItems((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderFeedItems = (items) =>
    items.map((item) => {
      const itemKey = item.sourceId || `${item.carrier}-${item.title}`;
      const isOpen = expandedItems[itemKey];

      return (
        <div key={itemKey} className="fema-feed-bulletin">
          <button
            className="fema-feed-item-header"
            onClick={() => toggleItem(itemKey)}
          >
            <div className="fema-feed-item-top">
              <span
                className="fema-feed-carrier-tag"
                style={{
                  borderColor: carrierColor(item.carrier),
                  color: carrierColor(item.carrier),
                }}
              >
                {item.carrier}
              </span>
              {item.kindLabel && (
                <span className={`fema-feed-kind ${item.kindTone || "news"}`}>
                  {item.kindLabel}
                </span>
              )}
              <span className="fema-feed-source-label">
                {item.sourceLabel}
              </span>
              {item.states?.length > 0 && (
                <span className="fema-feed-states">
                  {item.states.slice(0, 4).join(", ")}
                  {item.states.length > 4 ? ` +${item.states.length - 4}` : ""}
                </span>
              )}
              <span className="fema-feed-time">{timeAgo(item.date)}</span>
            </div>
            <div className="fema-feed-item-title">{item.title}</div>
            {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {isOpen && (
            <div className="fema-feed-item-body">
              <div className="fema-feed-detail">
                <ExternalLink size={10} />
                <span>
                  {item.sourceLabel}
                  {item.sourceHost ? ` | ${item.sourceHost}` : ""}
                </span>
              </div>
              <p>{item.body}</p>
              {item.link && (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fema-feed-link"
                >
                  Open source <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}
        </div>
      );
    });

  return (
    <div className="fema-feed-hz">
      <div className="fema-feed-hz-bar">
        <div className="fema-feed-title">
          <Radio size={13} className="fema-feed-pulse" />
          <span>FEMA, CMS & Carrier Feed</span>
        </div>
        <div className="fema-feed-source">
          {femaSource === "live" && <span className="fema-dot live" />}
          {femaSource === "fallback" && <span className="fema-dot fallback" />}
          <span>
            {femaSource === "live"
              ? "Live FEMA"
              : femaSource === "fallback"
                ? "Cached FEMA"
                : ""}
          </span>
          <span className="fema-feed-hz-footnote">Carrier sync daily</span>
        </div>
      </div>

      <div className="fema-feed-hz-columns">
        <div className="fema-feed-hz-col">
          <div className="fema-feed-section-label">
            <AlertTriangle size={11} />
            Disaster Declarations
            {sortedDisasters.length > 0 && (
              <span className="fema-feed-badge">{sortedDisasters.length}</span>
            )}
          </div>

          <div className="fema-feed-hz-items">
            {displayDisasters.length === 0 &&
              (feedLoading ? (
                <FeedLoading label="Loading FEMA declarations..." />
              ) : (
                <div className="fema-feed-hz-empty">
                  No active FEMA data loaded yet. Search a zip or click a state.
                </div>
              ))}
            {displayDisasters.map((disaster) => {
              const isOpen = expandedItems[disaster.id];
              const hasIA = disaster.iaProgram || disaster.ihProgram;
              return (
                <div
                  key={disaster.id}
                  className={`fema-feed-item ${hasIA ? "has-sep" : "pa-only"}`}
                >
                  <button
                    className="fema-feed-item-header"
                    onClick={() => toggleItem(disaster.id)}
                  >
                    <div className="fema-feed-item-top">
                      <span className={`fema-feed-type ${hasIA ? "ia" : "pa"}`}>
                        {hasIA ? "SEP Active" : "PA Only"}
                      </span>
                      <span className="fema-feed-state">{disaster.state}</span>
                      <span className="fema-feed-time">
                        {timeAgo(disaster.declaredDate)}
                      </span>
                    </div>
                    <div className="fema-feed-item-title">{disaster.title}</div>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {isOpen && (
                    <div className="fema-feed-item-body">
                      <div className="fema-feed-detail">
                        <Clock size={10} />
                        <span>Declared {disaster.declaredDate}</span>
                        {disaster.isOngoing && (
                          <span className="fema-ongoing-tag">ONGOING</span>
                        )}
                      </div>
                      <div className="fema-feed-detail">
                        <MapPin size={10} />
                        <span>
                          {disaster.counties.length}{" "}
                          {disaster.counties.length === 1 ? "county" : "counties"}
                          : {disaster.counties.slice(0, 8).join(", ")}
                          {disaster.counties.length > 8
                            ? ` +${disaster.counties.length - 8} more`
                            : ""}
                        </span>
                      </div>
                      {hasIA && disaster.sepEndDate && (
                        <div className="fema-feed-detail">
                          <span className="fema-feed-sep-window">
                            {`SEP Window -> ${
                              disaster.isOngoing
                                ? "Open (ongoing)"
                                : disaster.sepEndDate
                            }`}
                          </span>
                        </div>
                      )}
                      <div className="fema-feed-id">{disaster.id}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {sortedDisasters.length > 4 && (
              <button
                className="fema-feed-show-all"
                onClick={() => setShowAllFema(!showAllFema)}
              >
                {showAllFema ? "Show fewer" : `Show all ${sortedDisasters.length}`}
              </button>
            )}
          </div>
        </div>

        <div className="fema-feed-hz-col">
          <div className="fema-feed-stack">
            <div className="fema-feed-tabs">
              <button
                className={`fema-feed-tab${rightTab === "news" ? " active" : ""}`}
                onClick={() => setRightTab("news")}
              >
                <ExternalLink size={11} />
                Live News
                {liveNews.length > 0 && (
                  <span className="fema-feed-badge">{liveNews.length}</span>
                )}
              </button>
              <button
                className={`fema-feed-tab${rightTab === "bulletins" ? " active" : ""}`}
                onClick={() => setRightTab("bulletins")}
              >
                <ExternalLink size={11} />
                Bulletins
                {bulletins.length > 0 && (
                  <span className="fema-feed-badge">{bulletins.length}</span>
                )}
              </button>
            </div>

            {rightTab === "news" && (
              <div className="fema-feed-hz-items fema-feed-stack-items">
                {displayNews.length === 0 &&
                  (feedLoading ? (
                    <FeedLoading label="Loading live news..." />
                  ) : (
                    <div className="fema-feed-hz-empty">
                      No live MA news is available yet.
                    </div>
                  ))}

                {renderFeedItems(displayNews)}

                {liveNews.length > 6 && (
                  <button
                    className="fema-feed-show-all"
                    onClick={() => setShowAllNews(!showAllNews)}
                  >
                    {showAllNews ? "Show fewer" : `Show all ${liveNews.length}`}
                  </button>
                )}
              </div>
            )}

            {rightTab === "bulletins" && (
              <div className="fema-feed-hz-items fema-feed-stack-items">
                {displayBulletins.length === 0 &&
                  (feedLoading ? (
                    <FeedLoading label="Loading bulletins..." />
                  ) : (
                    <div className="fema-feed-hz-empty">
                      No MA carrier or CMS bulletin data is available yet.
                    </div>
                  ))}

                {renderFeedItems(displayBulletins)}

                {bulletins.length > 8 && (
                  <button
                    className="fema-feed-show-all"
                    onClick={() => setShowAllBulletins(!showAllBulletins)}
                  >
                    {showAllBulletins ? "Show fewer" : `Show all ${bulletins.length}`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
