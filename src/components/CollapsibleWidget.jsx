import { useState, useRef, useEffect, memo } from "react";

/**
 * CollapsibleWidget — Reusable wrapper that makes any right rail widget
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
    <div style={{
      background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 16,
      backdropFilter: "blur(12px)",
      boxShadow: "0 10px 24px rgba(0,0,0,0.36)",
      width: "100%",
      minWidth: 230,
      marginBottom: 8,
      pointerEvents: "auto",
      overflow: "hidden",
    }}>
      {/* Header bar */}
      <div
        onClick={() => setCollapsed((p) => !p)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          cursor: "pointer",
          background: "rgba(255,255,255,0.03)",
          userSelect: "none",
          borderBottom: collapsed ? "none" : "1px solid rgba(255,255,255,0.04)",
          transition: "border-bottom 0.2s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {icon && <span style={{ color: accentColor, flexShrink: 0, display: "flex", alignItems: "center" }}>{icon}</span>}
          <span style={{
            fontSize: "0.64rem",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: accentColor,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {title}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {headerRight}
          <span style={{
            fontSize: "0.6rem",
            color: "#555",
            transition: "transform 0.2s ease",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            display: "inline-block",
            lineHeight: 1,
          }}>
            ▼
          </span>
        </div>
      </div>

      {/* Collapsible content */}
      <div
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
