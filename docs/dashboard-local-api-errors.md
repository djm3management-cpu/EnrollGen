# Local dashboard failure after e2b3f4e / 12b5948

Confirmed on `http://localhost:5173/dashboard` in Chrome. The console showed:

`TypeError: Cannot read properties of undefined (reading 'map')` in `AgentStatusLog.jsx`.

The request to `/.netlify/functions/agent-status-log` on port 5173 returned HTTP 200 with `Content-Type: text/html` and Vite's `index.html`. The Vite configuration has no functions proxy: the frontend server does not execute Netlify Functions. `evidenceRequest` swallowed the failed JSON parse and returned `{}`. The status-log component accepted that object, replaced its safe empty arrays, and crashed on `current.agents.map`. The enclosing `PanelErrorBoundary` then replaced the entire dashboard with “Panel failed to load.” Moving the status log below the charts did not isolate its render errors.

## Query dependencies checked

| Dashboard data | Sources |
|---|---|
| Roster matching | `enrolled_agents` and the existing tenant roster |
| Call/sales/compliance metrics | `call_records`, including `parent_call_id`, with the existing `compliance_scorecards` relationship |
| Measured durations and additional call-log entries | `call-log` function → `v_call_log`, `telephony_call_attempts` |
| Contact counts | `contacts.id`, `contacts.assigned_agent_id` |
| Status history | `agent-status-log` function → `availability_agent_subjects`, `agent_availability`, `agent_availability_log` |
| Paragon callbacks | `paragon-zip-confirm` function → existing callback tasks |

None of these queries reads `enrollment_intakes`, compliance upload queues, or new enrollment columns from migrations 123–125. Existing migrations such as 118 (combined-call fields/view) and 120 (status-log triggers/indexes) are relevant to these features, but the observed failure was an HTML API fallback, not a missing database relation. No migration is required for this fix.

## Fix and verification

The shared API helper now rejects invalid JSON, including successful HTML responses. Status history validates its arrays/count/timestamps before updating state; invalid responses and failed queries use its inline error/retry UI and retain previously loaded rows on polling failures. Paragon callbacks also validate responses and clear an old error after recovery. Dashboard page queries reject invalid row payloads inside their existing error handler. Compliance metrics accept either a scorecard array or a single object, avoiding a second possible render-time iteration error.

Regression tests cover HTML/malformed JSON, malformed history rows, unavailable queries, successful retries, preservation of previously loaded status history, and failure of each dashboard data source. The local browser was checked after the fix: chart panels, dashboard filters and the status log remain visible, while unavailable functions report inline errors. Actual API data still requires a running local Netlify Functions backend/proxy; running only Vite does not provide those endpoints.
