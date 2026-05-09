# EnrollGen Design System

Version: 3.0 — Sedimentary Command
Last updated: May 2026

This document is the single source of truth for all EnrollGen UI styling. Every new component, every refactor, every fix must follow this spec. No exceptions.

---

## 1. Philosophy

EnrollGen is a compliance-first enrollment operations platform. It needs to feel warm, grounded, and professional — not sterile, not flashy, not like dev tooling. The aesthetic is "sedimentary command center": layered earth tones, geological texture, analog warmth with digital precision.

The audience is twofold: NGHS agents using it daily on live calls, and upline partners (Medigap Life, Alliant/SMS) seeing it in demos. It must feel like a product, not a project.

---

## 2. Color Palette

All colors are CSS custom properties. Define these in a single `design-tokens.css` or at the top of `index.css`. Every component references these variables, never raw hex values.

### Core surfaces (darkest to lightest)

```css
--eg-base: #171411;          /* app background */
--eg-surface-1: #1e1a16;     /* top bar, bottom bar, rail backgrounds */
--eg-surface-2: #262119;     /* cards, inputs, text areas */
--eg-surface-3: #2e2820;     /* active tab bg, hover states */
--eg-surface-4: #382f25;     /* elevated hover, pressed states */
```

### Borders

```css
--eg-border: #3d352b;        /* default borders */
--eg-border-hover: #564a3c;  /* hover state borders */
--eg-border-active: #7a6a56; /* focus/active borders, input focus */
```

### Text

```css
--eg-text: #e4dace;          /* primary text, headings, script content */
--eg-text-mid: #b5a898;      /* secondary text, transcript body, descriptions */
--eg-text-dim: #7d7060;      /* tertiary text, labels, inactive tabs */
--eg-text-faint: #524838;    /* hints, disabled text, mono micro-labels */
```

### Accent (brand)

```css
--eg-accent: #c08b55;        /* primary accent, wordmark, active tab indicator, agent speaker label */
--eg-accent-bright: #daa76d; /* accent hover, benefit pills text */
--eg-accent-dim: #8a6338;    /* accent pressed, accent borders */
```

### Semantic colors

Each semantic color has three stops: full, dim (background), and text (foreground on dim bg).

```css
/* Green — success, done, available, compliance pass */
--eg-green: #6aab7d;
--eg-green-dim: #2d4a35;
--eg-green-text: #a0d4ac;

/* Red — danger, end call, critical compliance, offline states */
--eg-red: #b85c5c;
--eg-red-dim: #4a2828;
--eg-red-text: #e09898;

/* Blue — info, client speaker, ACA flow */
--eg-blue: #5c88b8;
--eg-blue-dim: #283a4a;
--eg-blue-text: #98bce0;

/* Amber — warning, active/in-progress, reminders, compliance notes */
--eg-amber: #c49940;
--eg-amber-dim: #4a3818;
--eg-amber-text: #e0c080;

/* Purple — U65 flow */
--eg-purple: #8b6eb8;
--eg-purple-dim: #352a4a;
--eg-purple-text: #bca8e0;
```

### Flow colors

Each script flow has an assigned color. These never change.

| Flow | Color variable | Beacon/dot | Glow |
|------|---------------|------------|------|
| MA (Medicare Advantage) | `--eg-red` | `#b85c5c` | `#e09898` |
| MS (Med Supp) | `--eg-green` | `#6aab7d` | `#a0d4ac` |
| ACA (On-Exchange) | `--eg-blue` | `#5c88b8` | `#98bce0` |
| U65 (Off-Exchange) | `--eg-purple` | `#8b6eb8` | `#bca8e0` |

---

## 3. Typography

Three font families. No substitutions. Load from Google Fonts.

```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=DM+Serif+Display&family=JetBrains+Mono:wght@400;500&display=swap');

--eg-font-display: 'DM Serif Display', serif;
--eg-font-body: 'DM Sans', sans-serif;
--eg-font-mono: 'JetBrains Mono', monospace;
```

### Usage rules

| Context | Font | Weight | Size | Color |
|---------|------|--------|------|-------|
| Wordmark "Enroll" | Display | 400 | 19px | `--eg-accent` |
| Wordmark "GEN" | Mono | 500 | 12px | `--eg-text-mid` |
| Section titles (Recording disclosure, etc.) | Display | 400 | 17px | `--eg-text` |
| Tab labels | Body | 400/500 active | 11.5px | `--eg-text-dim` / `--eg-accent` active |
| Script prompt body | Body | 400 | 13.5px | `--eg-text` |
| Descriptions, transcript body | Body | 400 | 11.5px | `--eg-text-mid` |
| Compliance note body | Body | 400 | 11.5px | `--eg-amber-text` |
| Co-Pilot feed messages | Body | 400 | 11px | `--eg-green-text` or `--eg-amber-text` |
| Client name | Body | 500 | 13px | `--eg-text` |
| Panel headers (LIVE TRANSCRIPT, CO-PILOT, etc.) | Mono | 400 | 9px | `--eg-text-dim` |
| Micro labels (SECTION 3 OF 8, timestamps) | Mono | 400 | 8-9px | `--eg-text-faint` |
| Card field labels (MBI, COUNTY, etc.) | Mono | 400 | 8px | `--eg-text-faint` |
| Card field values | Mono | 400 | 10px | `--eg-text-mid` |
| Buttons | Mono | 500 | 10-11px | varies |
| Input text | Mono (ZIP, data) or Body (notes, ask) | 400 | 11px | `--eg-text` |
| Timer | Mono | 500 | 28px | dynamic (see timer rules) |
| Status bar (bottom) | Mono | 400 | 9px | `--eg-text-faint` |
| Benefit pills | Mono | 400 | 9px | `--eg-accent-bright` |

### Letter spacing

- Mono labels at 9px or smaller: `letter-spacing: 0.06em`
- Mono buttons: `letter-spacing: 0.04-0.06em`
- Display serif: `letter-spacing: -0.02em`
- Body text: default (no override)

### Text transform

- Panel headers: uppercase via `text-transform: uppercase` (never manually type in caps)
- Buttons: uppercase in the content string is acceptable for short action labels (START, END, ANALYZE, COMPLETE SECTION)
- Everything else: sentence case

---

## 4. Layout Structure

Three-column grid. Fixed rails, fluid center.

```
┌─────────────────────────────────────────────────────────┐
│ TOP BAR (48px height)                                   │
├────────┬──────────────────────────────────┬──────────────┤
│ LEFT   │ CENTER                           │ RIGHT        │
│ RAIL   │ (fluid)                          │ RAIL         │
│ 210px  │                                  │ 310px        │
│        │                                  │              │
├────────┴──────────────────────────────────┴──────────────┤
│ BOTTOM BAR (30px height)                                │
└─────────────────────────────────────────────────────────┘
```

```css
grid-template-columns: 210px 1fr 310px;
```

- Top bar: 48px, `border-bottom: 1px solid var(--eg-border)`, background `var(--eg-surface-1)` at `ee` alpha
- Bottom bar: 30px, `border-top: 1px solid var(--eg-border)`, same background
- Left rail: `border-right: 1px solid var(--eg-border)`, padding 14px
- Right rail: `border-left: 1px solid var(--eg-border)`, no outer padding (sections have their own)
- Center: padding `24px 40px`, content max-width 580px centered

---

## 5. Component Patterns

### 5.1 Cards

Standard information card (client info, plan context, SEP finder):

```css
background: var(--eg-surface-2);
border-radius: 6px;
border: 1px solid var(--eg-border);
padding: 12px;
```

Card header label:
```css
font-family: var(--eg-font-mono);
font-size: 9px;
color: var(--eg-text-faint);
letter-spacing: 0.06em;
text-transform: uppercase;
margin-bottom: 8px;
```

### 5.2 Script prompt card

```css
background: var(--eg-surface-2);
border-radius: 7px;
border: 1px solid var(--eg-border);
padding: 18px;
```

Script text is Body font, 13.5px, `--eg-text`, `line-height: 1.75`. Dynamic variables (agent name, plan name, etc.) are styled `color: var(--eg-accent); font-weight: 500`.

### 5.3 Compliance note

```css
background: var(--eg-amber-dim);
border-radius: 5px;
padding: 9px 13px;
```

Header row: 5px amber dot + mono 9px "COMPLIANCE" label in `--eg-amber`. Body: Body font, 11.5px, `--eg-amber-text`, `line-height: 1.5`.

**CRITICAL: No left-border accent bars. Ever. On any component. Use a small colored dot (4-5px, border-radius 50%) as the type indicator instead.**

### 5.4 Buttons

**Primary action (COMPLETE SECTION):**
```css
font-family: var(--eg-font-mono);
font-size: 11px;
letter-spacing: 0.04em;
padding: 10px 16px;
border-radius: 5px;
border: 1px solid rgba(106, 171, 125, 0.27); /* green at 44 hex alpha */
background: rgba(106, 171, 125, 0.08);        /* green at 15 hex alpha */
color: var(--eg-green-text);
cursor: pointer;
```

**Secondary action (SKIP, ANALYZE):**
```css
border: 1px solid var(--eg-border);
background: transparent;
color: var(--eg-text-dim);
```

**Danger action (END call):**
```css
background: var(--eg-red-dim);
color: var(--eg-red-text);
border: none;
```

**Start action:**
```css
background: var(--eg-green);
color: #fff;
border: none;
```

**Disabled (SUBMIT ENROLLMENT before completion):**
```css
border: 1px solid var(--eg-border);
background: var(--eg-surface-3);
color: var(--eg-text-faint);
cursor: not-allowed;
opacity: 0.5;
```

### 5.5 Inputs

```css
font-family: var(--eg-font-mono); /* for data inputs like ZIP */
/* OR */
font-family: var(--eg-font-body); /* for prose inputs like notes, ask co-pilot */
font-size: 11px;
padding: 7px 10px;
background: var(--eg-surface-2);
border: 1px solid var(--eg-border);
border-radius: 5px;
color: var(--eg-text);
outline: none;
```

Focus state: `border-color: var(--eg-border-active)`

### 5.6 Pill buttons (left rail tool selectors)

```css
font-family: var(--eg-font-mono);
font-size: 9px;
letter-spacing: 0.04em;
padding: 5px 2px;
border-radius: 4px;
```

Active: `border: 1px solid var(--eg-accent) at 55 alpha; background: var(--eg-accent) at 15 alpha; color: var(--eg-accent);`
Inactive: `border: 1px solid var(--eg-border); background: transparent; color: var(--eg-text-dim);`

### 5.7 Benefit pills (plan context)

```css
font-family: var(--eg-font-mono);
font-size: 9px;
padding: 2px 6px;
border-radius: 3px;
background: rgba(192, 139, 85, 0.08); /* accent at 15 alpha */
color: var(--eg-accent-bright);
```

### 5.8 Flow selector (top bar)

Each flow is a pill button with a beacon dot and label.

Container: `display: flex; gap: 8px;`

Per flow button:
```css
display: flex;
align-items: center;
gap: 5px;
padding: 3px 9px;
border-radius: 5px;
cursor: pointer;
transition: all 0.2s;
```

Active: `border: 1px solid {flowColor}55; background: {flowColor}12;`
Inactive: `border: 1px solid transparent; background: transparent;`

Beacon dot: 7px circle. Active gets the flow's full color + glow shadow `box-shadow: 0 0 8px {flowColor}66` + pulse animation. Inactive uses `--eg-text-faint`.

Label: Mono, 10px, `letter-spacing: 0.06em`. Active: `--eg-text`. Inactive: `--eg-text-dim`.

### 5.9 Tab bar

Tabs sit in the top bar after the flow selector. Each tab is a button.

```css
font-family: var(--eg-font-body);
font-size: 11.5px;
padding: 5px 13px;
border-radius: 4px;
border: none;
cursor: pointer;
transition: all 0.15s;
position: relative;
```

Active: `background: var(--eg-surface-3); color: var(--eg-accent); font-weight: 500;`
Inactive: `background: transparent; color: var(--eg-text-dim); font-weight: 400;`

Active tab has a bottom accent bar:
```css
position: absolute;
bottom: -1px;
left: 20%;
right: 20%;
height: 2px;
background: var(--eg-accent);
border-radius: 1px;
```

### 5.10 Status dot

Universal status indicator used everywhere (compliance sections, flow progress, agent status).

```css
width: 5-8px; /* 5px in tight lists, 6px standard, 8px in section headers */
height: same as width;
border-radius: 50%;
flex-shrink: 0;
```

Colors:
- Done/available/connected: `--eg-green`
- Active/in-progress/busy: `--eg-amber`
- Pending/offline/idle: `--eg-text-faint`

### 5.11 Progress dots

Row of dots showing section progress. Center aligned below the script content.

```css
display: flex;
align-items: center;
justify-content: center;
gap: 6px;
```

Each dot: 8px circle, same color mapping as status dots. **The active section's dot is elongated into a pill: `width: 20px; height: 8px; border-radius: 4px;`** All dots have `transition: all 0.3s ease` and `cursor: pointer`.

### 5.12 Co-Pilot feed bubbles

```css
padding: 7px 10px;
border-radius: 5px;
position: relative;
```

Coaching type: `background: var(--eg-green-dim);`
Remind type: `background: var(--eg-amber-dim);`

Type indicator: 4px colored dot, `position: absolute; top: 7px; right: 8px;`. Coaching = `--eg-green`, remind = `--eg-amber`.

Text: Body font, 11px, `line-height: 1.45`, `padding-right: 14px` to clear the dot. Color matches the dim background's text variant.

**NO LEFT BORDER BARS.**

### 5.13 Compliance panel

Overall score: Mono, 10px, `--eg-green-text`, `font-weight: 500`, right-aligned in the header.

Overall progress bar: 4px height, `border-radius: 2px`, track is `--eg-surface-3`, fill is `linear-gradient(90deg, var(--eg-green), var(--eg-green-text))`.

Per-section rows: status dot (5px) + Body 10.5px label + mini progress bar (32px wide, 3px tall) + Mono 8px score.

### 5.14 Checklist (inline, below script prompt)

Container: same card styling as script prompt card. Header: mono 9px label.

Each item: `display: flex; align-items: center; gap: 10px; padding: 6px 0;` with `border-bottom: 1px solid var(--eg-border) at 44 alpha` between items.

Checkbox: 16px square, `border-radius: 3px`, `border: 1px solid var(--eg-border)`. Checked: border becomes `--eg-green`, background becomes `var(--eg-green) at 25 alpha`, inner fill square 8px in `--eg-green`.

Label: Body 12px. Checked: `color: var(--eg-text-mid); text-decoration: line-through;` Unchecked: `color: var(--eg-text);`

### 5.15 Transcript entries

Speaker label: Mono, 8px, uppercase. Agent = `--eg-accent`, client = `--eg-blue`.
Timestamp: Mono, 8px, `--eg-text-faint`, inline after speaker label.
Body: Body, 11.5px, `--eg-text-mid`, `line-height: 1.55`.

Entry animation: `slideIn 0.3s ease` with staggered delay per entry.

### 5.16 Enrollment CTA (bottom of center column)

```css
padding: 16px;
background: var(--eg-surface-2);
border-radius: 7px;
border: 1px solid var(--eg-border);
display: flex;
align-items: center;
justify-content: space-between;
```

Label side: Mono 9px header "ENROLLMENT" + Body 12px description.
Button side: disabled button pattern until all sections complete, then switches to primary green action.

---

## 6. Timer Rules

The call timer is Mono, 28px, weight 500, `letter-spacing: 0.08em`. Its color shifts based on duration:

```javascript
const timerColor = (seconds) => {
  if (seconds < 900) return 'var(--eg-green)';      // under 15 min
  if (seconds < 1200) return 'var(--eg-amber)';      // 15-20 min
  if (seconds < 1800) return 'var(--eg-accent)';      // 20-30 min
  return 'var(--eg-red)';                              // over 30 min
};
```

Transition: `color 1s ease`.

---

## 7. Animations

### Pulse (beacon glow)
```css
@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 0.15; }
  50% { transform: scale(1.6); opacity: 0.35; }
}
```
Used on: active flow beacon glow ring. Duration: 2.5s, ease-in-out, infinite.

### Breathe (live indicators)
```css
@keyframes breathe {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
```
Used on: LIVE dot next to timer (2s), transcript live dot (1.5s).

### Slide in (transcript entries)
```css
@keyframes slideIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
```
Duration: 0.3s ease, staggered delay 0.08s per entry.

### Transitions
- All interactive elements: `transition: all 0.15-0.2s ease`
- Progress bars: `transition: width 0.5s ease`
- Timer color: `transition: color 1s ease`
- Progress dots width: `transition: all 0.3s ease`

---

## 8. Background Textures

### Strata lines

Subtle topographic contour lines rendered as an SVG overlay on the app background. Opacity: 0.035. Color: `--eg-accent`. Mix of solid (0.6px) and dashed (0.3px, dasharray "6 10") strokes. Pointer-events: none.

These are decorative only. They must never interfere with readability. If a new page or component has a lot of content, the strata are still present underneath at the same low opacity.

### Grain overlay

Canvas-based noise texture. 200x200 pixel grid of random grayscale values at alpha 8 (out of 255). Canvas opacity: 0.5. Pointer-events: none.

Both textures are rendered once and positioned `absolute, inset: 0` behind all content.

---

## 9. Waveform Visualizer

Canvas-based audio level visualization. 240px wide, 32px tall. 48 vertical bars with 2px gaps.

Active state: bars animate with sine-wave modulation, color `--eg-accent` at `aa` alpha.
Idle state: bars are near-flat (5% height + subtle 3% oscillation), color `--eg-text-faint` at `44` alpha.

Position: inline next to the timer in the call control bar.

---

## 10. Scrollbar

Global custom scrollbar for webkit browsers:

```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--eg-border); border-radius: 2px; }
```

---

## 11. Absolute Rules

These are non-negotiable. Every component, every page, every feature must follow these:

1. **No colored left-border accent bars.** Not on cards, not on co-pilot bubbles, not on compliance notes, not anywhere. Use colored dots as type indicators instead.

2. **No em dashes.** Use commas, periods, or parentheses.

3. **No gradients on surfaces.** The only gradient allowed is the compliance overall progress bar fill. All card/panel/rail backgrounds are solid colors from the surface palette.

4. **No drop shadows.** Depth comes from surface color layering (surface-1 behind surface-2 behind surface-3), not shadows.

5. **No colored backgrounds on outer containers.** The app background is `--eg-base`. Rails and bars use `--eg-surface-1` at `ee` or `88` alpha. Cards use `--eg-surface-2`. That is the depth stack.

6. **Borders are always 1px solid.** Never 2px, never dotted, never dashed (except strata texture lines which are SVG, not CSS).

7. **Border radius values:** 3px for pills/tags, 4px for small buttons, 5px for standard buttons/inputs, 6px for cards, 7px for large cards (script prompt, enrollment CTA). Never use fully rounded (50% or 999px) on rectangles.

8. **The accent color is `--eg-accent` (#c08b55).** It is used for: the wordmark, active tab text and indicator, active tab accent bar, script variable highlights, agent speaker labels, plan context carrier name, ask co-pilot send button, benefit pills background. It is NOT used for: success/error/warning states (use semantic colors), flow-specific accents (use flow colors), general text (use text palette).

9. **Status always uses the three-state dot pattern:** green = done/good, amber = active/warning, faint = pending/inactive. This is consistent across compliance sections, progress dots, agent status, connection indicators.

10. **Mono font is for machine-readable data.** Timestamps, NPNs, H-numbers, field labels, status labels, button text, ZIP codes, MBI numbers. Body font is for human-readable content: script prompts, descriptions, transcript text, notes, names.

---

## 12. Page-Specific Notes

### Script tab (primary view)
Covered fully by this spec. Three-column layout, timer bar at top of center, script content below, left rail has client context, right rail has live data.

### Agent Tools tab
Same three-column layout. Center column renders tool content (SEP Qualifier, Plan Letter Lookup, D-SNP Stop-Gate, Drug Formulary, carrier links). Each tool is a card with the standard card pattern. Use the pill button pattern for tool selection (same as left rail SEP/Qualifier/SNP buttons).

### Intelligence tab
Center column renders the intelligence dashboard. Use metric card pattern for summary numbers (total calls, avg duration, avg compliance score, follow-up count). Use the card pattern for detail panels (carrier heatmap, agent coaching summaries, sentiment analysis).

### Compliance Hub tab
Center column renders expanded compliance view. Full section-by-section breakdown with expandable detail per section. Use the checklist pattern for intent-level detail. Overall score prominent at top.

### Calls tab
Center column renders call history table. Use Body font for table content, Mono for timestamps and scores. Rows should have subtle hover state (`background: var(--eg-surface-3)`). This is the "Bloomberg terminal" view of the app. Dense data, but still using the same design tokens.

### Daily Verse tab
Center column, vertically centered. Verse text in Display serif, 20px, `--eg-text`. Reference in Mono, 11px, `--eg-text-dim`. Clean, minimal, no card wrapper. Just the text on the background with strata visible behind it.

### Onboarding wizard
Full-screen centered card (max-width 500px). Multi-step with progress dots at the top. Same card, button, and input patterns. Agency name, NPN, licensed states checklist, agent setup.

### Landing page (enrollgen.com)
Dark background matching `--eg-base`. Hero section with Display serif headline, Body description, accent CTA button. Feature sections use the card pattern. Screenshots/mockups of the live app. Same typography scale. No separate design language, the marketing site IS the product aesthetic.

---

## 13. Implementation Order

When refactoring existing components to match this design system:

1. Create `src/styles/design-tokens.css` with all CSS custom properties from Section 2
2. Import the Google Fonts in `index.html` or `index.css`
3. Update `index.css` / global styles with scrollbar, animation keyframes, base background
4. Update top bar (wordmark, flow selector, tabs)
5. Update right rail (status, co-pilot ask, transcript, co-pilot feed, compliance)
6. Update left rail (inputs, tool buttons, cards)
7. Update center column (timer bar, script content, progress dots, enrollment CTA)
8. Update remaining tabs one at a time

Do not attempt to reskin everything in one commit. Each item above is a separate commit. Test each one before moving to the next.

---

*New Gen Health Solutions, LLC — EnrollGen Design System v3.0 — May 2026 — Confidential*
