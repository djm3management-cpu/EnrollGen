// Approved public prices. These are not credentials. Caps cannot be raised by env.
export const SCORING_DAILY_TOKEN_CAP = 2000000;
export const SCORING_INPUT_USD_PER_MILLION = 0.20;
export const SCORING_OUTPUT_USD_PER_MILLION = 1.20;
export const SCORING_CACHED_INPUT_USD_PER_MILLION = 0.02;
export const DEEPGRAM_BATCH_PER_MINUTE_USD = 0.0043;
export const JUDGMENT_MAX_OUTPUT_TOKENS = 4096;
export function scoringCost(inputTokens, outputTokens, cachedTokens = 0) {
 const input = Math.max(0, Number(inputTokens) || 0);
 const cached = Math.min(input, Math.max(0, Number(cachedTokens) || 0));
 return ((input-cached)*SCORING_INPUT_USD_PER_MILLION + cached*SCORING_CACHED_INPUT_USD_PER_MILLION + Math.max(0,Number(outputTokens)||0)*SCORING_OUTPUT_USD_PER_MILLION)/1e6;
}
export function scoringDailyCap(env = {}) {
 const configured=Number(env.SCORING_DAILY_TOKEN_CAP ?? SCORING_DAILY_TOKEN_CAP);
 if(!Number.isSafeInteger(configured)||configured<1)throw Error('Invalid daily scoring cap');
 return Math.min(configured,SCORING_DAILY_TOKEN_CAP);
}
