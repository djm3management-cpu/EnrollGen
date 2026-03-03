export const ALLOWED_DOMAINS = [
  "cms.gov",
  "medicare.gov",
  "ecfr.gov",
  "federalregister.gov",
  "hhs.gov",
  "ftc.gov",
  "fcc.gov",
  "dol.gov",
  "irs.gov",
  "justice.gov",
  "cisa.gov",
  "consumerfinance.gov",
  "usa.gov",
];

const BLOCKED_PATH_PATTERNS = [
  /\/login/i,
  /\/signin/i,
  /\/sign-in/i,
  /\/account/i,
  /\/checkout/i,
  /\/subscribe/i,
  /\/paywall/i,
  /\/wp-login/i,
];

const PAYWALL_OR_LOGIN_MARKERS = [
  "subscribe to continue",
  "sign in to continue",
  "log in to continue",
  "create an account to continue",
  "this content is for subscribers",
  "remaining article",
  "purchase subscription",
  "member-only content",
  "members only",
  "enable cookies to continue",
];

const MAX_EXCERPT_WORDS = 150;

function normalizeHostname(hostname) {
  return (hostname || "").toLowerCase().replace(/^www\./, "");
}

function isAllowedHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return ALLOWED_DOMAINS.some(
    (allowedDomain) =>
      normalized === allowedDomain || normalized.endsWith(`.${allowedDomain}`)
  );
}

export function isAllowedUrl(url) {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) return false;
    if (!isAllowedHostname(parsed.hostname)) return false;
    if (BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(parsed.pathname))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function looksRestrictedContent(text = "") {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return PAYWALL_OR_LOGIN_MARKERS.some((marker) => normalized.includes(marker));
}

export function sanitizeExcerpt(text) {
  const normalized = (text || "")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();

  if (!normalized) return "";
  if (looksRestrictedContent(normalized)) return "";

  const words = normalized.split(" ").filter(Boolean).slice(0, MAX_EXCERPT_WORDS);
  let excerpt = words.join(" ").trim();

  if (!excerpt) return "";

  if (!/[.!?]$/.test(excerpt)) {
    const lastSentenceBreak = Math.max(
      excerpt.lastIndexOf("."),
      excerpt.lastIndexOf("!"),
      excerpt.lastIndexOf("?"),
      excerpt.lastIndexOf(";")
    );

    if (lastSentenceBreak > 40) {
      excerpt = excerpt.slice(0, lastSentenceBreak + 1).trim();
    } else if (words.length === MAX_EXCERPT_WORDS) {
      excerpt = `${excerpt}...`;
    }
  }

  return excerpt;
}

export function formatCitation({ url, section = "", accessedAt = new Date() }) {
  const accessedDate =
    accessedAt instanceof Date
      ? accessedAt.toISOString().slice(0, 10)
      : String(accessedAt).slice(0, 10);

  return {
    url,
    section: section || "Unspecified section",
    accessedDate,
  };
}

export function buildCitedExcerpt({ url, section = "", text = "", accessedAt }) {
  if (!isAllowedUrl(url)) return null;

  const excerpt = sanitizeExcerpt(text);
  if (!excerpt) return null;

  return {
    excerpt,
    citation: formatCitation({ url, section, accessedAt }),
  };
}
