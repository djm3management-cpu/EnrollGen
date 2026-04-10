import { useState } from "react";
import { MapPin, Search } from "lucide-react";

export function CountyGrid({
  state,
  counties,
  planCounts,
  selectedCounty,
  onCountySelect,
  loading,
}) {
  const [search, setSearch] = useState("");
  const q = search.toLowerCase().trim();
  const filtered = q ? counties.filter((c) => c.toLowerCase().includes(q)) : counties;

  return (
    <div className="sep-county-grid-panel">
      <div className="sep-cg-header">
        <MapPin size={13} />
        <span>{state} Counties</span>
        <span className="sep-cg-count">{counties.length}</span>
      </div>

      {counties.length > 12 && (
        <div className="sep-cg-search">
          <Search size={12} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter counties..."
          />
        </div>
      )}

      {loading ? (
        <div className="sep-cg-loading">
          <span className="sep-spinner-sm" /> Loading counties...
        </div>
      ) : (
        <div className="sep-cg-list">
          {filtered.map((county) => {
            const count = planCounts[county] || 0;
            const isActive = selectedCounty === county;
            return (
              <button
                key={county}
                className={`sep-cg-tile${isActive ? " active" : ""}`}
                onClick={() => onCountySelect(county)}
                type="button"
              >
                <span className="sep-cg-tile-name">{county}</span>
                {count > 0 && (
                  <span className="sep-cg-tile-count">{count}</span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="sep-cg-empty">No counties match "{search}"</div>
          )}
        </div>
      )}
    </div>
  );
}
