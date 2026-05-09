import { useState, useRef, useEffect, memo } from "react";

/**
 * CollapsibleWidget, Reusable wrapper that makes any right rail widget
 * collapsible with a header bar + chevron toggle.
 *
 * Collapsed: only the header bar visible (~34px).
 * Expanded: full widget content rendered below the header.
 * Smooth max-height transition on toggle.
 */

const CollapsibleWidget = memo(function CollapsibleWidget({
  title,
  icon,
  accentColor = "#7a7f8e",
  defaultCollapsed = false,
  children,
  /** Extra elements rendered in the header right side (next to chevron) */
  headerRight,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState("auto");

  // Keep the wrapper height in sync when inner widget content changes.
  useEffect(() => {
    if (!contentRef.current || collapsed) {
      return undefined;
    }

    const container = contentRef.current;
    const syncHeight = () => {
      setContentHeight(container.scrollHeight + "px");
    };
    const attachResizeTargets = (observer) => {
      observer.observe(container);

      Array.from(container.children).forEach((child) => {
        observer.observe(child);
      });
    };

    syncHeight();

    const resizeObserver = new ResizeObserver(syncHeight);
    attachResizeTargets(resizeObserver);

    const mutationObserver = new MutationObserver(() => {
      resizeObserver.disconnect();
      attachResizeTargets(resizeObserver);
      syncHeight();
    });
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [collapsed]);

  // Update height when collapsed state changes
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(collapsed ? "0px" : contentRef.current.scrollHeight + "px");
    }
  }, [collapsed]);

  return (
    <div
      className="right-rail-widget-shell"
      style={{
        background: "var(--eg-surface-2)",
        border: "1px solid var(--eg-border)",
        borderRadius: "var(--eg-radius-card)",
        width: "100%",
        minWidth: 0,
        marginBottom: 8,
        pointerEvents: "auto",
        overflow: "hidden",
      }}
    >
      <div
        className="right-rail-widget-header"
        onClick={() => setCollapsed((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          cursor: "pointer",
          background: "transparent",
          userSelect: "none",
          borderBottom: collapsed ? "none" : "1px solid var(--eg-border)",
          transition: "border-bottom 0.2s ease",
        }}
      >
        <div
          className="right-rail-widget-title-row"
          style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}
        >
          {icon && (
            <span
              className="right-rail-widget-icon"
              style={{
                color: "var(--eg-text-dim)",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
              }}
            >
              {icon}
            </span>
          )}
          <span
            className="right-rail-widget-title"
            style={{
              fontFamily: "var(--eg-font-mono)",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--eg-text-dim)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>
        </div>
        <div
          className="right-rail-widget-header-actions"
          style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}
        >
          {headerRight}
          <span
            className="right-rail-widget-chevron"
            style={{
              fontSize: 9,
              color: "var(--eg-text-faint)",
              transition: "transform 0.2s ease",
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              display: "inline-block",
              lineHeight: 1,
            }}
          >
            {"▼"}
          </span>
        </div>
      </div>

      <div
        className="right-rail-widget-content"
        ref={contentRef}
        style={{
          maxHeight: contentHeight,
          overflow: "hidden",
          transition: "max-height 0.2s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
});

export default CollapsibleWidget;
