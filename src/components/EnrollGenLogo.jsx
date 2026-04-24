export default function EnrollGenLogo({
  width = 260,
  className = "",
  style,
  onClick,
  title,
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <Wrapper
      className={className}
      onClick={onClick}
      title={title}
      aria-label={title}
      type={onClick ? "button" : undefined}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        padding: 0,
        margin: 0,
        border: "none",
        background: "transparent",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "inline-block",
          padding: "6px 8px",
          borderRadius: "18px",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          overflow: "hidden",
        }}
      >
        <img
          src="/logofinalshadow.png"
          width={width}
          alt="EnrollGen Logo"
          draggable={false}
          style={{
            display: "block",
            maxWidth: "100%",
            height: "auto",
          }}
        />
      </div>
    </Wrapper>
  );
}
