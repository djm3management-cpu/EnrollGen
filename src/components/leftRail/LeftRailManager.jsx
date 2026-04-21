import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

const LeftRailContext = createContext(null);

const PANEL_TRANSITION = {
  duration: 0.28,
  ease: [0.16, 1, 0.3, 1],
};

const DESKTOP_RAIL_WIDTH = 340;

function sortRailItems(itemsById) {
  return Object.values(itemsById).sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.createdAt - b.createdAt;
  });
}

function getHighestPriorityId(itemsById, excludeId = null) {
  return sortRailItems(itemsById).find((item) => item.id !== excludeId)?.id ?? null;
}

export function LeftRailProvider({ children }) {
  const [itemsById, setItemsById] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const itemsRef = useRef(itemsById);

  useEffect(() => {
    itemsRef.current = itemsById;
  }, [itemsById]);

  const showLeftRail = useCallback((item) => {
    if (!item?.id) {
      return;
    }

    setItemsById((prev) => {
      const existing = prev[item.id];
      const nextItem = {
        ...existing,
        ...item,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [item.id]: nextItem,
      };
    });

    setExpandedId((currentExpandedId) => {
      const currentExpanded = currentExpandedId
        ? itemsRef.current[currentExpandedId]
        : null;

      if (!currentExpanded) {
        return item.id;
      }

      if (currentExpandedId === item.id) {
        return item.id;
      }

      return item.priority > currentExpanded.priority ? item.id : currentExpandedId;
    });
  }, []);

  const dismissLeftRail = useCallback((id) => {
    if (!id) {
      return;
    }

    setItemsById((prev) => {
      if (!prev[id]) {
        return prev;
      }

      const next = { ...prev };
      delete next[id];

      setExpandedId((currentExpandedId) =>
        currentExpandedId === id ? getHighestPriorityId(next) : currentExpandedId
      );

      return next;
    });
  }, []);

  const minimizeLeftRail = useCallback((id) => {
    if (!id) {
      return;
    }

    setExpandedId((currentExpandedId) => {
      if (currentExpandedId !== id) {
        return currentExpandedId;
      }
      return getHighestPriorityId(itemsRef.current, id);
    });
  }, []);

  const expandLeftRail = useCallback((id) => {
    if (!id || !itemsRef.current[id]) {
      return;
    }
    setExpandedId(id);
  }, []);

  const clearLeftRail = useCallback(() => {
    setItemsById({});
    setExpandedId(null);
  }, []);

  const hasLeftRailItem = useCallback((id) => Boolean(itemsRef.current[id]), []);

  const sortedItems = useMemo(() => sortRailItems(itemsById), [itemsById]);
  const expandedItem = expandedId ? itemsById[expandedId] ?? null : null;
  const minimizedItems = useMemo(
    () => sortedItems.filter((item) => item.id !== expandedId),
    [expandedId, sortedItems]
  );

  const value = useMemo(
    () => ({
      items: sortedItems,
      itemsById,
      expandedItem,
      minimizedItems,
      railWidth: expandedItem ? DESKTOP_RAIL_WIDTH : 0,
      showLeftRail,
      dismissLeftRail,
      minimizeLeftRail,
      expandLeftRail,
      clearLeftRail,
      hasLeftRailItem,
    }),
    [
      sortedItems,
      itemsById,
      expandedItem,
      minimizedItems,
      showLeftRail,
      dismissLeftRail,
      minimizeLeftRail,
      expandLeftRail,
      clearLeftRail,
      hasLeftRailItem,
    ]
  );

  return (
    <LeftRailContext.Provider value={value}>{children}</LeftRailContext.Provider>
  );
}

export function useLeftRailManager() {
  const context = useContext(LeftRailContext);
  if (!context) {
    throw new Error("useLeftRailManager must be used within <LeftRailProvider>");
  }
  return context;
}

export function LeftRail({
  launcher = null,
}) {
  const {
    expandedItem,
    minimizedItems,
    railWidth,
    expandLeftRail,
  } = useLeftRailManager();

  return (
    <>
      <div className="left-rail-handles">
        {launcher}
        {minimizedItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className="left-rail-handle"
            onClick={() => expandLeftRail(item.id)}
            title={item.title}
          >
            <span
              className="left-rail-handle-pip"
              style={{ background: item.color || "#8b949e" }}
              aria-hidden="true"
            />
            <span className="left-rail-handle-text">{item.shortLabel || item.title}</span>
          </button>
        ))}
      </div>

      <motion.aside
        className={`left-rail${expandedItem ? " is-open" : ""}${
          expandedItem?.id === "sep-qualifier" ? " left-rail--sep-qualifier" : ""
        }`}
        animate={{ width: railWidth }}
        initial={false}
        transition={PANEL_TRANSITION}
      >
        <AnimatePresence mode="wait" initial={false}>
          {expandedItem ? (
            <motion.div
              key={expandedItem.id}
              className={`left-rail-panel-shell${
                expandedItem.id === "sep-qualifier" ? " left-rail-panel-shell--sep-qualifier" : ""
              }`}
              initial={{ opacity: 0, x: -28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={PANEL_TRANSITION}
            >
              {expandedItem.component}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.aside>
    </>
  );
}
