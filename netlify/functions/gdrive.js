/**
 * Google Drive file listing — lists MP3 files in a public shared folder.
 *
 * GET /gdrive?folder=FOLDER_ID_OR_URL
 * Returns: { files: [{ id, name, size, mimeType, downloadUrl }] }
 *
 * Requires: GOOGLE_API_KEY in Netlify env vars
 * (Create at: https://console.cloud.google.com/apis/credentials → API key → restrict to Drive API)
 */

import { requireClerkAuth } from "./_clerkAuth.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function extractFolderId(input) {
  if (!input) return null;
  // Direct folder ID
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  // Google Drive URL patterns
  const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const match2 = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match2) return match2[1];
  return null;
}

export default async (request) => {
  if (request.method !== "GET") return json(405, { error: "Method not allowed" });

  const auth = await requireClerkAuth(request);
  if (auth.response) return auth.response;

  const url = new URL(request.url);
  const folderInput = url.searchParams.get("folder");
  const folderId = extractFolderId(folderInput);

  if (!folderId) {
    return json(400, { error: "Missing or invalid folder parameter. Provide a Google Drive folder URL or ID." });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return json(500, { error: "GOOGLE_API_KEY not configured. Add it to Netlify environment variables." });
  }

  try {
    // List files in the folder using Google Drive API v3
    const driveUrl = new URL("https://www.googleapis.com/drive/v3/files");
    driveUrl.searchParams.set("q", `'${folderId}' in parents and trashed = false`);
    driveUrl.searchParams.set("key", apiKey);
    driveUrl.searchParams.set("fields", "files(id,name,mimeType,size,createdTime)");
    driveUrl.searchParams.set("pageSize", "100");
    driveUrl.searchParams.set("orderBy", "name");

    const resp = await fetch(driveUrl.toString());
    if (!resp.ok) {
      const err = await resp.text();
      console.error("Google Drive API error:", resp.status, err);
      return json(resp.status, { error: "Failed to list Google Drive folder", detail: err });
    }

    const data = await resp.json();
    const files = (data.files || [])
      .filter(f => f.mimeType === "audio/mpeg" || f.name.toLowerCase().endsWith(".mp3") || f.mimeType?.startsWith("audio/"))
      .map(f => ({
        id: f.id,
        name: f.name,
        size: f.size ? parseInt(f.size) : null,
        mimeType: f.mimeType,
        createdTime: f.createdTime,
        downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
      }));

    return json(200, { folderId, totalFiles: files.length, files });
  } catch (err) {
    console.error("gdrive function error:", err);
    return json(500, { error: err.message });
  }
};
