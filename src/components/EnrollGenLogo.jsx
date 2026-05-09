export default function EnrollGenLogo({
  className = "",
  style,
  onClick,
  title,
}) {
  const Wrapper = onClick ? "button" : "div";
  const wrapperClass = ["top-bar-logo-wordmark", className].filter(Boolean).join(" ");

  return (
    <Wrapper
      className={wrapperClass}
      onClick={onClick}
      title={title}
      aria-label={title || "EnrollGen"}
      type={onClick ? "button" : undefined}
      style={style}
    >
      <span className="eg-wordmark-enroll">Enroll</span>
      <span className="eg-wordmark-gen">GEN</span>
    </Wrapper>
  );
}
