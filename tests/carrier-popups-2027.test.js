import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CARRIER_POPUP_FOOTER,
  CARRIER_REFERENCE_POPUPS,
  CARRIER_REFERENCE_POPUPS_BY_ID,
  POPUP_STATUS,
} from '../src/components/ancillary/carrierReferencePopupData.js';

const BENEFIT_SECTIONS = new Set(['card', 'credits', 'benefits', 'food-home', 'spendables', 'otc', 'example-plan']);
const allNotes = () => CARRIER_REFERENCE_POPUPS.flatMap((popup) =>
  popup.sections.flatMap((section) => section.notes.map((note) => ({ popup, section, note }))));

test('11 carriers, with IBC split out from Braven/Horizon', () => {
  assert.equal(CARRIER_REFERENCE_POPUPS.length, 11);
  const { braven, ibc } = CARRIER_REFERENCE_POPUPS_BY_ID;
  assert.ok(braven && ibc);
  assert.ok(!braven.aliases.some((alias) => /independence|ibx|ibc|keystone|personal choice/.test(alias)));
  assert.ok(!ibc.aliases.some((alias) => /braven|horizon/.test(alias)));
  assert.ok(ibc.aliases.includes('independence blue cross') && ibc.aliases.includes('ibx'));
});

test('aliases are unique across carriers', () => {
  const seen = new Map();
  for (const popup of CARRIER_REFERENCE_POPUPS) {
    for (const alias of popup.aliases) {
      assert.ok(!seen.has(alias), `${alias} used by ${seen.get(alias)} and ${popup.id}`);
      seen.set(alias, popup.id);
    }
  }
});

test('every popup carries a 2027 status and every note cites an https source', () => {
  for (const popup of CARRIER_REFERENCE_POPUPS) {
    assert.ok(Object.values(POPUP_STATUS).includes(popup.status), popup.id);
  }
  for (const { popup, note } of allNotes()) {
    assert.equal(typeof note.text, 'string', popup.id);
    assert.match(note.source, /^https:\/\//, `${popup.id}: ${note.text}`);
  }
});

test('benefit notes and dollar amounts are tagged plan-specific', () => {
  for (const { popup, section, note } of allNotes()) {
    if (BENEFIT_SECTIONS.has(section.id) && !/Sydney Health/.test(note.text)) {
      assert.ok(note.planSpecific, `${popup.id}/${section.id}: ${note.text}`);
    }
    if (/\$\d/.test(note.text)) {
      assert.ok(note.planSpecific, `${popup.id}: ${note.text}`);
    }
  }
});

test('manager renders the verification footer, status and plan-specific tag', () => {
  assert.equal(CARRIER_POPUP_FOOTER, "Verify in the 2027 Summary of Benefits / EOC for the caller's plan and county");
  const manager = readFileSync(new URL('../src/components/ancillary/CarrierReferencePopupManager.jsx', import.meta.url), 'utf8');
  assert.match(manager, /\{CARRIER_POPUP_FOOTER\}/);
  assert.match(manager, /getStatusLabel\(carrier\.status\)/);
  assert.match(manager, /Plan-specific/);
});

test('Braven popup: individual MA ends, non-renewal SEP, Horizon SNPs continue', () => {
  const text = CARRIER_REFERENCE_POPUPS_BY_ID.braven.sections.flatMap((s) => s.notes.map((n) => n.text)).join(' ');
  assert.match(text, /individual MA plans .* end Dec 31, 2026/);
  assert.match(text, /Dec 8 through the end of February/);
  assert.match(text, /Horizon NJ TotalCare \(HMO D-SNP\).*all 21 NJ counties/);
  assert.match(text, /Horizon Specialty Care \(HMO C-SNP\).*Bergen, Essex, Hudson, Morris, Passaic, Somerset, Union/);
});

import { findTriggeredCarrierIds } from '../src/components/ancillary/carrierPopupMatching.js';

const agent = (text) => ({ speaker: 'agent', isFinal: true, text });
const customer = (text) => ({ speaker: 'customer', isFinal: true, text });
const triggers = (entries) => findTriggeredCarrierIds({ transcript: '', mergedTranscript: entries });

test('Braven popup is retitled for Braven / Horizon MA', () => {
  assert.equal(CARRIER_REFERENCE_POPUPS_BY_ID.braven.popupTitle, 'Braven / Horizon MA (2027)');
});

test('"Horizon" triggers the Braven / Horizon MA popup only with Medicare Advantage context', () => {
  for (const context of [
    'I want to look at Medicare Advantage options',
    'Is that an MA plan?',
    'I prefer a PPO',
    'Does it include Part C?',
    'My Braven plan is ending',
    'Tell me about an Advantage plan',
  ]) {
    assert.deepEqual(
      triggers([customer(context), agent("I'm going to enroll you in the Horizon plan")]),
      ['braven'],
      context
    );
  }
  // Plain-transcript fallback path.
  assert.deepEqual(
    findTriggeredCarrierIds({ transcript: "We compared Medicare Advantage plans. Let's go with Horizon." }),
    ['braven']
  );
});

test('"Horizon" without MA context, or for Medigap / OMNIA / ACA, does not trigger', () => {
  assert.deepEqual(triggers([agent("I'm going to enroll you in the Horizon plan")]), []);
  assert.deepEqual(triggers([customer('Yes ma\'am, my mama has Horizon'), agent("Let's go with Horizon")]), []);
  for (const utterance of [
    "I'm going to enroll you in the Horizon Medigap Plan G",
    "Let's go with the Horizon Med Supp plan",
    "We'll do the Horizon Medicare Supplement",
    "I'm going to enroll you in Horizon OMNIA",
    "Let's go with the Horizon ACA plan through Get Covered NJ",
    "We're going to go with Horizon on the marketplace",
  ]) {
    // MA context elsewhere on the call must not override a non-MA Horizon product.
    assert.deepEqual(triggers([customer('I also looked at Medicare Advantage'), agent(utterance)]), [], utterance);
  }
});

test('IBC aliases still trigger only the IBC popup', () => {
  assert.deepEqual(triggers([agent("I'm going to enroll you in Keystone 65")]), ['ibc']);
  assert.deepEqual(triggers([customer('Medicare Advantage please'), agent("Let's go with Independence Blue Cross")]), ['ibc']);
});
