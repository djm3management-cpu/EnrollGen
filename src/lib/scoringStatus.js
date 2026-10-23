export function scoringFailureMessage(record) {
  const metadata = record?.metadata || {};
  // The saved compliance state wins over error metadata left from an older run.
  const failed = record?.compliance_status
    ? record.compliance_status === 'failed'
    : metadata.scoring_status === 'failed';
  if (!failed) return null;
  const code = metadata.scoring_error_code;
  const detail = code === 'scoring_attempts_exhausted'
    ? 'Automatic retries have stopped.'
    : code === 'call_token_budget_exceeded'
      ? 'This call reached the scoring limit.'
      : metadata.scoring_error || 'Scoring could not finish.';
  return `${detail} Your transcript is retained. Contact your administrator to retry scoring.`;
}
