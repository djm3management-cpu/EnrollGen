import test from 'node:test';
import assert from 'node:assert/strict';
import { ANCILLARY_PRODUCT_OPTIONS, ancillarySaleError, buildCallOutcomePatch } from '../src/lib/ancillarySale.js';
import { CALL_OUTCOME_OPTIONS, callOutcomeLabel, buildPostCallPayload } from '../src/lib/postCallPipeline.js';

test('ancillary sale is a selectable disposition and requires one of the five supported products', () => {
  assert.equal(CALL_OUTCOME_OPTIONS.flatMap(group => group.options).filter(option => option.value === 'sale_ancillary').length, 1);
  assert.equal(callOutcomeLabel('sale_ancillary'), 'Sale - Ancillary');
  for (const type of [null, undefined, '', 'other', 'MA']) {
    assert.match(ancillarySaleError('sale_ancillary', type), /Select a product type/);
    assert.throws(() => buildCallOutcomePatch('sale_ancillary', type), /Select a product type/);
  }
  for (const { value } of ANCILLARY_PRODUCT_OPTIONS) {
    assert.deepEqual(buildCallOutcomePatch('sale_ancillary', value), { call_outcome: 'sale_ancillary', ancillary_product_type: value });
  }
  assert.deepEqual(buildCallOutcomePatch('not_interested', 'cancer'), { call_outcome: 'not_interested', ancillary_product_type: null });
});

test('wrap-up payload carries the sold product separately from the originating call flow', () => {
  const state = { notes: { callOutcome: 'sale_ancillary', ancillaryProductType: 'final_expense' } };
  const payload = buildPostCallPayload({ state, flow: 'ma', final: true });
  assert.equal(payload.product_type, 'MA');
  assert.equal(payload.ancillary_product_type, 'final_expense');
  assert.equal(buildPostCallPayload({ state: { notes: { ...state.notes, callOutcome: 'enrolled' } } }).ancillary_product_type, null);
});
