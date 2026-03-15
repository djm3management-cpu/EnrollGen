import React from "react";
import { Search } from "lucide-react";

const QUICK_ZIPS = ["33601", "77002", "28801", "40502", "90001"];

export function SearchBar({ zip, setZip, handleSearch, handleKeyDown, isValidZip, loading, inputRef, hasResults }) {
  return (
    <>
      <div className="card sep-search-bar">
        <input
          ref={inputRef}
          type="text"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onKeyDown={handleKeyDown}
          placeholder="Enter 5-digit zip code..."
        />
        <button className="primary" onClick={handleSearch} disabled={!isValidZip || loading}>
          {loading ? <span className="sep-spinner-sm" /> : <Search size={18} strokeWidth={2.5} />}{" "}
          Search
        </button>
      </div>

      {!hasResults && !loading && (
        <div className="sep-quick-zips">
          <span>Try:</span>
          {QUICK_ZIPS.map((z) => (
            <button key={z} className="sep-quick-zip-btn" onClick={() => setZip(z)}>
              {z}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
