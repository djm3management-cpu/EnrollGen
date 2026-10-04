# October release housekeeping (F44/F52/F53/F54)

Browser diagnostics now use static event labels only, with no exception bodies, names, phone numbers, transcripts, or IDs. `VITE_DEBUG_LOGS=true` enables them only in development; production Vite builds eliminate the logger. Server-only LLM background diagnostics use a static label and require `ENROLLGEN_DEBUG_LOGS=true` outside production. Runtime behavior and UI styling are preserved.

Caller inventory used repository-wide import/name/path searches, checked application imports and test references before deletion:

- `netlify/functions/gdrive.js`: no application caller; removed the unused endpoint that exposed server API keys in returned URLs.
- `src/components/contacts/ContactDetail.jsx`: no UI import; the active contact workspace is embedded in ContactsTab. Its obsolete entry in the DNC source audit was removed; active entry points remain audited.
- `src/components/contacts/ContactImportPanel.jsx`: no UI import. Retained the pure import/CSV helpers and made skipped CSV formula-safe.
- `docs/enrollgen-v3-mockup.jsx`: no executable import; old demo artifact.
- `getConverselyReport` in `src/context/ComplianceScorer.js`: exported local report helper with no callers. The active scoring engine is unchanged.
- `mix` in `src/components/CarrierRef.jsx`: no references; removed unused pure color helper.

OperationsTab removal belongs to the follow-ups batch. `useFollowUps.js` is retained for that batch.

Bible provider requests now use an authenticated, constrained Netlify proxy. Set **server-only** `BIBLIA_API_KEY`, remove `VITE_BIBLIA_API_KEY`, rebuild/redeploy frontend and functions. Missing/unavailable provider returns a generic unavailable response; DailyVerse retains its fallback and displays the provider-unavailable state. Upstream errors and keys are never returned.

CSV escaping reuses the follow-ups batch's shared always-quoted formula-safe `csvCell` helper, including formulas preceded by whitespace/BOM. Node ESLint globals are scoped to server/integrations/test directories. Unused bindings removed preserve side effects; the first inbound `paragonCall` variable/assignment was never read and removal changes no Paragon decision or billing operation. No migration 087 is needed.

Validation: full ESLint clean; Vite production build passes; dedicated CSV/proxy/diagnostic tests pass; existing customer-audio/contact-load/DNC/outbound/MA-script tests pass; 15 telephony attribution-route tests pass. No database writes or external deployments were performed.
