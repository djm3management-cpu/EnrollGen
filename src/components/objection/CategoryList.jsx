import {
  Shield, ThumbsUp, DollarSign, Stethoscope, Clock,
} from "lucide-react";

const ICON_MAP = { Shield, ThumbsUp, DollarSign, Stethoscope, Clock };

export function CategoryList({
  categories,
  selectedCategory,
  selectedObjection,
  onSelectCategory,
  onSelectObjection,
}) {
  return (
    <div className="objection-categories">
      <div className="objection-col-label">Objections</div>

      {categories.map((cat) => {
        const Icon = ICON_MAP[cat.icon] || Shield;
        const isOpen = selectedCategory === cat.id;

        return (
          <div key={cat.id} className="objection-cat-group">
            <button
              className={`objection-cat-btn${isOpen ? " active" : ""}`}
              onClick={() => onSelectCategory(isOpen ? null : cat.id)}
            >
              <Icon size={14} />
              <span>{cat.label}</span>
              <span className="objection-cat-count">{cat.objections.length}</span>
            </button>

            {isOpen && (
              <div className="objection-cat-items">
                {cat.objections.map((obj) => (
                  <button
                    key={obj.id}
                    className={`objection-item-btn${
                      selectedObjection?.id === obj.id ? " active" : ""
                    }`}
                    onClick={() => onSelectObjection(obj)}
                  >
                    {obj.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
