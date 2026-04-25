import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Phone, Search } from "lucide-react";
import {
  CARRIER_REFERENCE,
  CARRIER_PRODUCT_FILTERS,
} from "../data/carrierReference";

function highlightMatches(carrier, query) {
  if (!query) return true;
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  if (carrier.carrier.toLowerCase().includes(needle)) return true;
  if (carrier.products.some((product) => product.toLowerCase().includes(needle)))
    return true;
  if (carrier.states.some((state) => state.toLowerCase().includes(needle)))
    return true;

  const planMatch = (carrier.plans || []).some((plan) => {
    const haystack = [
      plan.name,
      plan.type,
      plan.network,
      plan.notes,
      ...(plan.highlights || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });

  return planMatch;
}

export default function CarrierQuickRef() {
  const [query, setQuery] = useState("");
  const [productFilter, setProductFilter] = useState("All");
  const [expandedKey, setExpandedKey] = useState(null);

  const filterDef =
    CARRIER_PRODUCT_FILTERS.find((filter) => filter.id === productFilter) ||
    CARRIER_PRODUCT_FILTERS[0];

  const results = useMemo(() => {
    return CARRIER_REFERENCE.filter(
      (carrier) => filterDef.match(carrier) && highlightMatches(carrier, query)
    );
  }, [filterDef, query]);

  const togglePlan = (key) => {
    setExpandedKey((current) => (current === key ? null : key));
  };

  return (
    <div className="carrier-quickref">
      <div className="carrier-quickref-toolbar">
        <div className="carrier-quickref-search">
          <Search size={13} className="carrier-quickref-search-icon" />
          <input
            className="carrier-quickref-search-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search carrier, state, or plan type..."
            autoComplete="off"
          />
        </div>

        <div className="carrier-quickref-filter-row" role="tablist">
          {CARRIER_PRODUCT_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={productFilter === filter.id}
              className={`carrier-quickref-filter-pill${
                productFilter === filter.id ? " is-active" : ""
              }`}
              onClick={() => setProductFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="carrier-quickref-empty">
          No carriers match your search.
        </div>
      ) : (
        <div className="carrier-quickref-grid">
          {results.map((carrier) => (
            <article
              key={carrier.carrier}
              className="carrier-quickref-card"
            >
              <header className="carrier-quickref-card-head">
                <div className="carrier-quickref-card-title">
                  {carrier.carrier}
                </div>
                <div className="carrier-quickref-card-products">
                  {carrier.products.map((product) => (
                    <span
                      key={product}
                      className="carrier-quickref-product-badge"
                    >
                      {product}
                    </span>
                  ))}
                </div>
              </header>

              <div className="carrier-quickref-card-states">
                <span className="carrier-quickref-meta-label">States</span>
                <span className="carrier-quickref-meta-value">
                  {carrier.states.join(", ")}
                </span>
              </div>

              <div className="carrier-quickref-plan-list">
                {(carrier.plans || []).map((plan) => {
                  const key = `${carrier.carrier}::${plan.name}`;
                  const isExpanded = expandedKey === key;
                  return (
                    <div key={key} className="carrier-quickref-plan">
                      <button
                        type="button"
                        className="carrier-quickref-plan-trigger"
                        onClick={() => togglePlan(key)}
                        aria-expanded={isExpanded}
                      >
                        <div className="carrier-quickref-plan-head">
                          <span className="carrier-quickref-plan-name">
                            {plan.name}
                          </span>
                          {plan.type ? (
                            <span className="carrier-quickref-plan-type">
                              {plan.type}
                            </span>
                          ) : null}
                        </div>
                        <ChevronDown
                          size={13}
                          className={`carrier-quickref-plan-chevron${
                            isExpanded ? " is-open" : ""
                          }`}
                        />
                      </button>

                      {plan.highlights?.length ? (
                        <ul className="carrier-quickref-plan-highlights">
                          {plan.highlights.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      ) : null}

                      {isExpanded ? (
                        <div className="carrier-quickref-plan-detail">
                          {plan.network ? (
                            <div className="carrier-quickref-plan-meta">
                              <span className="carrier-quickref-meta-label">
                                Network
                              </span>
                              <span className="carrier-quickref-meta-value">
                                {plan.network}
                              </span>
                            </div>
                          ) : null}
                          {plan.notes ? (
                            <div className="carrier-quickref-plan-meta">
                              <span className="carrier-quickref-meta-label">
                                Notes
                              </span>
                              <span className="carrier-quickref-meta-value">
                                {plan.notes}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <footer className="carrier-quickref-card-footer">
                {carrier.portal ? (
                  <a
                    className="carrier-quickref-link"
                    href={carrier.portal}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={11} />
                    Portal
                  </a>
                ) : null}
                {carrier.phone ? (
                  <a
                    className="carrier-quickref-link"
                    href={`tel:${carrier.phone.replace(/[^0-9+]/g, "")}`}
                  >
                    <Phone size={11} />
                    {carrier.phone}
                  </a>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
