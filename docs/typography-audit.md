# EnrollGen primary typeface change

Avenir Next is now first, with Nunito Sans and the requested system fallbacks. Nunito Sans is requested at 400, 600, and 700 with display=swap in index.html. The stack is defined once in the eagerly loaded global src/styles/design-tokens.css, so it is available before the authenticated styles load. Every explicit non-monospace family consumer uses var(--font-primary). Legacy typography tokens alias it for compatibility. Existing numeric weights remain intact; demi-bold is 600, with no face-specific Demi Bold family name.

## Component-specific stacks (reported before editing)

| Component | Previous stack and apparent purpose | Change |
| --- | --- | --- |
| Clerk authentication, src/App.jsx | System sans stack for authentication titles, subtitles, social buttons, inputs and appearance variables | All five consumers use the primary property; removed duplicated sans constant. |
| EnrollGen wordmark, LandingPage.css and v3-overrides.css | Formula1 / Verdana / Arial for branded text | Uses primary property, retains weight 700; removed unused Formula1 font-face registration. Image assets are unaffected. |
| DailyVerse quote glyph, .dv-quote-glyph | EB Garamond / Cormorant Garamond / Georgia for decorative quotation mark | Uses primary property. This is a decorative glyph, not the main verse body. |
| DailyVerse Hebrew text, .dv-original-text.is-hebrew | Noto Serif Hebrew / Times New Roman for original-language typography | Uses primary property; browser glyph fallback may apply for Hebrew. Direction, alignment and line height remain intact. |
| DailyVerse favorites preview, .dv-favorites-preview | EB Garamond / Georgia for italic literary preview | Uses primary property; italic styling and two-line clamp remain. |
| Shared design tokens | Neue Haas Grotesk / Neue Haas Grotesk Text / Avenir / system sans for body and display text | Replaced with single requested stack. |

The other changed components below already referenced shared body/display/script tokens rather than independent literal stacks. Their explicit declarations now directly reference the primary property. Inherit declarations remain intact, including font shorthands, to preserve inherited monospace contexts.

## Changed files

- [src/AgentTools.css](../src/AgentTools.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/App.jsx](../src/App.jsx) — Update Clerk appearance and remove duplicated sans stack.
- [src/SEPLookupTool.css](../src/SEPLookupTool.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/ACAIntelligence.jsx](../src/components/ACAIntelligence.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/CallHistory.jsx](../src/components/CallHistory.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/CarrierRef.jsx](../src/components/CarrierRef.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/ComplianceDashboard.jsx](../src/components/ComplianceDashboard.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/FplCalculatorPanel.jsx](../src/components/FplCalculatorPanel.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/LandingPage.css](../src/components/LandingPage.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/MedSupFlow.jsx](../src/components/MedSupFlow.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/MiniLiveTranscript.jsx](../src/components/MiniLiveTranscript.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/SEPGuide2026.jsx](../src/components/SEPGuide2026.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/SEPResultsModal.css](../src/components/SEPResultsModal.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/ScriptEditor.css](../src/components/ScriptEditor.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/components/sep/StateMap.jsx](../src/components/sep/StateMap.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/flows/aca/ACAFlow.jsx](../src/flows/aca/ACAFlow.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/flows/aca/ACAScript.jsx](../src/flows/aca/ACAScript.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/flows/aca/StateACAFlow.jsx](../src/flows/aca/StateACAFlow.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/flows/ancillary/AncillaryFlow.jsx](../src/flows/ancillary/AncillaryFlow.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/flows/u65/U65Script.jsx](../src/flows/u65/U65Script.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/main.jsx](../src/main.jsx) — Replace shared non-monospace family references with var(--font-primary).
- [src/styles.css](../src/styles.css) — Update global family consumers, DailyVerse exceptions, and typography comment.
- [src/styles/design-tokens.css](../src/styles/design-tokens.css) — Define primary stack and compatibility aliases; remove obsolete wordmark font registration.
- [src/styles/phone-dropdown.css](../src/styles/phone-dropdown.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/styles/public-shell.css](../src/styles/public-shell.css) — Replace shared non-monospace family references with var(--font-primary).
- [src/styles/v3-overrides.css](../src/styles/v3-overrides.css) — Replace shared non-monospace family references with var(--font-primary).
- [index.html](../index.html) — Add Nunito Sans stylesheet link.
- [docs/typography-audit.md](../docs/typography-audit.md) — This audit and complete retained-monospace inventory.

## Layout risk assessment

This is a conservative source audit, not a rendered comparison of the two installed faces. Neither face is assumed universally wider: the wider result depends on the string and weight. The locations below can wrap, truncate sooner, or require more horizontal room if the chosen face produces a wider string. Existing ellipsis and horizontal scrolling are identified as mitigations, not treated as verified failures. No hard widths or layout adjustments were added. Authenticated states and cross-platform font metrics have not been visually verified.

| Component / elements | Constraint and possible outcome |
| --- | --- |
| App navigation and wordmark | .sidebar-tab, .tabs .tab and .top-bar-tab are nowrap; the sidebar is 180px and the top bar shares space with branding/utilities. Wider labels consume more room and can overflow at tight viewports. The modern logo width override is auto, so its old 118px width is not the effective constraint. |
| Top-bar profile / wallpaper selector | Profile name has a 140px maximum and ellipsis; wallpaper selection text also truncates. Wider strings truncate earlier. |
| LandingPage | Wordmark, navigation CTA, buttons and footer links have nowrap; their flex rows can crowd. Hero has large type and bounded width, so line breaks may change. Terminal/compliance demo labels use preserved mono where explicitly styled. |
| Clerk authentication | Card is min(430px, viewport minus 32px), with 22px padding. Title/subtitle/social-button text and inputs have less available room on mobile; wrapping/clipping is possible. |
| ComplianceMini / compliance panel | 310px right rail; category name uses inline nowrap/ellipsis beside an 18px icon, 50px bar and score. Names can truncate sooner. Section labels flex beside a 32px bar and score and can wrap. Scores remain mono. |
| ComplianceDashboard / ComplianceIntentAccordion / ComplianceReviewModal | Truncated dashboard labels and accordion trigger titles; review category header grid reserves a 90px column. Longer labels may truncate or wrap. Operations mono overrides remain unchanged where applicable. |
| CallHistory | Headers and cells explicitly use the new font and nowrap; uppercase headers have 0.12em tracking. Table needs more horizontal space for wider strings. |
| PrivatePlanPanel / PrivatePlanCard / DentalReferencePanel / UnderwritingChecker | Fixed-layout rates table reserves 68% for headers and 32% for values; headers can wrap and unbreakable amounts can overflow. Dental price text is nowrap; compact status/badge rows can crowd. |
| SEPFinder / SEPQualifier | Single-line start trigger, action buttons, timestamp and uppercase table headers; wider strings consume more rail/table width. Table wrapper scrolls horizontally. Card names ellipsize. |
| SNPRoutingWidget | Status pill is nowrap and shares its header with other metadata; longer statuses can crowd/overflow. |
| SEPLookup / SEP plan and sub-tables / CountyGrid | Search action, table headers and county tiles are nowrap. Existing mono table/header declarations stay unchanged; inherited sans text still requires room. |
| CarrierRef | Inline nowrap table headers and category/filter controls, including tracked bold text, can enlarge tables or crowd rows. Numeric mono data stays unchanged. |
| ACAIntelligence / ACAFlow | Intelligence table labels and ACA eligibility-window/range cells use nowrap. Table headings can wrap where not constrained, while nowrap cells expand required width. |
| FplCalculatorPanel | Absolute-positioned 400% FPL marker is nowrap and centered at 75%; a wider label can crowd adjacent markers or extend beyond a narrow gauge. |
| LeftRailManager / AncillaryClientSidebar / ancillary popups | Tool buttons and product labels ellipsize; product list is capped at 240px. Popup cards have bounded widths and pill labels are nowrap. Text can truncate or wrap sooner. |
| PlanContextCard / plan lookup | Submit/clear labels are nowrap; result name is two-line clamped and metadata ellipsizes. Some current submit variants are icon-only and have no text-width risk. |
| ContactsTab / ContactDetail / MessagesThread | Table headers/cells and workspace tabs are nowrap; conversation titles/previews and right-card text ellipsize. Fixed/minimum grid tracks in timelines, call rows and conversation panels can crowd labels. |
| IncomingCallToast / ActiveCallBar / DialerPanel / ActiveCallExpanded | Toast/bar/panel widths are 320/300/280px, names ellipsize, dialer navigation has five equal tracks with nowrap labels. Many inherit the preserved phone mono root; the new sans note text may wrap differently. |
| DailyVerse | Original-language gloss is nowrap; favorites preview has a two-line clamp. Wider glyphs can overflow glosses or shorten previews. Decorative quote glyph shape/extent also changes. |
| U65 script screens / CenterTimerBar / section controls | U65 screen/group titles ellipsize; sticky timer is 76px with a two-line section clamp; coach tooltip and timer toast are nowrap. Preserved mono timers themselves are unaffected. |
| ClientQuickScripts / FE / Medicare first-card layouts | Label columns of 96px, 124–150px and 76px can wrap with wider text; adjacent script content has less room. |
| BillingSettings / TenantSettings / Onboarding / AgentTools | Multi-column cards, tenant agent rows and five-step onboarding tracks constrain long labels/buttons; they may wrap sooner. These are responsive grids, not confirmed overflows. |
| OperationsTab / AgentDashboard | Operations tabs/filter strips and table cells have fixed tracks/nowrap/ellipsis. AgentDashboard metric strip scrolls horizontally. Explicit terminal mono styling is preserved, so those strings have no new Avenir/Nunito metric change. |
| RTSTab / RTSIngestionPanel | Fixed-layout tables with assigned column widths and ellipsis; review badges are nowrap. Explicit mono styling is preserved; existing clipping remains a separate review point. |
| AvailabilityStrip / AgentAvailabilityToggle / exit-call controls / SMS toast | Availability and exit-call labels are nowrap; menu is 156px; toast preview is line-clamped. Mono controls are unchanged; inherited sans previews can truncate sooner. |

## Exact single-line and clamped selectors

The following exhaustive source inventory identifies every CSS rule with nowrap, ellipsis, a line clamp, or fixed table layout, plus inline JSX nowrap/ellipsis declarations. It includes legacy and responsive rules; an entry alone does not prove it wins the cascade. Cross-reference the separate monospace inventory below to distinguish retained terminal text.

- [src/SEPLookupTool.css:52](../src/SEPLookupTool.css#L52) — `.sep-search-bar .primary`: white-space: nowrap.
- [src/SEPLookupTool.css:242](../src/SEPLookupTool.css#L242) — `.sep-plan-table th`: white-space: nowrap.
- [src/SEPLookupTool.css:1024](../src/SEPLookupTool.css#L1024) — `.sep-cg-tile`: white-space: nowrap.
- [src/SEPLookupTool.css:1100](../src/SEPLookupTool.css#L1100) — `.sep-sub-table th`: white-space: nowrap.
- [src/SEPLookupTool.css:1138](../src/SEPLookupTool.css#L1138) — `.nowrap`: white-space: nowrap.
- [src/components/ACAIntelligence.jsx:485](../src/components/ACAIntelligence.jsx#L485) — `fontSize: "0.68rem", color: "var(--text-primary)", whiteSpace: "nowrap",`.
- [src/components/CallHistory.jsx:131](../src/components/CallHistory.jsx#L131) — `whiteSpace: "nowrap",`.
- [src/components/CallHistory.jsx:141](../src/components/CallHistory.jsx#L141) — `whiteSpace: "nowrap",`.
- [src/components/CarrierRef.jsx:192](../src/components/CarrierRef.jsx#L192) — `whiteSpace: "nowrap",`.
- [src/components/CarrierRef.jsx:221](../src/components/CarrierRef.jsx#L221) — `whiteSpace: "nowrap",`.
- [src/components/CarrierRef.jsx:425](../src/components/CarrierRef.jsx#L425) — `fontFamily: "var(--font-primary)", whiteSpace: "nowrap",`.
- [src/components/CarrierRef.jsx:1219](../src/components/CarrierRef.jsx#L1219) — `fontFamily: "var(--font-primary)", whiteSpace: "nowrap",`.
- [src/components/CarrierRef.jsx:1326](../src/components/CarrierRef.jsx#L1326) — `whiteSpace: "nowrap",`.
- [src/components/CollapsibleWidget.jsx:126](../src/components/CollapsibleWidget.jsx#L126) — `whiteSpace: "nowrap",`.
- [src/components/CollapsibleWidget.jsx:128](../src/components/CollapsibleWidget.jsx#L128) — `textOverflow: "ellipsis",`.
- [src/components/ComplianceDashboard.jsx:198](../src/components/ComplianceDashboard.jsx#L198) — `whiteSpace: "nowrap",`.
- [src/components/ComplianceDashboard.jsx:200](../src/components/ComplianceDashboard.jsx#L200) — `textOverflow: "ellipsis",`.
- [src/components/ComplianceDashboard.jsx:652](../src/components/ComplianceDashboard.jsx#L652) — `whiteSpace: "nowrap",`.
- [src/components/ComplianceDashboard.jsx:654](../src/components/ComplianceDashboard.jsx#L654) — `textOverflow: "ellipsis",`.
- [src/components/ComplianceMini.jsx:269](../src/components/ComplianceMini.jsx#L269) — `whiteSpace: "nowrap",`.
- [src/components/ComplianceMini.jsx:271](../src/components/ComplianceMini.jsx#L271) — `textOverflow: "ellipsis",`.
- [src/components/FplCalculatorPanel.jsx:256](../src/components/FplCalculatorPanel.jsx#L256) — `whiteSpace: "nowrap",`.
- [src/components/LandingPage.css:49](../src/components/LandingPage.css#L49) — `.landing-logo-text`: white-space: nowrap; text-overflow: ellipsis.
- [src/components/LandingPage.css:91](../src/components/LandingPage.css#L91) — `.landing-nav-cta, .landing-button, .landing-footer a`: white-space: nowrap.
- [src/components/LandingPage.css:375](../src/components/LandingPage.css#L375) — `.landing-terminal-row strong, .landing-compliance-row strong`: white-space: nowrap.
- [src/components/LandingPage.css:400](../src/components/LandingPage.css#L400) — `.landing-terminal-ai`: text-overflow: ellipsis; white-space: nowrap.
- [src/flows/aca/ACAFlow.jsx:378](../src/flows/aca/ACAFlow.jsx#L378) — `<td style={{ padding: "7px 10px", color: ACCENT, verticalAlign: "top", whiteSpace: "nowrap" }}>{row.window}</td>`.
- [src/flows/aca/ACAFlow.jsx:434](../src/flows/aca/ACAFlow.jsx#L434) — `<td style={{ padding: "7px 10px", color: ACCENT, fontWeight: 400, whiteSpace: "nowrap" }}>{row.range}</td>`.
- [src/styles.css:681](../src/styles.css#L681) — `.sidebar-tab`: white-space: nowrap.
- [src/styles.css:793](../src/styles.css#L793) — `.tabs .tab`: white-space: nowrap.
- [src/styles.css:1280](../src/styles.css#L1280) — `.ancillary-popup-pill-label`: white-space: nowrap.
- [src/styles.css:1716](../src/styles.css#L1716) — `.right-rail-toggle-section`: text-overflow: ellipsis.
- [src/styles.css:3023](../src/styles.css#L3023) — `.operations-tab .ops-terminal-tabs`: white-space: nowrap.
- [src/styles.css:3033](../src/styles.css#L3033) — `.operations-tab .ops-terminal-tabs span`: text-overflow: ellipsis.
- [src/styles.css:3057](../src/styles.css#L3057) — `.operations-tab .ops-filter-strip`: white-space: nowrap.
- [src/styles.css:3075](../src/styles.css#L3075) — `.operations-tab .ops-filter-box`: text-overflow: ellipsis.
- [src/styles.css:3105](../src/styles.css#L3105) — `.operations-tab .ops-filter-title`: text-overflow: ellipsis.
- [src/styles.css:3114](../src/styles.css#L3114) — `.operations-tab .ops-ticker`: white-space: nowrap.
- [src/styles.css:3262](../src/styles.css#L3262) — `.operations-tab .ops-lb-row .name`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:3322](../src/styles.css#L3322) — `.operations-tab .ops-agent-detail-toggle span:last-child`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:3353](../src/styles.css#L3353) — `.operations-tab .ops-agent-detail-grid strong`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:3507](../src/styles.css#L3507) — `.operations-tab .ops-table thead th`: white-space: nowrap.
- [src/styles.css:3571](../src/styles.css#L3571) — `.operations-tab .ops-table tbody td`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:3635](../src/styles.css#L3635) — `.operations-tab.compliance-intent-accordion .ops-intent-accordion-trigger > span:first-child`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:3739](../src/styles.css#L3739) — `.operations-tab .ops-carrier-row .name`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:3961](../src/styles.css#L3961) — `.operations-tab .ops-agent-rank .name`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:4355](../src/styles.css#L4355) — `.operations-tab .ops-followup-row .customer`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:4363](../src/styles.css#L4363) — `.operations-tab .ops-followup-row .carrier, .operations-tab .ops-followup-row .agent, .operations-tab .ops-followup-row .notes`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:4469](../src/styles.css#L4469) — `.operations-tab .ops-tracker-row .customer`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:4479](../src/styles.css#L4479) — `.operations-tab .ops-tracker-row .meta`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:4532](../src/styles.css#L4532) — `.operations-tab .ops-status-bar .center`: white-space: nowrap.
- [src/styles.css:5057](../src/styles.css#L5057) — `.copilot-call-timer`: white-space: nowrap.
- [src/styles.css:6077](../src/styles.css#L6077) — `.u65-nepq-screen__title > strong`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:6169](../src/styles.css#L6169) — `.u65-nepq-group__toggle > strong`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:7075](../src/styles.css#L7075) — `.ancillary-refresh-btn`: white-space: nowrap.
- [src/styles.css:8032](../src/styles.css#L8032) — `.copilot-call-timer`: white-space: nowrap.
- [src/styles.css:8136](../src/styles.css#L8136) — `.sector-block-abbr`: white-space: nowrap.
- [src/styles.css:8576](../src/styles.css#L8576) — `.section-coach-btn::after`: white-space: nowrap.
- [src/styles.css:8658](../src/styles.css#L8658) — `.section-timer`: white-space: nowrap.
- [src/styles.css:8738](../src/styles.css#L8738) — `.section-timer-toast`: white-space: nowrap.
- [src/styles.css:9135](../src/styles.css#L9135) — `.dv-original-gloss`: white-space: nowrap.
- [src/styles.css:9657](../src/styles.css#L9657) — `.dv-favorites-preview`: text-overflow: ellipsis; -webkit-line-clamp: 2.
- [src/styles.css:10373](../src/styles.css#L10373) — `.sticky-timer-section`: -webkit-line-clamp: 2.
- [src/styles.css:10624](../src/styles.css#L10624) — `.sidebar-wallpaper-selector-active`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:10992](../src/styles.css#L10992) — `.top-bar-tab`: white-space: nowrap.
- [src/styles.css:11186](../src/styles.css#L11186) — `.top-bar-profile-name`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:12765](../src/styles.css#L12765) — `.ancillary-product-button__label`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:13019](../src/styles.css#L13019) — `.private-plan-card__name`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:13292](../src/styles.css#L13292) — `.private-plan-rates-table`: table-layout: fixed.
- [src/styles.css:13500](../src/styles.css#L13500) — `.private-plan-dental-card__top strong`: white-space: nowrap.
- [src/styles.css:13757](../src/styles.css#L13757) — `.sep-qualifier-start-trigger`: white-space: nowrap.
- [src/styles.css:14029](../src/styles.css#L14029) — `.agent-notes-widget-title`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:14104](../src/styles.css#L14104) — `.snp-routing-status-pill`: white-space: nowrap.
- [src/styles.css:14282](../src/styles.css#L14282) — `.sep-finder-btn`: white-space: nowrap.
- [src/styles.css:14390](../src/styles.css#L14390) — `.sep-finder-timestamp`: white-space: nowrap.
- [src/styles.css:14443](../src/styles.css#L14443) — `.sep-finder-table th`: white-space: nowrap.
- [src/styles.css:15656](../src/styles.css#L15656) — `.left-rail-tool-btn`: white-space: nowrap; text-overflow: ellipsis.
- [src/styles.css:15966](../src/styles.css#L15966) — `.sep-finder-card-name span:last-child`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:16110](../src/styles.css#L16110) — `.sep-finder-panel-disclaimer`: -webkit-line-clamp: 2.
- [src/styles.css:16975](../src/styles.css#L16975) — `.rts-table`: table-layout: fixed.
- [src/styles.css:16997](../src/styles.css#L16997) — `.rts-table th, .rts-table td`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:17113](../src/styles.css#L17113) — `.rts-cell-value > span`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:17330](../src/styles.css#L17330) — `.rts-file-input`: white-space: nowrap.
- [src/styles.css:17466](../src/styles.css#L17466) — `.rts-review-row strong, .rts-review-row small`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:17512](../src/styles.css#L17512) — `.rts-match-badge`: white-space: nowrap.
- [src/styles.css:17535](../src/styles.css#L17535) — `.rts-approval-check`: white-space: nowrap.
- [src/styles.css:17555](../src/styles.css#L17555) — `.rts-review-table`: table-layout: fixed.
- [src/styles.css:17564](../src/styles.css#L17564) — `.rts-review-table th, .rts-review-table td`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles.css:17775](../src/styles.css#L17775) — `.agent-dash-metrics`: white-space: nowrap.
- [src/styles/phone-dropdown.css:69](../src/styles/phone-dropdown.css#L69) — `.phone-toast__name`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/phone-dropdown.css:155](../src/styles/phone-dropdown.css#L155) — `.phone-active-bar__name`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/phone-dropdown.css:298](../src/styles/phone-dropdown.css#L298) — `.phone-dialer__nav-btn span`: white-space: nowrap.
- [src/styles/phone-dropdown.css:401](../src/styles/phone-dropdown.css#L401) — `.phone-dialer__row-name`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/phone-dropdown.css:626](../src/styles/phone-dropdown.css#L626) — `.phone-expanded__name`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:63](../src/styles/v3-overrides.css#L63) — `.top-bar-logo-text`: white-space: nowrap.
- [src/styles/v3-overrides.css:2486](../src/styles/v3-overrides.css#L2486) — `.eg-rail-card__field-value`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:2612](../src/styles/v3-overrides.css#L2612) — `.eg-plan-lookup__submit, .eg-plan-lookup__clear`: white-space: nowrap.
- [src/styles/v3-overrides.css:2667](../src/styles/v3-overrides.css#L2667) — `.eg-plan-lookup__result-name`: -webkit-line-clamp: 2.
- [src/styles/v3-overrides.css:2679](../src/styles/v3-overrides.css#L2679) — `.eg-plan-lookup__result-meta`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:3264](../src/styles/v3-overrides.css#L3264) — `.contacts-table th`: white-space: nowrap.
- [src/styles/v3-overrides.css:3274](../src/styles/v3-overrides.css#L3274) — `.contacts-table td`: white-space: nowrap.
- [src/styles/v3-overrides.css:3545](../src/styles/v3-overrides.css#L3545) — `.contacts-workspace-tabs button`: white-space: nowrap.
- [src/styles/v3-overrides.css:3713](../src/styles/v3-overrides.css#L3713) — `.contacts-ghl-right-collapsed .contacts-mini-btn`: white-space: nowrap.
- [src/styles/v3-overrides.css:4245](../src/styles/v3-overrides.css#L4245) — `.contacts-conv-title strong`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:4259](../src/styles/v3-overrides.css#L4259) — `.contacts-conv-preview`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:4423](../src/styles/v3-overrides.css#L4423) — `.contacts-right-card strong`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:4431](../src/styles/v3-overrides.css#L4431) — `.contacts-right-card span:not(.contacts-avatar):not(.contacts-chip)`: text-overflow: ellipsis; white-space: nowrap.
- [src/styles/v3-overrides.css:4574](../src/styles/v3-overrides.css#L4574) — `.top-bar-exit-call`: white-space: nowrap.
- [src/styles/v3-overrides.css:4638](../src/styles/v3-overrides.css#L4638) — `.availability-strip`: white-space: nowrap.
- [src/styles/v3-overrides.css:5036](../src/styles/v3-overrides.css#L5036) — `.msg-charcount`: white-space: nowrap.
- [src/styles/v3-overrides.css:5314](../src/styles/v3-overrides.css#L5314) — `.sms-toast__preview`: -webkit-line-clamp: 2.
- [src/styles/v3-overrides.css:5607](../src/styles/v3-overrides.css#L5607) — `.compliance-review-category-count`: white-space: nowrap.

## Monospace declarations retained — decision inventory

All 335 explicit monospace source lines (family declarations, font shorthands, and definitions) are unchanged. This includes data tables, transcript/code output, and terminal UI controls beyond those protected uses. No decision to convert these additional terminal controls was inferred. Below, each CSS selector or JSX declaration is listed with its current location. Inherited mono descendants are not individually enumerated.

- [src/AgentTools.css:593](../src/AgentTools.css#L593) — `.at-timeline-range`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:625](../src/AgentTools.css#L625) — `.at-matrix-mbi`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:989](../src/AgentTools.css#L989) — `.at-doc-overlay-index`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:1856](../src/AgentTools.css#L1856) — `.top-panel-overlay--tools`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:1875](../src/AgentTools.css#L1875) — `.top-panel-overlay--tools .top-panel-title`: `font-family: var(--font-mono)` !important.
- [src/AgentTools.css:1909](../src/AgentTools.css#L1909) — `.top-panel-overlay--tools .at-root`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:1964](../src/AgentTools.css#L1964) — `.top-panel-overlay--tools .at-tool-title`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:1973](../src/AgentTools.css#L1973) — `.top-panel-overlay--tools .at-tool-desc`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:1995](../src/AgentTools.css#L1995) — `.at-modal`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2006](../src/AgentTools.css#L2006) — `.at-modal-kicker`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2013](../src/AgentTools.css#L2013) — `.at-modal-title`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2020](../src/AgentTools.css#L2020) — `.at-modal-desc`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2086](../src/AgentTools.css#L2086) — `.at-modal .at-link-name,
.at-modal .at-carrier-name,
.at-modal .at-doc-title,
.at-modal .at-doc-detail-title,
.at-modal .at-doc-card-title,
.at-modal .at-doc-field-name,
.at-modal .at-sep-ref-header h4,
.at-modal .at-sep-ask`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2098](../src/AgentTools.css#L2098) — `.at-modal .at-link-desc,
.at-modal .at-doc-description,
.at-modal .at-doc-card-note,
.at-modal .at-doc-note-card,
.at-modal .at-doc-field-value,
.at-modal .at-sep-ref-header p,
.at-modal .at-sep-meta li,
.at-modal .at-sep-meta p`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2108](../src/AgentTools.css#L2108) — `.at-modal .at-doc-section-head,
.at-modal .at-doc-note-label,
.at-modal .at-doc-status-kicker,
.at-modal .at-doc-field-label,
.at-modal .at-sep-section-title,
.at-modal .at-sep-label`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2128](../src/AgentTools.css#L2128) — `.at-modal .at-badge-warning,
.at-modal .at-doc-back,
.at-modal .at-doc-status-btn`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2145](../src/AgentTools.css#L2145) — `.at-quiz-shell`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2172](../src/AgentTools.css#L2172) — `.at-quiz-stat span,
.at-quiz-question-kicker,
.at-quiz-section-title,
.at-quiz-final-kicker`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2217](../src/AgentTools.css#L2217) — `.at-quiz-question-card h4`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2238](../src/AgentTools.css#L2238) — `.at-quiz-choice`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2306](../src/AgentTools.css#L2306) — `.at-quiz-feedback-title,
.at-quiz-final-status`: `font-family: var(--font-mono)`.
- [src/AgentTools.css:2352](../src/AgentTools.css#L2352) — `.at-quiz-next-btn,
.at-quiz-secondary-btn`: `font-family: var(--font-mono)`.
- [src/App.jsx:89](../src/App.jsx#L89) — `const SYSTEM_MONO_STACK = "ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace";`.
- [src/App.jsx:167](../src/App.jsx#L167) — `fontFamily: SYSTEM_MONO_STACK,`.
- [src/App.jsx:174](../src/App.jsx#L174) — `fontFamily: SYSTEM_MONO_STACK,`.
- [src/App.jsx:195](../src/App.jsx#L195) — `fontFamily: SYSTEM_MONO_STACK,`.
- [src/SEPLookupTool.css:41](../src/SEPLookupTool.css#L41) — `.sep-search-bar input`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:88](../src/SEPLookupTool.css#L88) — `.sep-quick-zips span`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:98](../src/SEPLookupTool.css#L98) — `.sep-quick-zip-btn`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:166](../src/SEPLookupTool.css#L166) — `.sep-stat-label`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:175](../src/SEPLookupTool.css#L175) — `.sep-stat-value`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:202](../src/SEPLookupTool.css#L202) — `.sep-filter-label`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:250](../src/SEPLookupTool.css#L250) — `.sep-plan-table th`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:323](../src/SEPLookupTool.css#L323) — `.sep-plan-id-label`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:333](../src/SEPLookupTool.css#L333) — `.sep-plan-id-value.mono`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:373](../src/SEPLookupTool.css#L373) — `.sep-product-badge`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:494](../src/SEPLookupTool.css#L494) — `.sep-urgency-pill`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:526](../src/SEPLookupTool.css#L526) — `.sep-category-pill`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:547](../src/SEPLookupTool.css#L547) — `.sep-days-pill`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:603](../src/SEPLookupTool.css#L603) — `.sep-info-box-sub`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:801](../src/SEPLookupTool.css#L801) — `.sep-map-landing-hint`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:934](../src/SEPLookupTool.css#L934) — `.sep-select-county-sub`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:969](../src/SEPLookupTool.css#L969) — `.sep-cg-count`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1060](../src/SEPLookupTool.css#L1060) — `.sep-cg-tile-count`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1142](../src/SEPLookupTool.css#L1142) — `.mono`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1270](../src/SEPLookupTool.css#L1270) — `.fema-feed-hz-empty`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1283](../src/SEPLookupTool.css#L1283) — `.fema-feed-hz-loading`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1349](../src/SEPLookupTool.css#L1349) — `.fema-feed-source`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1386](../src/SEPLookupTool.css#L1386) — `.fema-feed-badge`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1472](../src/SEPLookupTool.css#L1472) — `.fema-feed-state`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1480](../src/SEPLookupTool.css#L1480) — `.fema-feed-time`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1531](../src/SEPLookupTool.css#L1531) — `.fema-feed-sep-window`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1538](../src/SEPLookupTool.css#L1538) — `.fema-feed-id`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1589](../src/SEPLookupTool.css#L1589) — `.fema-feed-source-label`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1595](../src/SEPLookupTool.css#L1595) — `.fema-feed-states`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1627](../src/SEPLookupTool.css#L1627) — `.fema-feed-show-all`: `font-family: var(--font-mono)`.
- [src/SEPLookupTool.css:1642](../src/SEPLookupTool.css#L1642) — `.fema-feed-footer`: `font-family: var(--font-mono)`.
- [src/components/ACAIntelligence.jsx:62](../src/components/ACAIntelligence.jsx#L62) — `fontFamily: "var(--eg-font-mono)",`.
- [src/components/ACAIntelligence.jsx:69](../src/components/ACAIntelligence.jsx#L69) — `const mono = { fontFamily: "var(--eg-font-mono)", fontWeight: 500 };`.
- [src/components/ACAIntelligence.jsx:546](../src/components/ACAIntelligence.jsx#L546) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:152](../src/components/CarrierRef.jsx#L152) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:356](../src/components/CarrierRef.jsx#L356) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:385](../src/components/CarrierRef.jsx#L385) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:749](../src/components/CarrierRef.jsx#L749) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:951](../src/components/CarrierRef.jsx#L951) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:1068](../src/components/CarrierRef.jsx#L1068) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:1137](../src/components/CarrierRef.jsx#L1137) — `fontFamily: "var(--font-mono)", fontSize: "1.4rem",`.
- [src/components/CarrierRef.jsx:1231](../src/components/CarrierRef.jsx#L1231) — `fontFamily: "var(--font-mono)",`.
- [src/components/CarrierRef.jsx:1390](../src/components/CarrierRef.jsx#L1390) — `fontFamily: "var(--font-mono)",`.
- [src/components/CollapsibleWidget.jsx:120](../src/components/CollapsibleWidget.jsx#L120) — `fontFamily: "var(--eg-font-mono)",`.
- [src/components/ComplianceDashboard.jsx:552](../src/components/ComplianceDashboard.jsx#L552) — `<div style={{ fontSize: "0.68em", color: "var(--text-muted)", marginTop: 3, fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>`.
- [src/components/LandingPage.css:188](../src/components/LandingPage.css#L188) — `.landing-flow-strip span`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:288](../src/components/LandingPage.css#L288) — `.landing-panel-topbar`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:343](../src/components/LandingPage.css#L343) — `.landing-terminal-heading`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:370](../src/components/LandingPage.css#L370) — `.landing-terminal-row`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:378](../src/components/LandingPage.css#L378) — `.landing-terminal-row strong,
.landing-compliance-row strong`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:403](../src/components/LandingPage.css#L403) — `.landing-terminal-ai`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:419](../src/components/LandingPage.css#L419) — `.landing-compliance-row span`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:489](../src/components/LandingPage.css#L489) — `.landing-feature-card span`: `font-family: var(--font-mono)`.
- [src/components/LandingPage.css:602](../src/components/LandingPage.css#L602) — `.landing-nav-links,
.landing-nav-links a,
.landing-footer`: `font-family: var(--eg-font-mono)` !important.
- [src/components/LandingPage.css:617](../src/components/LandingPage.css#L617) — `.landing-nav-cta,
.landing-button`: `font-family: var(--eg-font-mono)` !important.
- [src/components/LandingPage.css:654](../src/components/LandingPage.css#L654) — `.landing-flow-strip span`: `font-family: var(--eg-font-mono)`.
- [src/components/LandingPage.css:708](../src/components/LandingPage.css#L708) — `.landing-panel-topbar`: `font-family: var(--eg-font-mono)` !important.
- [src/components/LandingPage.css:740](../src/components/LandingPage.css#L740) — `.landing-terminal-heading`: `font-family: var(--eg-font-mono)` !important.
- [src/components/LandingPage.css:765](../src/components/LandingPage.css#L765) — `.landing-terminal-row strong`: `font-family: var(--eg-font-mono)`.
- [src/components/LandingPage.css:828](../src/components/LandingPage.css#L828) — `.landing-compliance-row > div strong`: `font-family: var(--eg-font-mono)`.
- [src/components/LandingPage.css:869](../src/components/LandingPage.css#L869) — `.landing-feature-card span`: `font-family: var(--eg-font-mono)` !important.
- [src/components/LandingPage.css:966](../src/components/LandingPage.css#L966) — `.landing-nav-login`: `font-family: var(--eg-font-mono)` !important.
- [src/components/MiniLiveTranscript.jsx:46](../src/components/MiniLiveTranscript.jsx#L46) — `fontFamily: "var(--font-mono)",`.
- [src/components/SEPResultsModal.css:153](../src/components/SEPResultsModal.css#L153) — `.sep-modal-county`: `font-family: var(--font-mono)`.
- [src/components/ScriptEditor.css:26](../src/components/ScriptEditor.css#L26) — `.script-editor p,
.script-editor-empty p`: `font-family: var(--eg-font-mono)`.
- [src/components/ScriptEditor.css:68](../src/components/ScriptEditor.css#L68) — `.script-editor-actions button,
.script-editor-card-head button,
.script-editor-tabs button,
.script-editor-add`: `font-family: var(--eg-font-mono)`.
- [src/components/ScriptEditor.css:143](../src/components/ScriptEditor.css#L143) — `.script-editor-message,
.script-editor-diff`: `font-family: var(--eg-font-mono)`.
- [src/components/ScriptEditor.css:181](../src/components/ScriptEditor.css#L181) — `.script-editor-card-head > span`: `font-family: var(--eg-font-mono)`.
- [src/components/ScriptEditor.css:242](../src/components/ScriptEditor.css#L242) — `.script-editor-options`: `font-family: var(--eg-font-mono)`.
- [src/components/ScriptEditor.css:264](../src/components/ScriptEditor.css#L264) — `.script-editor-options input[type="number"]`: `font-family: var(--eg-font-mono)`.
- [src/flows/ancillary/AncillaryFlow.jsx:783](../src/flows/ancillary/AncillaryFlow.jsx#L783) — `fontFamily: "var(--font-mono)",`.
- [src/flows/ancillary/AncillaryFlow.jsx:943](../src/flows/ancillary/AncillaryFlow.jsx#L943) — `fontFamily: "var(--font-mono)",`.
- [src/flows/ancillary/AncillaryFlow.jsx:961](../src/flows/ancillary/AncillaryFlow.jsx#L961) — `fontFamily: "var(--font-mono)",`.
- [src/flows/ancillary/AncillaryFlow.jsx:988](../src/flows/ancillary/AncillaryFlow.jsx#L988) — `fontFamily: "var(--font-mono)",`.
- [src/flows/ancillary/AncillaryFlow.jsx:1097](../src/flows/ancillary/AncillaryFlow.jsx#L1097) — `fontFamily: "var(--font-mono)",`.
- [src/flows/ancillary/AncillaryFlow.jsx:1147](../src/flows/ancillary/AncillaryFlow.jsx#L1147) — `fontFamily: "var(--font-mono)",`.
- [src/flows/ancillary/AncillaryFlow.jsx:1439](../src/flows/ancillary/AncillaryFlow.jsx#L1439) — `fontFamily: "var(--font-mono)",`.
- [src/styles.css:36](../src/styles.css#L36) — `.sf-panel-heading`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:116](../src/styles.css#L116) — `.sf-meta-row span`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:127](../src/styles.css#L127) — `.sf-action-button,
.sf-secondary-button,
.sf-icon-button`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:189](../src/styles.css#L189) — `.sf-form-grid label,
.sf-decline-box label`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:249](../src/styles.css#L249) — `.sf-script-label`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:341](../src/styles.css#L341) — `.sf-rate-row--head`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:366](../src/styles.css#L366) — `.sf-rate-row small`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:379](../src/styles.css#L379) — `.sf-big-number`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:418](../src/styles.css#L418) — `.sf-checkbox-row small`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:529](../src/styles.css#L529) — `html[data-platform="windows"]`: `--font-mono: var(--eg-font-mono)`.
- [src/styles.css:1003](../src/styles.css#L1003) — `.ancillary-popup-card`: `font-family: var(--font-mono)`.
- [src/styles.css:1063](../src/styles.css#L1063) — `.ancillary-popup-title`: `font-family: var(--font-mono)`.
- [src/styles.css:1102](../src/styles.css#L1102) — `.ancillary-popup-quote,
.ancillary-popup-extra-quote`: `font-family: var(--font-mono)`.
- [src/styles.css:1198](../src/styles.css#L1198) — `.ancillary-popup-link-num,
.ancillary-popup-recap-index`: `font-family: var(--font-mono)`.
- [src/styles.css:1281](../src/styles.css#L1281) — `.ancillary-popup-pill-label`: `font-family: var(--font-mono)`.
- [src/styles.css:1326](../src/styles.css#L1326) — `.ancillary-popup-accordion-title`: `font-family: var(--font-mono)`.
- [src/styles.css:1450](../src/styles.css#L1450) — `.copilot-feed-mini`: `font-family: var(--font-mono)`.
- [src/styles.css:1495](../src/styles.css#L1495) — `.copilot-msg`: `font-family: var(--font-mono)`.
- [src/styles.css:1713](../src/styles.css#L1713) — `.right-rail-toggle-score`: `font-family: var(--font-mono)`.
- [src/styles.css:1847](../src/styles.css#L1847) — `.right-rail-full,
.right-rail-overlay,
.right-rail-toggle,
.top-panel-overlay--tools`: `font-family: var(--font-mono)`.
- [src/styles.css:1861](../src/styles.css#L1861) — `.right-rail-full > .right-rail-scroll,
.right-rail-overlay`: `font-family: var(--font-mono)`.
- [src/styles.css:1896](../src/styles.css#L1896) — `.right-rail-widget-shell,
.right-rail-control-panel,
.agent-availability-panel`: `font-family: var(--font-mono)` !important.
- [src/styles.css:1913](../src/styles.css#L1913) — `.right-rail-widget-title-row,
.right-rail-widget-header-actions`: `font-family: var(--font-mono)` !important.
- [src/styles.css:1920](../src/styles.css#L1920) — `.right-rail-widget-title,
.right-rail-widget-icon,
.right-rail-widget-chevron`: `font-family: var(--font-mono)` !important.
- [src/styles.css:1953](../src/styles.css#L1953) — `.right-rail-control-panel .copilot-pill-button`: `font-family: var(--font-mono)` !important.
- [src/styles.css:1998](../src/styles.css#L1998) — `.copilot-call-duration__label`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2009](../src/styles.css#L2009) — `.copilot-call-timer`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2030](../src/styles.css#L2030) — `.ask-copilot-mini`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2037](../src/styles.css#L2037) — `.ask-copilot-mini__answer`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2049](../src/styles.css#L2049) — `.ask-copilot-mini__input`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2084](../src/styles.css#L2084) — `.mini-live-transcript,
.copilot-feed-mini,
.compliance-mini`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2099](../src/styles.css#L2099) — `.mini-live-transcript__text`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2106](../src/styles.css#L2106) — `.mini-live-transcript__speaker`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2116](../src/styles.css#L2116) — `.transcript-timer`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2127](../src/styles.css#L2127) — `.copilot-feed-mini__entry,
.copilot-msg`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2176](../src/styles.css#L2176) — `.copilot-floating-alert`: `font-family: var(--font-mono)`.
- [src/styles.css:2272](../src/styles.css#L2272) — `.agent-availability-status,
.agent-availability-since,
.agent-availability-btn`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2333](../src/styles.css#L2333) — `.compliance-mini__section-label`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2342](../src/styles.css#L2342) — `.compliance-mini .section-timer--inline`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2349](../src/styles.css#L2349) — `.compliance-mini__score-value,
.compliance-mini__category-score`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2384](../src/styles.css#L2384) — `.compliance-mini__category-name`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2392](../src/styles.css#L2392) — `.compliance-mini__strict,
.compliance-mini__strict svg`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2399](../src/styles.css#L2399) — `.compliance-mini__violation-banner`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2413](../src/styles.css#L2413) — `.right-rail-toggle-score`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2420](../src/styles.css#L2420) — `.right-rail-toggle-section`: `font-family: var(--font-mono)` !important.
- [src/styles.css:2730](../src/styles.css#L2730) — `.lock`: `font-family: var(--font-mono)`.
- [src/styles.css:2738](../src/styles.css#L2738) — `.ok`: `font-family: var(--font-mono)`.
- [src/styles.css:2804](../src/styles.css#L2804) — `.post-call-section-heading small`: `font-family: var(--font-mono)`.
- [src/styles.css:2870](../src/styles.css#L2870) — `.post-call-save-row .post-call-save-button`: `font-family: var(--font-mono)`.
- [src/styles.css:2917](../src/styles.css#L2917) — `.post-call-save-status`: `font-family: var(--font-mono)`.
- [src/styles.css:2934](../src/styles.css#L2934) — `.post-call-webhook-status`: `font-family: var(--font-mono)`.
- [src/styles.css:2982](../src/styles.css#L2982) — `.operations-tab`: `font-family: var(--font-mono)`.
- [src/styles.css:4626](../src/styles.css#L4626) — `.digital`: `font-family: var(--font-mono)`.
- [src/styles.css:5130](../src/styles.css#L5130) — `.agent-reminder-label`: `font-family: var(--font-mono)`.
- [src/styles.css:5147](../src/styles.css#L5147) — `.part-b-toggle .part-b-premium-trigger`: `font-family: var(--font-mono)`.
- [src/styles.css:5304](../src/styles.css#L5304) — `.flow-shell,
.flow-main,
.flow,
.card,
.active-card,
.script-box,
.flow-script-card`: `font-family: var(--font-mono)`.
- [src/styles.css:5438](../src/styles.css#L5438) — `.client-quick-script-panel__header span`: `font-family: var(--font-mono)`.
- [src/styles.css:5449](../src/styles.css#L5449) — `.client-quick-script-panel__header h2`: `font-family: var(--font-mono)`.
- [src/styles.css:5497](../src/styles.css#L5497) — `.client-quick-script-section__label`: `font-family: var(--font-mono)`.
- [src/styles.css:5541](../src/styles.css#L5541) — `.client-quick-script-branches__prompt`: `font-family: var(--font-mono)`.
- [src/styles.css:5564](../src/styles.css#L5564) — `.client-quick-script-branch-button`: `font-family: var(--font-mono)`.
- [src/styles.css:5647](../src/styles.css#L5647) — `.flow-script-card.active-card > div:first-child,
.card.active-card > h2`: `font-family: var(--font-mono)` !important.
- [src/styles.css:5660](../src/styles.css#L5660) — `.flow-script-card.active-card > div:first-child *,
.card.active-card > h2 *`: `font-family: var(--font-mono)` !important.
- [src/styles.css:5674](../src/styles.css#L5674) — `.script-box`: `font-family: var(--font-mono)` !important.
- [src/styles.css:5692](../src/styles.css#L5692) — `.script-box-header .verbatim-label,
.verbatim-label`: `font-family: var(--font-mono)` !important.
- [src/styles.css:5795](../src/styles.css#L5795) — `.ancillary-fe-countdown`: `font-family: var(--font-mono)`.
- [src/styles.css:5873](../src/styles.css#L5873) — `.ma-first-card-countdown`: `font-family: var(--font-mono)`.
- [src/styles.css:5980](../src/styles.css#L5980) — `.flow-stage-text`: `font-family: var(--font-mono)` !important.
- [src/styles.css:5991](../src/styles.css#L5991) — `.u65-voicemail-section`: `font-family: var(--font-mono)`.
- [src/styles.css:6009](../src/styles.css#L6009) — `.u65-voicemail-toggle`: `font-family: var(--font-mono)`.
- [src/styles.css:6051](../src/styles.css#L6051) — `.u65-nepq-flow`: `font-family: var(--font-mono)`.
- [src/styles.css:6095](../src/styles.css#L6095) — `.flow-script-card.active-card > div:first-child .u65-nepq-objection-trigger`: `font-family: var(--font-mono)` !important.
- [src/styles.css:6142](../src/styles.css#L6142) — `.u65-nepq-group__toggle`: `font-family: var(--font-mono)`.
- [src/styles.css:6222](../src/styles.css#L6222) — `.u65-nepq-agent-cue`: `font-family: var(--font-mono)`.
- [src/styles.css:6292](../src/styles.css#L6292) — `.u65-nepq-choice`: `font-family: var(--font-mono)`.
- [src/styles.css:6348](../src/styles.css#L6348) — `.u65-nepq-callout__toggle`: `font-family: var(--font-mono)`.
- [src/styles.css:6422](../src/styles.css#L6422) — `.u65-nepq-branch__header`: `font-family: var(--font-mono)`.
- [src/styles.css:6492](../src/styles.css#L6492) — `.u65-nepq-switch`: `font-family: var(--font-mono)`.
- [src/styles.css:6578](../src/styles.css#L6578) — `.u65-nepq-nav__button`: `font-family: var(--font-mono)`.
- [src/styles.css:6657](../src/styles.css#L6657) — `.u65-nepq-objection-modal__header h2`: `font-family: var(--font-mono)`.
- [src/styles.css:6729](../src/styles.css#L6729) — `.u65-nepq-complete h2`: `font-family: var(--font-mono)`.
- [src/styles.css:6756](../src/styles.css#L6756) — `.u65-nepq-complete__actions button`: `font-family: var(--font-mono)`.
- [src/styles.css:6795](../src/styles.css#L6795) — `.flow-compliance-banner`: `font-family: var(--font-mono)` !important.
- [src/styles.css:6867](../src/styles.css#L6867) — `.section-next-action .no-enrollment-wrapup-btn`: `font-family: var(--font-mono)` !important.
- [src/styles.css:6902](../src/styles.css#L6902) — `.enrollment-check::before`: `font-family: var(--font-mono)` !important.
- [src/styles.css:6942](../src/styles.css#L6942) — `.script-start-call-button`: `font-family: var(--font-mono)` !important.
- [src/styles.css:6987](../src/styles.css#L6987) — `.script-start-call-hint`: `font-family: var(--font-mono)` !important.
- [src/styles.css:7541](../src/styles.css#L7541) — `.script-preview`: `font-family: var(--font-mono)`.
- [src/styles.css:7608](../src/styles.css#L7608) — `.transcript-upload-progress-row`: `font-family: var(--font-mono)`.
- [src/styles.css:8232](../src/styles.css#L8232) — `.section-counter`: `font-family: var(--font-mono)`.
- [src/styles.css:8668](../src/styles.css#L8668) — `.section-timer`: `font-family: var(--font-mono)`.
- [src/styles.css:8914](../src/styles.css#L8914) — `.dv-translation-btn`: `font-family: var(--font-mono)`.
- [src/styles.css:8967](../src/styles.css#L8967) — `.dv-dropdown-abbr`: `font-family: var(--font-mono)`.
- [src/styles.css:9057](../src/styles.css#L9057) — `.dv-ref`: `font-family: var(--font-mono)`.
- [src/styles.css:9172](../src/styles.css#L9172) — `.dv-original-tag`: `font-family: var(--font-mono)`.
- [src/styles.css:9554](../src/styles.css#L9554) — `.dv-context-num`: `font-family: var(--font-mono)`.
- [src/styles.css:9602](../src/styles.css#L9602) — `.dv-favorites-count`: `font-family: var(--font-mono)`.
- [src/styles.css:9651](../src/styles.css#L9651) — `.dv-favorites-ref`: `font-family: var(--font-mono)`.
- [src/styles.css:9720](../src/styles.css#L9720) — `.dv-crossrefs-item`: `font-family: var(--font-mono)`.
- [src/styles.css:10394](../src/styles.css#L10394) — `.sticky-timer-display`: `font-family: var(--font-mono)`.
- [src/styles.css:11294](../src/styles.css#L11294) — `.subscription-paywall-card p`: `font-family: var(--font-mono)`.
- [src/styles.css:11330](../src/styles.css#L11330) — `.billing-eyebrow,
.billing-section-title`: `font-family: var(--font-mono)`.
- [src/styles.css:11414](../src/styles.css#L11414) — `.billing-status-card span,
.billing-usage-card span`: `font-family: var(--font-mono)`.
- [src/styles.css:11426](../src/styles.css#L11426) — `.billing-status-card strong,
.billing-usage-card strong`: `font-family: var(--font-mono)`.
- [src/styles.css:11454](../src/styles.css#L11454) — `.billing-alert`: `font-family: var(--font-mono)`.
- [src/styles.css:11523](../src/styles.css#L11523) — `.billing-plan-card p`: `font-family: var(--font-mono)`.
- [src/styles.css:11593](../src/styles.css#L11593) — `.tenant-settings-header p,
.tenant-settings-muted,
.onboarding-step p`: `font-family: var(--font-mono)`.
- [src/styles.css:11649](../src/styles.css#L11649) — `.tenant-settings-field`: `font-family: var(--font-mono)`.
- [src/styles.css:11666](../src/styles.css#L11666) — `.tenant-settings-field input,
.tenant-settings-inline input,
.tenant-settings-add-row input`: `font-family: var(--font-mono)`.
- [src/styles.css:11695](../src/styles.css#L11695) — `.tenant-settings-state`: `font-family: var(--font-mono)`.
- [src/styles.css:11729](../src/styles.css#L11729) — `.tenant-agent-row`: `font-family: var(--font-mono)`.
- [src/styles.css:11853](../src/styles.css#L11853) — `.onboarding-progress span`: `font-family: var(--font-mono)`.
- [src/styles.css:11886](../src/styles.css#L11886) — `.onboarding-skip`: `font-family: var(--font-mono)`.
- [src/styles.css:12336](../src/styles.css#L12336) — `.aca-client-sidebar__summary strong`: `font-family: var(--font-mono)`.
- [src/styles.css:12345](../src/styles.css#L12345) — `.aca-client-sidebar__summary span`: `font-family: var(--font-mono)`.
- [src/styles.css:12364](../src/styles.css#L12364) — `.aca-client-sidebar__field span`: `font-family: var(--font-mono)`.
- [src/styles.css:12388](../src/styles.css#L12388) — `.aca-ffm-sep-finder`: `font-family: var(--font-mono)`.
- [src/styles.css:12412](../src/styles.css#L12412) — `.aca-ffm-sep-finder__header h2`: `font-family: var(--font-mono)`.
- [src/styles.css:12478](../src/styles.css#L12478) — `.aca-ffm-sep-category__index`: `font-family: var(--font-mono)`.
- [src/styles.css:12493](../src/styles.css#L12493) — `.aca-ffm-sep-category__trigger-copy strong`: `font-family: var(--font-mono)`.
- [src/styles.css:12503](../src/styles.css#L12503) — `.aca-ffm-sep-category__trigger-copy > span`: `font-family: var(--font-mono)`.
- [src/styles.css:12577](../src/styles.css#L12577) — `.aca-ffm-sep-category__questions li::before`: `font-family: var(--font-mono)`.
- [src/styles.css:12625](../src/styles.css#L12625) — `.aca-ffm-sep-category__proceed`: `font-family: var(--font-mono)`.
- [src/styles.css:12682](../src/styles.css#L12682) — `.ancillary-client-sidebar__summary strong`: `font-family: var(--font-mono)`.
- [src/styles.css:12691](../src/styles.css#L12691) — `.ancillary-client-sidebar__summary span`: `font-family: var(--font-mono)`.
- [src/styles.css:12710](../src/styles.css#L12710) — `.ancillary-client-sidebar__field span`: `font-family: var(--font-mono)`.
- [src/styles.css:13997](../src/styles.css#L13997) — `.agent-notes-widget`: `font-family: var(--font-mono)`.
- [src/styles.css:14031](../src/styles.css#L14031) — `.agent-notes-widget-title`: `font-family: var(--font-mono)`.
- [src/styles.css:14054](../src/styles.css#L14054) — `.agent-notes-widget-input`: `font-family: var(--font-mono)`.
- [src/styles.css:15334](../src/styles.css#L15334) — `.sep-qualifier-category-badge`: `font-family: var(--font-mono)`.
- [src/styles.css:15377](../src/styles.css#L15377) — `.sep-qualifier-subtype-meta`: `font-family: var(--font-mono)`.
- [src/styles.css:16285](../src/styles.css#L16285) — `.left-rail-panel-shell--sep-qualifier .sep-qualifier,
.left-rail-panel-shell--sep-qualifier .left-rail-tools,
.left-rail-panel-shell--sep-qualifier .left-rail-tool-panel,
.left-rail-panel-shell--sep-qualifier .sep-finder-trigger,
.left-rail-panel-shell--sep-qualifier .snp-routing-panel`: `font-family: var(--font-mono)`.
- [src/styles.css:16320](../src/styles.css#L16320) — `.left-rail-panel-shell--sep-qualifier .sep-qualifier-kicker,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-script-label,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-warning-title,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-detail-label,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-result-status,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-question-label,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-shortcut-label,
.left-rail-panel-shell--sep-qualifier .sep-qualifier-shortcut-index,
.left-rail-panel-shell--sep-qualifier .sep-finder-panel-kicker,
.left-rail-panel-shell--sep-qualifier .snp-routing-cell-label,
.left-rail-panel-shell--sep-qualifier .snp-routing-progress-label,
.left-rail-panel-shell--sep-qualifier .snp-routing-recommendation-kicker,
.left-rail-panel-shell--sep-qualifier .snp-routing-reference-label,
.left-rail-panel-shell--sep-qualifier .sep-state-card-field-title,
.left-rail-panel-shell--sep-qualifier .sep-state-section-title,
.left-rail-panel-shell--sep-qualifier .sep-state-program-title,
.left-rail-panel-shell--sep-qualifier .sep-state-phone-label`: `font-family: var(--font-mono)`.
- [src/styles.css:16406](../src/styles.css#L16406) — `.left-rail-panel-shell--sep-qualifier :is(
  .sep-qualifier-copy,
  .sep-qualifier-note,
  .sep-qualifier-warning-card p,
  .sep-qualifier-script-card p,
  .sep-qualifier-stop-card,
  .sep-qualifier-selected-category,
  .sep-qualifier-detail-value,
  .sep-qualifier-shortcut-intro,
  .sep-qualifier-shortcut-instruction,
  .sep-qualifier-shortcut-text,
  .sep-qualifier-shortcut-note,
  .sep-finder-trigger-empty,
  .sep-finder-trigger-status,
  .sep-finder-trigger-error,
  .sep-finder-panel-empty,
  .sep-finder-panel-status,
  .sep-finder-panel-error,
  .sep-finder-panel-counties,
  .sep-finder-card-cfr,
  .sep-finder-card-period,
  .sep-finder-card-evidence,
  .sep-finder-card-detail-static,
  .sep-finder-card-detail-title,
  .sep-finder-card-detail-meta,
  .sep-finder-panel-disclaimer,
  .snp-routing-muted-line,
  .snp-routing-reference-item span:last-child,
  .snp-routing-recommendation-copy,
  .snp-routing-recommendation-plan,
  .snp-routing-recommendation-fallbacks,
  .snp-routing-list,
  .sep-state-card-subtitle,
  .sep-state-card-list,
  .sep-state-card-checklist,
  .sep-state-play-copy p,
  .sep-state-phone-note
)`: `font-family: var(--font-mono)`.
- [src/styles.css:16423](../src/styles.css#L16423) — `.left-rail-panel-shell--sep-qualifier :is(
  .sep-qualifier-heading,
  .sep-qualifier-result-name,
  .sep-qualifier-category-label,
  .sep-qualifier-subtype-title,
  .sep-finder-panel-zip,
  .sep-finder-card-name,
  .sep-state-card-title,
  .sep-state-phone-value
)`: `font-family: var(--font-mono)`.
- [src/styles.css:16450](../src/styles.css#L16450) — `.left-rail-panel-shell--sep-qualifier :is(
  .left-rail-zip-input,
  .sep-qualifier-input,
  .snp-routing-cell-input
)`: `font-family: var(--font-mono)`.
- [src/styles.css:16498](../src/styles.css#L16498) — `.left-rail-panel-shell--sep-qualifier .left-rail-tool-btn`: `font-family: var(--font-mono)`.
- [src/styles.css:16554](../src/styles.css#L16554) — `.left-rail-panel-shell--sep-qualifier :is(
  .sep-qualifier-action,
  .sep-qualifier-secondary,
  .sep-qualifier-back,
  .sep-qualifier-primary,
  .sep-qualifier-toggle,
  .left-rail-tool-start-btn,
  .left-rail-tool-minimize,
  .sep-finder-trigger-btn,
  .sep-finder-trigger-refresh,
  .sep-finder-refresh,
  .sep-finder-card-detail-trigger,
  .snp-routing-subsection-trigger
)`: `font-family: var(--font-mono)`.
- [src/styles.css:16691](../src/styles.css#L16691) — `.left-rail-panel-shell--sep-qualifier .sep-qualifier-category-badge,
.left-rail-panel-shell--sep-qualifier .sep-finder-card-pill,
.left-rail-panel-shell--sep-qualifier .snp-routing-recommendation-badge,
.left-rail-panel-shell--sep-qualifier .sep-state-card-code,
.left-rail-panel-shell--sep-qualifier .sep-state-card-badge,
.left-rail-panel-shell--sep-qualifier .sep-state-section-type`: `font-family: var(--font-mono)`.
- [src/styles.css:16709](../src/styles.css#L16709) — `.left-rail-panel-shell--sep-qualifier .sep-qualifier-subtype-meta`: `font-family: var(--font-mono)`.
- [src/styles.css:16719](../src/styles.css#L16719) — `.left-rail-panel-shell--sep-qualifier .sep-finder-trigger-zip`: `font-family: var(--font-mono)`.
- [src/styles.css:16779](../src/styles.css#L16779) — `.rts-tab`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:16805](../src/styles.css#L16805) — `.rts-header h2`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:16825](../src/styles.css#L16825) — `.rts-controls select,
.rts-search`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:16912](../src/styles.css#L16912) — `.rts-agent-switcher label`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:16924](../src/styles.css#L16924) — `.rts-agent-switcher select`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:16935](../src/styles.css#L16935) — `.rts-agent-switcher button`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17067](../src/styles.css#L17067) — `.rts-channel-row button`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17108](../src/styles.css#L17108) — `.rts-cell-value`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17159](../src/styles.css#L17159) — `.rts-inline-input,
.rts-inline-select`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17189](../src/styles.css#L17189) — `.rts-upload-trigger,
.rts-primary-button,
.rts-secondary-button,
.rts-ingest-close`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17254](../src/styles.css#L17254) — `.rts-ingest-header h3`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17308](../src/styles.css#L17308) — `.rts-ingest-upload h4,
.rts-ingest-loading h4,
.rts-ingest-complete h4,
.rts-review-section h4`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17494](../src/styles.css#L17494) — `.rts-review-row select,
.rts-review-table select,
.rts-suggested-carrier-input`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17758](../src/styles.css#L17758) — `.agent-dashboard`: `font-family: var(--eg-font-mono)`.
- [src/styles.css:17766](../src/styles.css#L17766) — `.agent-dash-scope select`: `font: 11px var(--eg-font-mono)`.
- [src/styles.css:17794](../src/styles.css#L17794) — `.agent-dash-chart text`: `font-family: var(--eg-font-mono)`.
- [src/styles/design-tokens.css:182](../src/styles/design-tokens.css#L182) — `:root`: `--eg-font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace`.
- [src/styles/design-tokens.css:237](../src/styles/design-tokens.css#L237) — `:root`: `--font-mono: var(--eg-font-mono)`.
- [src/styles/phone-dropdown.css:39](../src/styles/phone-dropdown.css#L39) — `.phone-toast,
.phone-active-bar,
.phone-dd__panel`: `font-family: var(--eg-font-mono)`.
- [src/styles/public-shell.css:58](../src/styles/public-shell.css#L58) — `.subscription-paywall-card p`: `font-family: var(--eg-font-mono)`.
- [src/styles/public-shell.css:64](../src/styles/public-shell.css#L64) — `.billing-eyebrow`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:155](../src/styles/v3-overrides.css#L155) — `.top-bar-wallpaper-toggle,
.top-bar-profile,
.top-bar-settings-button`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:178](../src/styles/v3-overrides.css#L178) — `.top-bar-profile-name,
.top-bar-profile-signout`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:257](../src/styles/v3-overrides.css#L257) — `.flow-pill .flow-label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:292](../src/styles/v3-overrides.css#L292) — `.flow-select-trigger,
.flow-select-option`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:315](../src/styles/v3-overrides.css#L315) — `.flow-selector-dropdown .flow-label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:420](../src/styles/v3-overrides.css#L420) — `.right-rail-toggle,
.right-rail-toggle--restore`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:427](../src/styles/v3-overrides.css#L427) — `.right-rail-toggle-score`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:435](../src/styles/v3-overrides.css#L435) — `.right-rail-toggle-section`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:453](../src/styles/v3-overrides.css#L453) — `.right-rail-widget-header`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:544](../src/styles/v3-overrides.css#L544) — `.copilot-pill-button`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:596](../src/styles/v3-overrides.css#L596) — `.mini-live-transcript .speaker-agent,
.transcript-speaker--agent`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:605](../src/styles/v3-overrides.css#L605) — `.mini-live-transcript .speaker-client,
.transcript-speaker--client`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:613](../src/styles/v3-overrides.css#L613) — `.transcript-timestamp`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:700](../src/styles/v3-overrides.css#L700) — `.compliance-mini__score,
.compliance-overall-score`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:755](../src/styles/v3-overrides.css#L755) — `.compliance-section-row__score`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:765](../src/styles/v3-overrides.css#L765) — `.compliance-mini__score-value`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:784](../src/styles/v3-overrides.css#L784) — `.compliance-mini__count`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:805](../src/styles/v3-overrides.css#L805) — `.compliance-mini__violation-count`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:849](../src/styles/v3-overrides.css#L849) — `.left-rail-handle`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:883](../src/styles/v3-overrides.css#L883) — `.left-rail-zip-label`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:892](../src/styles/v3-overrides.css#L892) — `.left-rail-zip-input`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:916](../src/styles/v3-overrides.css#L916) — `.left-rail-tool-btn`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:959](../src/styles/v3-overrides.css#L959) — `.left-rail-tool-start-btn`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1048](../src/styles/v3-overrides.css#L1048) — `.section-counter,
.section-step-label`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1083](../src/styles/v3-overrides.css#L1083) — `.compliance-note__label,
.compliance-note-label`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1155](../src/styles/v3-overrides.css#L1155) — `.enrollment-cta__label,
.section-enrollment__label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:1170](../src/styles/v3-overrides.css#L1170) — `.enrollment-cta__submit`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1200](../src/styles/v3-overrides.css#L1200) — `.copilot-call-timer`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1273](../src/styles/v3-overrides.css#L1273) — `.call-timer,
.copilot-timer`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1319](../src/styles/v3-overrides.css#L1319) — `.btn,
.btn-primary,
.btn-secondary,
.btn-success,
.btn-danger,
.button`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1435](../src/styles/v3-overrides.css#L1435) — `.subscription-banner`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1445](../src/styles/v3-overrides.css#L1445) — `.billing-eyebrow`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1486](../src/styles/v3-overrides.css#L1486) — `.benefit-pill,
.eg-benefit-pill`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:1508](../src/styles/v3-overrides.css#L1508) — `.checklist-header,
.checklist__header`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:1639](../src/styles/v3-overrides.css#L1639) — `.section-complete-btn,
button.primary.section-complete-btn`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1677](../src/styles/v3-overrides.css#L1677) — `.section-timer,
.section-timer-wrap .section-timer`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1710](../src/styles/v3-overrides.css#L1710) — `.sticky-timer-display`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:1726](../src/styles/v3-overrides.css#L1726) — `.sticky-timer-section`: `font-family: var(--eg-font-mono)` !important.
- [src/styles/v3-overrides.css:2322](../src/styles/v3-overrides.css#L2322) — `.eg-audio-meter-label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2369](../src/styles/v3-overrides.css#L2369) — `.eg-timer-bar__live-label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2377](../src/styles/v3-overrides.css#L2377) — `.eg-timer-bar__time`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2392](../src/styles/v3-overrides.css#L2392) — `.eg-timer-bar__primary`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2416](../src/styles/v3-overrides.css#L2416) — `.eg-timer-bar__secondary`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2448](../src/styles/v3-overrides.css#L2448) — `.eg-rail-card__label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2465](../src/styles/v3-overrides.css#L2465) — `.eg-rail-card__sub`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2479](../src/styles/v3-overrides.css#L2479) — `.eg-rail-card__field-key`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2487](../src/styles/v3-overrides.css#L2487) — `.eg-rail-card__field-value`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2533](../src/styles/v3-overrides.css#L2533) — `.eg-plan-lookup__label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2553](../src/styles/v3-overrides.css#L2553) — `.eg-plan-lookup__mode-btn,
.eg-plan-lookup__clear,
.eg-plan-lookup__submit`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2682](../src/styles/v3-overrides.css#L2682) — `.eg-plan-lookup__result-meta`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2721](../src/styles/v3-overrides.css#L2721) — `.eg-mono`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2726](../src/styles/v3-overrides.css#L2726) — `.eg-panel-header`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2734](../src/styles/v3-overrides.css#L2734) — `.eg-card-label`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:2743](../src/styles/v3-overrides.css#L2743) — `.eg-card-value`: `font-family: var(--eg-font-mono)`.
- [src/styles/v3-overrides.css:3188](../src/styles/v3-overrides.css#L3188) — `.contacts-tab`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:3198](../src/styles/v3-overrides.css#L3198) — `.contacts-tab .mono`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:3999](../src/styles/v3-overrides.css#L3999) — `.dtmf-keypad-key`: `font-family: var(--font-mono)`.
- [src/styles/v3-overrides.css:4041](../src/styles/v3-overrides.css#L4041) — `.eg-rail-card__save-contact`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4494](../src/styles/v3-overrides.css#L4494) — `.contacts-save-state`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4578](../src/styles/v3-overrides.css#L4578) — `.top-bar-exit-call`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4603](../src/styles/v3-overrides.css#L4603) — `.return-to-call-strip`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4645](../src/styles/v3-overrides.css#L4645) — `.availability-strip`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4717](../src/styles/v3-overrides.css#L4717) — `.availability-menu__option`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4810](../src/styles/v3-overrides.css#L4810) — `.contacts-import`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4898](../src/styles/v3-overrides.css#L4898) — `.contacts-detail-tabs button`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:4916](../src/styles/v3-overrides.css#L4916) — `.msg-thread`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:5093](../src/styles/v3-overrides.css#L5093) — `.call-log-tab`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:5103](../src/styles/v3-overrides.css#L5103) — `.call-log-tab .mono`: `font-family: var(--font-mono, ui-monospace, monospace)`.
- [src/styles/v3-overrides.css:5287](../src/styles/v3-overrides.css#L5287) — `.sms-toast`: `font-family: var(--font-mono, ui-monospace, monospace)`.

## Validation

- Parsed all 10 frontend stylesheets and compared every non-family declaration with the original: unchanged. This verifies existing Bloomberg-style dark-theme color and spacing tokens, borders, widths, heights, layout, font weights and line heights were untouched. Only family declarations, typography aliases, and obsolete Formula1 registration changed.
- Verified all 335 explicit monospace source lines were unchanged.
- Searched all frontend source: no explicit non-monospace family remains other than var(--font-primary) or inherit; the requested literal stack is defined once.
- Production build passed: `VITE_BIBLIA_API_KEY='' npm run build` (2,750 modules). The unmodified command first stopped at the existing public-secret guard for VITE_BIBLIA_API_KEY; the retry only emptied that variable for this process and did not edit environment files.
- `git diff --check` passed.
- No browser-based dual-face measurement was performed; layout findings are potential risks from the source constraints, not measured regressions.
