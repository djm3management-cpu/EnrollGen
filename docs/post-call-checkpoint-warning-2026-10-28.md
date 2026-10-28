# Recovered checkpoint warning — October 28, 2026

Dylan's session `8e33650a-d8c1-4515-9d6b-9c41127bcd76` retained a failed
checkpoint submitted at 1:16:17 PM Eastern and expired at 1:32:20 PM with
`worker_timeout`. Final transcript saves succeeded at 1:38:23 PM and 1:40:55 PM.
The transcript was present, but queue completion counted every historical failed
request as a current failure. A later success also cleared the job error code,
causing the alert to display the generic `processing_failed` message.

Migration `117_recovered_checkpoint_status.sql` reconciles terminal job status.
A checkpoint worker timeout is resolved only by a later completed transcript save
in the same session, with a saved transcript and call record, and matching the
checkpoint's call record when provided. Other request failures and provider errors
remain failures. Requests retain their original status and error for audit and
deduplication. Active workers retain ownership of progress.

Applied the migration to the linked production database through the Supabase CLI.
Readback confirmed Dylan's job is `completed`, with no error or provider errors,
two successful final saves, and the original timeout still retained. The existing
five-second status poll clears the alert without a frontend update. No call work
was replayed.

Validation: all 555 application tests passed. The focused 15-test post-call suite
also passed after the final changes, including recovery, genuine failures,
provider errors, worker completion, authorization and retained failure history.
Targeted ESLint and diff checks passed.
