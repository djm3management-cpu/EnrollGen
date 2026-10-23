# Conversly recording links

The existing `/api/recordings/media/:token` behavior is unchanged: 300-second
expiry, reusable GET bearer capability, no IP/user-agent/session binding. Minting
checks tenant and call access. Redemption verifies the configured Twilio account
and RecordingSid → expected CallSid before returning WAV (`audio/wav`). Existing
Storage playback URLs are also signed for 300 seconds.

Conversly links use a separate `recording_compliance_tickets` table and
`GET /api/recordings/conversly/:token` route on the telephony service. A link is
valid for 86,400 seconds from mint time, supports repeated GET and HEAD without
Clerk cookies/headers, and is scoped to one recording and format. It has no IP,
user-agent or session binding. Possession of the link grants access until expiry;
only its SHA-256 hash is stored. Deleting its ticket revokes future requests.

## Mint and copy

In the call's **Recording** tab, organization admins/owners see
**COPY CONVERSLY LINK (WAV)** and, when a retained provider copy is available,
**COPY CONVERSLY LINK (MP3)**. These use the existing `contacts-mini-btn` styling.
The server returns the admin capability to control visibility, and independently
enforces signed organization admin/owner authorization on every mint request.
If clipboard access is denied, the minted URL appears in a read-only copy field.

Programmatic minting uses authenticated `POST /api/recordings`:

```json
{
  "action": "conversly",
  "call_record_id": "<call UUID>",
  "recording_id": "<ID returned by the recordings listing>",
  "format": "wav"
}
```

Use exactly one of `call_record_id`, `inbound_call_id`, or `attempt_id`.
`recording_id` is mandatory; it must appear in that tenant-checked call's recording
listing. `format` defaults to `wav`; `mp3` is also supported. The response includes
`url`, `expires_in: 86400`, `expires_at`, `format`, `content_type`, and `filename`.

## Media behavior

- WAV: `audio/wav`, `.wav` filename. Uses the private stored WAV when available,
  with a verified Twilio fallback for missing copies.
- MP3: `audio/mpeg`, `.mp3` filename. Fetches Twilio's MP3 rendition of the same
  recording, retaining its channel count. Requires the recording still to exist
  at Twilio; there is no local WAV-to-MP3 transcoding.
- HEAD: same full-object Content-Type and Content-Length as GET, with no body.
  Provider GET headers are used so provider HEAD support is unnecessary.
- Single byte ranges: bounded, open-ended and suffix requests return 206 with
  matching Content-Length and Content-Range; unsatisfiable ranges return 416.
  Multipart ranges are rejected with 416. Range on HEAD is ignored.
- If the upstream omits Content-Length or ignores Range, audio is spooled to a
  private temporary file to calculate lengths/serve ranges accurately. The file
  is removed after the request. Otherwise media streams directly. Requests have
  a 30-second idle deadline and two-hour overall limit.
- Responses use `private, no-store`, `no-referrer`, and `nosniff`. No provider
  credentials or URLs are returned to the external client. Expired tickets are
  removed by the existing recording worker.

## Rollout and verification

Apply `supabase/migrations/112_recording_compliance_tickets.sql` before deploying
the telephony service and Netlify app. The new table is service-role-only with
RLS enabled. Existing playback tables, routes, grants and lifetimes are unchanged.
The telephony service must be deployed as well as the frontend/API; Netlify alone
does not host the media route. `TELEPHONY_BASE_URL` (or the existing
`VITE_TELEPHONY_BASE_URL` fallback) must point to its HTTPS public origin.

Tests use database, provider, Storage and clipboard fixtures; they do not submit
recordings to Conversly. Check an admin-minted live link with HEAD, full GET,
`Range: bytes=0-3`, and another GET before submitting it to Conversly.
