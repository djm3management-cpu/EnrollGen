# Production read query log

Only the reads below were performed for this implementation task. No migration SQL or write RPC was run. Repeated local source/report/test reads are not production queries. The preceding report-only audit is a separate earlier turn.

```text
GET call_records?select=*&call_start=gte.2026-10-01T00:00:00Z&limit=500&offset=0&order=id.asc
GET scoring_templates?select=*&is_active=eq.true&limit=500&offset=0&order=id.asc
GET scoring_template_items?select=*&limit=500&offset=0&order=id.asc
GET scoring_template_items?select=*&limit=500&offset=500&order=id.asc
GET compliance_intents?select=*&limit=500&offset=0&order=id.asc
GET compliance_scorecards?select=*&created_at=gte.2026-10-01T00:00:00Z&limit=500&offset=0&order=id.asc
GET scorecard_items?select=*&limit=500&offset=0&order=id.asc
GET scorecard_items?select=*&limit=500&offset=500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=1000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=1500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=2000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=2500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=3000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=3500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=4000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=4500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=5000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=5500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=6000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=6500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=7000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=7500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=8000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=8500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=9000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=9500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=10000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=10500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=11000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=11500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=12000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=12500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=13000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=13500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=14000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=14500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=15000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=15500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=16000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=16500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=17000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=17500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=18000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=18500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=19000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=19500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=20000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=20500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=21000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=21500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=22000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=22500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=23000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=23500&order=id.asc
GET scorecard_items?select=*&limit=500&offset=24000&order=id.asc
GET scorecard_items?select=*&limit=500&offset=24500&order=id.asc
GET enrolled_agents?select=*&limit=500&offset=0&order=id.asc
GET contacts?select=*&limit=500&offset=0&order=id.asc
GET telephony_call_attempts?select=*&limit=500&offset=0&order=id.asc
GET availability_agent_subjects?select=*&order=tenant_id.asc&limit=1000
GET recording_agent_subjects?select=*&order=tenant_id.asc&limit=1000
GET telephony_events?select=*&twilio_call_sid=eq.CA8107a2a6e1d4e3bd92701814e99bd33b&order=created_at.asc&limit=1000
GET call_records?select=*&order=id.asc&limit=500&offset=0
GET compliance_scorecards?select=*&order=id.asc&limit=500&offset=0
```

The following existing function calls are read-only. Exact encrypted request bodies are in the private local `name-read-query-log.json`; contact names and encryption payloads are deliberately not committed. Each was executed as `POST /rest/v1/rpc/decrypt_pii_value`, equivalent to the prepared SELECT shown.

```sql
SELECT public.decrypt_pii_value($1::jsonb); -- 1: contact 294745d4-4261-4e4d-a943-13033c0f07d9, first_name; binding private log [0].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 2: contact 294745d4-4261-4e4d-a943-13033c0f07d9, last_name; binding private log [1].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 3: contact 41f48201-c7a2-427e-85c0-ecb22f3ac31a, first_name; binding private log [2].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 4: contact 41f48201-c7a2-427e-85c0-ecb22f3ac31a, last_name; binding private log [3].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 5: contact 4a451a3f-9344-4c40-8d59-d14b7c354d57, first_name; binding private log [4].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 6: contact 53c9e603-c571-42fd-8684-1789acc894cf, first_name; binding private log [5].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 7: contact 53c9e603-c571-42fd-8684-1789acc894cf, last_name; binding private log [6].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 8: contact 7297b4c2-7082-4e44-b576-cf0ecb728779, first_name; binding private log [7].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 9: contact 753b3479-7900-4e6f-b89a-78b7b64fa007, first_name; binding private log [8].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 10: contact 753b3479-7900-4e6f-b89a-78b7b64fa007, last_name; binding private log [9].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 11: contact 832cba3a-2f2c-4811-881f-b4f8664c4301, first_name; binding private log [10].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 12: contact 832cba3a-2f2c-4811-881f-b4f8664c4301, last_name; binding private log [11].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 13: contact 99e758c3-051b-4e56-84ff-9db2b9c2a80a, first_name; binding private log [12].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 14: contact 99e758c3-051b-4e56-84ff-9db2b9c2a80a, last_name; binding private log [13].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 15: contact 9dc968ff-8a48-46c4-9c0c-4b34c24ce5d5, first_name; binding private log [14].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 16: contact 9dc968ff-8a48-46c4-9c0c-4b34c24ce5d5, last_name; binding private log [15].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 17: contact a20fe982-41a2-4bec-8011-643f67c0075c, first_name; binding private log [16].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 18: contact a20fe982-41a2-4bec-8011-643f67c0075c, last_name; binding private log [17].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 19: contact a7ca350b-5006-4212-bdc8-a6e8c842d7c4, first_name; binding private log [18].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 20: contact a7ca350b-5006-4212-bdc8-a6e8c842d7c4, last_name; binding private log [19].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 21: contact d26fcda7-c274-4b3f-a44e-512d38372eb3, first_name; binding private log [20].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 22: contact d26fcda7-c274-4b3f-a44e-512d38372eb3, last_name; binding private log [21].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 23: contact d6b21dcc-b627-4f69-877c-f208ba2c7f0b, first_name; binding private log [22].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 24: contact d6b21dcc-b627-4f69-877c-f208ba2c7f0b, last_name; binding private log [23].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 25: contact dc8f7deb-cc80-4a04-8e49-96c7cec97b72, first_name; binding private log [24].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 26: contact dc8f7deb-cc80-4a04-8e49-96c7cec97b72, last_name; binding private log [25].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 27: contact e45ab0b4-cbfc-4ba1-b573-9db460ef604c, first_name; binding private log [26].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 28: contact e45ab0b4-cbfc-4ba1-b573-9db460ef604c, last_name; binding private log [27].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 29: contact ea6c1af8-2d1a-4b00-ba35-8a7a1934491b, first_name; binding private log [28].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 30: contact ea6c1af8-2d1a-4b00-ba35-8a7a1934491b, last_name; binding private log [29].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 31: contact f40e704a-9b80-4e63-ab23-2f97e5dd67d0, first_name; binding private log [30].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 32: contact fc562812-ca6e-4a0f-801d-cef511b78496, first_name; binding private log [31].body.p_encrypted
SELECT public.decrypt_pii_value($1::jsonb); -- 33: contact fc562812-ca6e-4a0f-801d-cef511b78496, last_name; binding private log [32].body.p_encrypted
```

## Script/stage scoring continuation

No new production SQL or RPC queries were executed in this continuation. The dry runs read the existing local October 1 snapshot. SQL added/edited in migrations 132/133/134/138/141 is an unapplied source proposal, not a record of executed queries. Primary eCFR pages were read to verify the narrow CMS-only allowlist exceptions.

## CMS-only continuation

No production SQL or RPC query was executed. The same private local 376-call snapshot was used. Primary CMS/eCFR/govinfo sources were read for citations; the final local PDF was read for wording. Generated migration 142 and edited pending migration text were not executed.
