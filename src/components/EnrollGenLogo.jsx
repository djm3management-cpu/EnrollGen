export default function EnrollGenLogo({
  width = 260,
  className = "",
  style,
  onClick,
  title,
}) {
  const Wrapper = onClick ? "button" : "div";

  return (
    <>
      <style>{`
        @keyframes enrollgen-scan {
          0%   { transform: translateY(-100%); opacity: 0; }
          4%   { opacity: 1; }
          96%  { opacity: 1; }
          100% { transform: translateY(2000%); opacity: 0; }
        }
        @keyframes enrollgen-glow {
          0%, 100% {
            box-shadow:
              0 18px 60px rgba(0,0,0,0.55),
              inset 0 1px 0 rgba(255,255,255,0.06);
          }
          50% {
            box-shadow:
              0 18px 60px rgba(0,0,0,0.55),
              inset 0 1px 0 rgba(255,255,255,0.06),
              0 0 24px rgba(255,255,255,0.04);
          }
        }
      `}</style>

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
            padding: "14px 18px",
            borderRadius: "18px",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255, 255, 255, 0.06)",
            animation: "enrollgen-glow 3.6s ease-in-out infinite",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
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
              position: "relative",
              zIndex: 1,
              maxWidth: "100%",
              height: "auto",
              opacity: 0.98,
              filter: "drop-shadow(0 10px 26px rgba(0,0,0,0.45))",
            }}
          />
        </div>
      </Wrapper>
    </>
  );
}
