const MAIN_WALLPAPER_SRC = "/wallpapers/brown-abstract-3840x2160-26438.jpg";

export function MainWallpaper() {
  return (
    <img
      className="viewport-wallpaper-image"
      src={MAIN_WALLPAPER_SRC}
      alt=""
      draggable="false"
      decoding="async"
      fetchPriority="high"
    />
  );
}

export function Strata() { return null; }

export default function ShellTextures() {
  return (
    <div className="viewport-bg" aria-hidden="true">
      <MainWallpaper />
    </div>
  );
}
