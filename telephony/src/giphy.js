import process from "node:process";
import { Buffer } from "node:buffer";
export const MAX_GIF_BYTES = 600000;
const RENDITIONS = ["downsized", "fixed_width", "fixed_height", "fixed_width_small", "fixed_height_small", "preview_gif"];

export function chooseGif(gif) {
  for (const name of RENDITIONS) {
    const image = gif?.images?.[name];
    const size = Number(image?.size);
    if (!image?.url || !Number.isFinite(size) || size <= 0 || size >= MAX_GIF_BYTES) continue;
    let url;
    try { url = new URL(image.url); } catch { continue; }
    if (url.protocol !== "https:" || !/^media\d*\.giphy\.com$/.test(url.hostname)) continue;
    return { id: gif.id, title: gif.title || "GIF", url: image.url, size };
  }
  return null;
}

export async function giphyRequest(path, params = {}) {
  if (!process.env.GIPHY_API_KEY) throw new Error("GIF search is unavailable until GIPHY_API_KEY is configured on the telephony service.");
  const url = new URL(`https://api.giphy.com/v1/gifs/${path}`);
  url.search = new URLSearchParams({ ...params, api_key: process.env.GIPHY_API_KEY }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("GIF provider is unavailable. Please try again.");
  return response.json();
}

export async function downloadGif(gif) {
  const response = await fetch(gif.url, { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/gif")) throw new Error("This GIF could not be downloaded.");
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size >= MAX_GIF_BYTES) throw new Error("Choose a GIF smaller than 600 KB.");
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  if (!["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())) throw new Error("Invalid GIF file.");
  return bytes;
}
