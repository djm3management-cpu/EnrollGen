# Ping screener default script (draft)

**Status: draft. Owner review required before approval.**

This is the default draft prompt set for the scripted screener (spec section 13,
owner decision D4). It is not seeded into any database and is never spoken until
an owner inserts it as a `screener_scripts` row for a campaign and approves it with
`approve_screener_script(script_id, approved_by)`. Every caller-facing line the
screener speaks comes from an approved row; the model only classifies answers.

| Column | Text |
| --- | --- |
| `opening` | Thanks for calling. You've reached an automated assistant that connects you with a licensed insurance agent. This call may be recorded. |
| `q_medicare` | Are you on Medicare now, or turning 65 in the next few months? Say yes or no, or press 1 for yes. |
| `q_zip` | What's your five-digit ZIP code? |
| `q_reason` | In a few words, what can we help you with today? |
| `q_connect` | Would you like me to connect you with a licensed agent now? Say yes, or press 1. |
| `pass_line` | Great, connecting you now. |
| `fail_line` | Thanks for calling. For questions about your current plan, please call the member services number on your insurance card. Goodbye. |
| `disclaimer` | Not set. Operator config; spoken right after the opening when present. |
| `voice` | `Polly.Joanna` (the default) |

## Review checklist

1. Confirm the automated assistant disclosure and the recording notice in `opening`
   meet the operator's state requirements.
2. Supply `disclaimer` text if counsel requires one.
3. Confirm `fail_line` is acceptable for callers who say they are not on Medicare or
   decline to be connected.
4. Approve the row; approving a new version retires the campaign's previous approved
   script, and both actions are audited in `screener_script_audit`.
