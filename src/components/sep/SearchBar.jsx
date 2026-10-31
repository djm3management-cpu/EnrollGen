import { Search } from "lucide-react";

export function SearchBar({ zip, setZip, handleSearch, handleKeyDown, isValidZip, loading, inputRef }) {
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
        <button data-key-role="secondary" className="primary" onClick={handleSearch} disabled={!isValidZip || loading}>
          {loading ? <span className="sep-spinner-sm" /> : <Search size={18} strokeWidth={2.5} />}{" "}
          Search
        </button>
      </div>


    </>
  );
}
