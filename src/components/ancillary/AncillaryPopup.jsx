import { forwardRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

const popupTransition = {
  duration: 0.3,
  ease: [0.16, 1, 0.3, 1],
};

const AncillaryPopup = memo(
  forwardRef(function AncillaryPopup(
    {
      popupKey,
      icon,
      title,
      collapsedLabel,
      collapsed,
      onExpand,
      onDismiss,
      onInteract,
      children,
      inline = false,
    },
    ref
  ) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.button
            key={`${popupKey}-pill`}
            type="button"
            ref={ref}
            className={`ancillary-popup-pill${
              inline ? " ancillary-popup-pill--inline" : ""
            }${
              collapsedLabel ? " ancillary-popup-pill--with-label" : ""
            }`}
            initial={{ opacity: 0, x: -20, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -16, scale: 0.96 }}
            transition={popupTransition}
            onClick={onExpand}
            onPointerDown={onInteract}
            aria-label={`Open ${title}`}
          >
            <span className="ancillary-popup-pill-icon" aria-hidden="true">
              {icon}
            </span>
            {collapsedLabel ? (
              <span className="ancillary-popup-pill-label">
                {collapsedLabel}
              </span>
            ) : null}
          </motion.button>
        ) : (
          <motion.aside
            key={`${popupKey}-card`}
            ref={ref}
            className={`ancillary-popup-card${
              inline ? " ancillary-popup-card--inline" : ""
            }`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={popupTransition}
            onPointerDown={onInteract}
            onKeyDown={onInteract}
          >
            <button
              type="button"
              className="ancillary-popup-dismiss"
              onClick={onDismiss}
              aria-label={`Dismiss ${title}`}
            >
              <X size={14} />
            </button>

            <div className="ancillary-popup-header">
              <span className="ancillary-popup-icon" aria-hidden="true">
                {icon}
              </span>
              <div className="ancillary-popup-title">{title}</div>
            </div>

            <div className="ancillary-popup-body">{children}</div>
          </motion.aside>
        )}
      </AnimatePresence>
    );
  })
);

export default AncillaryPopup;
