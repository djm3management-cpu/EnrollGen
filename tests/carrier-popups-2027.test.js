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
