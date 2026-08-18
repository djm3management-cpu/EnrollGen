import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const LeftRailContext = createContext(null);

const DESKTOP_RAIL_WIDTH = 360;

function ChevronLeftIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function sortRailItems(itemsById) {
  return Object.values(itemsById).sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.createdAt - b.createdAt;
  });
}

function getHighestPriorityId(
  itemsById,
  excludeId = null,
  minimizedIds = new Set()
) {
  return (
    sortRailItems(itemsById).find(
      (item) => item.id !== excludeId && !minimizedIds.has(item.id)
    )?.id ?? null
  );
}

export function LeftRailProvider({ children }) {
  const [itemsById, setItemsById] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [manuallyMinimizedIds, setManuallyMinimizedIds] = useState(() => new Set());
  const itemsRef = useRef(itemsById);
  const manuallyMinimizedIdsRef = useRef(manuallyMinimizedIds);
  itemsRef.current = itemsById;
  manuallyMinimizedIdsRef.current = manuallyMinimizedIds;

  const showLeftRail = useCallback((item) => {
    if (!item?.id) {
      return;
    }

    const {
      forceOpen = false,
      defaultMinimized = false,
      ...railItem
    } = item;
    const isNewItem = !itemsRef.current[railItem.id];
    const shouldStartMinimized = defaultMinimized && !forceOpen && isNewItem;

    if (forceOpen) {
      setManuallyMinimizedIds((prev) => {
        if (!prev.has(railItem.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(railItem.id);
        return next;
      });
    } else if (shouldStartMinimized) {
      setManuallyMinimizedIds((prev) => {
        if (prev.has(railItem.id)) {
          return prev;
        }
        const next = new Set(prev);
        next.add(railItem.id);
        return next;
      });
    }

    setItemsById((prev) => {
      const existing = prev[railItem.id];
      const nextItem = {
        ...existing,
        ...railItem,
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      };
      return {
        ...prev,
        [railItem.id]: nextItem,
      };
    });

    setExpandedId((currentExpandedId) => {
      if (forceOpen) {
        return railItem.id;
      }

      if (shouldStartMinimized) {
        return currentExpandedId;
      }

      if (manuallyMinimizedIdsRef.current.has(railItem.id)) {
        return currentExpandedId;
      }

      const currentExpanded = currentExpandedId
        ? itemsRef.current[currentExpandedId]
        : null;

      if (!currentExpanded) {
        return railItem.id;
      }

      if (currentExpandedId === railItem.id) {
        return railItem.id;
      }

      return railItem.priority > currentExpanded.priority ? railItem.id : currentExpandedId;
    });
  }, []);

  const dismissLeftRail = useCallback((id) => {
    if (!id) {
      return;
    }

    setManuallyMinimizedIds((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

    setItemsById((prev) => {
      if (!prev[id]) {
        return prev;
      }

      const next = { ...prev };
      delete next[id];

      setExpandedId((currentExpandedId) =>
        currentExpandedId === id
          ? getHighestPriorityId(next, null, manuallyMinimizedIdsRef.current)
          : currentExpandedId
      );

      return next;
    });
  }, []);

  const minimizeLeftRail = useCallback((id) => {
    if (!id) {
      return;
    }

    setManuallyMinimizedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    setExpandedId((currentExpandedId) => {
      if (currentExpandedId !== id) {
        return currentExpandedId;
      }
      return getHighestPriorityId(
        itemsRef.current,
        id,
        manuallyMinimizedIdsRef.current
      );
    });
  }, []);

  const expandLeftRail = useCallback((id) => {
    if (!id || !itemsRef.current[id]) {
      return;
    }
    setManuallyMinimizedIds((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedId(id);
  }, []);

  const openLeftRail = useCallback((id) => {
    if (!id) {
      return;
    }
    setManuallyMinimizedIds((prev) => {
      if (!prev.has(id)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setExpandedId(id);
  }, []);

  const clearLeftRail = useCallback(() => {
    setItemsById({});
    setExpandedId(null);
    setManuallyMinimizedIds(new Set());
  }, []);

  const hasLeftRailItem = useCallback((id) => Boolean(itemsById[id]), [itemsById]);

  const sortedItems = useMemo(() => sortRailItems(itemsById), [itemsById]);
  const expandedItem = expandedId ? itemsById[expandedId] ?? null : null;
  const minimizedItems = useMemo(
    () => sortedItems.filter((item) => item.id !== expandedId),
    [expandedId, sortedItems]
  );

  useEffect(() => {
    if (expandedItem || !sortedItems.length) {
      return;
    }

    const nextOpenItem = sortedItems.find(
      (item) => !manuallyMinimizedIds.has(item.id)
    );
    if (nextOpenItem) {
      setExpandedId(nextOpenItem.id);
    }
  }, [expandedItem, manuallyMinimizedIds, sortedItems]);

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
      openLeftRail,
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
      openLeftRail,
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
  visibleItemIds = null,
}) {
  const {
    expandedItem,
    minimizedItems,
    railWidth,
    expandLeftRail,
    minimizeLeftRail,
  } = useLeftRailManager();
  const visibleItemIdSet = useMemo(
    () => (visibleItemIds ? new Set(visibleItemIds) : null),
    [visibleItemIds]
  );
  const itemIsVisible = useCallback(
    (item) => !visibleItemIdSet || visibleItemIdSet.has(item.id),
    [visibleItemIdSet]
  );
  const visibleExpandedItem =
    expandedItem && itemIsVisible(expandedItem) ? expandedItem : null;
  const visibleMinimizedItems = useMemo(
    () => minimizedItems.filter(itemIsVisible),
    [itemIsVisible, minimizedItems]
  );
  const visibleRailWidth = visibleExpandedItem ? railWidth : 0;

  return (
    <>
      <div className="left-rail-handles">
        {launcher}
        {visibleMinimizedItems.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`left-rail-handle${item.isAttention ? " is-attention" : ""}`}
            onClick={() => expandLeftRail(item.id)}
            title={item.title}
          >
            <span
              className="left-rail-handle-pip"
              style={{ background: item.color || "var(--text-muted)" }}
              aria-hidden="true"
            />
            {item.icon ? (
              <span className="left-rail-handle-icon" aria-hidden="true">
                {item.icon}
              </span>
            ) : null}
            <span className="left-rail-handle-text">{item.shortLabel || item.title}</span>
            {item.badge ? (
              <span className="left-rail-handle-badge">{item.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      <aside
        className={`left-rail${visibleExpandedItem ? " is-open" : ""}${
          visibleExpandedItem?.id === "sep-qualifier" ? " left-rail--sep-qualifier" : ""
        }${visibleExpandedItem?.railClassName ? ` ${visibleExpandedItem.railClassName}` : ""}`}
        style={{ width: visibleRailWidth }}
      >
        {visibleExpandedItem ? (
          <div
            key={visibleExpandedItem.id}
            className={`left-rail-panel-shell${
              visibleExpandedItem.id === "sep-qualifier" ? " left-rail-panel-shell--sep-qualifier" : ""
            }${visibleExpandedItem.panelClassName ? ` ${visibleExpandedItem.panelClassName}` : ""}${
              visibleExpandedItem.isAttention ? " is-attention" : ""
            }`}
          >
            <button
              type="button"
              className="rail-minimize-btn left-rail-minimize"
              onClick={() => minimizeLeftRail(visibleExpandedItem.id)}
              title={`Minimize ${visibleExpandedItem.title}`}
              aria-label={`Minimize ${visibleExpandedItem.title}`}
            >
              <ChevronLeftIcon />
            </button>
            {visibleExpandedItem.component}
          </div>
        ) : null}
      </aside>
    </>
  );
}
