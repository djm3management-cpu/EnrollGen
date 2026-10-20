export const AVAILABILITY_OPTIONS = [
  { value: "available", label: "AVAILABLE", color: "var(--status-live)" },
  { value: "callbacks_only", label: "CALLBACKS ONLY", color: "var(--status-pending)" },
  { value: "busy", label: "BUSY", color: "var(--status-pending)" },
  { value: "offline", label: "OFFLINE", color: "var(--status-offline)" },
];

export const requiresPhoneReady = status => ["available", "callbacks_only"].includes(status);
export const availabilityLabel = status => status === "wrap_up" ? "WRAP-UP"
  : AVAILABILITY_OPTIONS.find(option => option.value === status)?.label || "OFFLINE";
