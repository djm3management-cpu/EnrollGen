const WALLPAPER_BASE = "/wallpapers/wallpapers";

const localWallpaper = (id, label, fileName) => ({
  id,
  label,
  url: `${WALLPAPER_BASE}/${fileName}`,
  thumbUrl: `${WALLPAPER_BASE}/${fileName}`,
});

export const wallpapers = [
  { id: "none", label: "Default", url: null, thumbUrl: null },
  localWallpaper("orange-waves", "Orange Waves", "wallpaper-01-orange-waves.jpg"),
  localWallpaper("purple-glow", "Purple Glow", "wallpaper-02-purple-glow.jpg"),
  localWallpaper("pastel-spheres", "Pastel Spheres", "wallpaper-03-pastel-spheres.jpg"),
  localWallpaper("teal-silk", "Teal Silk", "wallpaper-04-teal-silk.jpg"),
  localWallpaper("amber-rays", "Amber Rays", "wallpaper-05-amber-rays.jpg"),
  localWallpaper("bamboo", "Bamboo", "wallpaper-06-bamboo.jpg"),
  localWallpaper("pool", "Pool", "wallpaper-07-pool.jpg"),
  localWallpaper("monaco-day", "Monaco Day", "wallpaper-08-monaco-day.jpg"),
  localWallpaper("monaco-night", "Monaco Night", "wallpaper-09-monaco-night.jpg"),
];
