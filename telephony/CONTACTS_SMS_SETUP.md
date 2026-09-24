# Contacts / SMS rollout

1. Apply `supabase/migrations/043_contacts_phone_identity.sql` after migration 042. It merges legacy contacts with the same tenant and normalized phone, preferring an assigned contact and then the oldest record. Related messages, notes, calls, policies, activities, lead intelligence and audit records move to the survivor. Conflicting source details are retained as encrypted snapshots in `contact_merge_archive`, inaccessible to browser roles. The migration runs transactionally and locks contact writes while repairing identities.
2. Configure `GIPHY_API_KEY` in the telephony service environment, then deploy the telephony service and frontend. No API key belongs in the browser bundle. The existing `message-media` storage bucket must exist (migration 020).
3. Verify using two test contacts: edit a phone using local and +1 formats, then try another contact's phone and confirm or cancel the merge prompt. Verify a new contact can be created and its details edited. Contact fields save on blur or Enter; the success toast confirms persistence.
4. Send an inbound SMS from a test handset and verify its thread and unread badge, including with the WebSocket disconnected. Recent means activity in the last 30 days.
5. Select an emoji in the middle of a draft. Search/select a GIF, review the MMS preview, and send to a test handset. The server downloads the selected GIPHY rendition, verifies GIF content and actual bytes strictly below 600,000, then stores it and gives Twilio a signed URL. Carrier delivery still depends on the configured Twilio number and carrier support.

GIPHY integration follows the official API search and rendition schema: https://developers.giphy.com/docs/api/ . The picker defaults to Minions and shows only renditions meeting the size limit. If no key is configured, it displays a setup error instead of mock results.

Local verification: `npm run build`, targeted ESLint, and `node --test telephony/tests/contactIdentity.test.js`. These do not send real messages or apply migrations to a live database.

## Always-visible agent contact details

Apply migration `044_agent_contact_details.sql` after 043. Names, complete phone numbers and full MBIs then load automatically for authenticated agents in the same workspace, including unassigned/team contacts. The contact list hydrates full details using `read_contact_details` and caches unchanged records in component memory. Supabase encryption, column restrictions, Clerk identity checks, tenant boundaries and access logs remain in place. Full MBIs must have been saved; a last-four value cannot reconstruct a full MBI. The migration also fixes the encryption trigger overwriting a newly saved MBI.
