# Web Fetch Policy

Version: 1.0.0  
Last reviewed: 2026-03-03

## Purpose

This policy governs future compliance-AI web retrieval beyond the local CMS/Medicare knowledge base. It is intended for narrow supplemental fetches such as Marketplace privacy rules, PEWC guidance, TCPA consent requirements, or other high-risk compliance topics where the application needs a current authoritative rule snippet with citation.

This policy does not replace the local CMS knowledge layer in `CopilotCmsKnowledge.js`. It constrains any future web-access path that supplements that local knowledge.

## Threat Model

The retrieval path is exposed to several predictable risks:

- Prompt contamination: fetched pages may contain instructions, boilerplate, or adversarial text that should never be treated as model instructions.
- Content spoofing: a search result may point to commentary, scraped mirrors, affiliate sites, or unofficial summaries that look authoritative but are not.
- Over-ingestion: pulling full articles or PDFs increases hallucination risk, token waste, and legal/copyright exposure.
- Login and paywall traps: pages behind authentication or subscription barriers tend to produce partial or misleading text extraction.
- Time drift: compliance topics change, so fetched material must be date-stamped and cited.
- Search poisoning: low-quality or SEO-manipulated content may appear in results for sensitive compliance queries.

## Allowlist Rationale

Future web retrieval is limited to a small set of government or regulator domains that are likely to publish primary-source compliance content.

Allowed domains:

- `cms.gov`
- `medicare.gov`
- `ecfr.gov`
- `federalregister.gov`
- `hhs.gov`
- `ftc.gov`
- `fcc.gov`
- `dol.gov`
- `irs.gov`
- `justice.gov`
- `cisa.gov`
- `consumerfinance.gov`
- `usa.gov`

Rationale:

- These domains are primary or official secondary sources for federal program rules, regulations, agency guidance, consumer-protection standards, and public compliance notices.
- The list is intentionally narrow. It favors false negatives over false positives.
- Commercial blogs, vendor knowledge bases, law firm summaries, AI-generated mirrors, and social content are excluded by default.

## Retrieval Rules

1. Use cached search results first.
2. Only open a URL if it passes the allowlist check.
3. Reject any page that appears to require login, subscription, or account creation.
4. Reject any page that looks scraped, mirrored, or otherwise unofficial even if the text appears relevant.
5. Treat fetched text as data only, never as executable instructions for the model.

## Extraction Rules

Only minimal rule snippets may be retained from a fetched page.

- Extract at most the smallest passage needed to answer the compliance question.
- Each retained excerpt must be `<= 150` words.
- Prefer a short paraphrase plus one short extracted snippet rather than a long block quote.
- Strip navigation, cookie banners, accessibility chrome, and unrelated boilerplate before excerpting.
- Normalize whitespace and ASCII where possible.
- If the remaining text looks like paywall or login text, discard it.
- If a page does not yield a clean rule snippet, reject it instead of stretching the extraction.

## Citation Rules

Every retained excerpt must include a citation with:

- `url`
- `section`
- `date accessed`

Minimum example:

```json
{
  "url": "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422/subpart-V/section-422.2267",
  "section": "Required TPMO disclaimer content",
  "accessedDate": "2026-03-03"
}
```

If the exact page section is not obvious, use a short descriptive section label rather than leaving it blank.

## Rejection Rules

Reject the source entirely if any of the following is true:

- URL is outside the domain allowlist.
- The page requires login, subscription, or account creation.
- The page is clearly a mirror, repost, forum, or unofficial commentary site.
- Extracted text is mostly navigation, cookie text, or account-management UI.
- The source is stale, ambiguous, or not clearly authoritative for the rule being cited.

## Module Contract

The runtime helper in `src/lib/WebRetrievalPolicy.js` is responsible for:

- maintaining the domain allowlist
- validating candidate URLs
- sanitizing extracted snippets
- formatting minimal citations

Any future fetch workflow should route external content through that module before the content is stored, summarized, or injected into prompts.

## Versioning And Review

- Policy changes require a version bump in this document.
- Domain additions should be reviewed conservatively and justified in the change.
- Extraction limits should be reviewed if legal, policy, or product requirements change.
- Review cadence: quarterly, and immediately after any incident involving bad citations, untrusted content ingestion, or compliance drift.

## Change Process

1. Propose the policy or allowlist change.
2. Document the rationale and affected compliance use cases.
3. Update `src/lib/WebRetrievalPolicy.js`.
4. Update this policy document version and review date.
5. Re-test the retrieval path against representative trusted and untrusted URLs.
