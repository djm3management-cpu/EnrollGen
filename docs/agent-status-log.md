# Agent status log

The Dashboard's **Agent Status Log** shows saved availability transitions for the agency, newest first. It has independent agent, date, and status filters, 50-row pages, and refreshes every 30 seconds and when the window regains focus. Calendar days and timestamps use the viewer's local time zone, including daylight-saving boundaries. Times include seconds and the zone abbreviation.

Available and Callbacks Only are labeled Online; Busy and Offline retain their own labels. This is availability history, not a history of authentication or every phone connection attempt.

`GET /.netlify/functions/agent-status-log` requires a verified Clerk session. It follows the existing dashboard agency read scope, resolves membership on the server, and limits history to the service-managed `availability_agent_subjects` map for that tenant. Browser-supplied tenant IDs and foreign agent filters are rejected. Direct browser access to the underlying tables remains disabled.

Migration `120_agent_status_log.sql` moves logging after the reservation and phone-presence guards so only the final saved status is recorded. It preserves availability's update timestamp and adds history query indexes. Apply this forward migration to the linked Supabase project before deploying. It preserves existing history; earlier entries retain the original logger's behavior and are not retroactively corrected.

Validation: `node --test tests/agent-status-log.test.js tests/availability-auth.test.js`, targeted ESLint, and `npm run build`. The tests cover tenant boundaries, organization admins, inactive identities, date boundaries, filtering, stable pagination, and suppression of rejected online/offline attempts during disconnected or reserved states.
