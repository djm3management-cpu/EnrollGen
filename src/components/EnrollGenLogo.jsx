export default function EnrollGenLogo({ width = 260, className = "" }) {
  return (
    <div
      className={className}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "inline-block",
          padding: "14px 18px",
          borderRadius: "18px",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
          border: "1px solid rgba(56, 189, 248, 0.18)",
          boxShadow:
            "0 18px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
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
            opacity: 0.98,
            filter:
              "drop-shadow(0 10px 26px rgba(0,0,0,0.45)) drop-shadow(0 0 20px rgba(56,189,248,0.16))",
          }}
        />
      </div>
    </div>
  );
}
