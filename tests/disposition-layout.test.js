import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const phone = await readFile(new URL('../src/components/phone/PhoneDropdown.jsx', import.meta.url), 'utf8');
const box = await readFile(new URL('../src/components/phone/CallDispositionBox.jsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles/phone-dropdown.css', import.meta.url), 'utf8');

test('pending pill stays beside fixed phone controls in light and dark themes', () => {
  assert.match(phone, /className="phone-dd__disposition-pill"/);
  assert.match(phone, /phone-dd__disposition-label/);
  assert.match(phone, /hasCall \? <span className="phone-dd__badge"/);
  assert.match(styles, /\.phone-dd__disposition-pill\s*\{[^}]*width:\s*auto !important/s);
  assert.match(styles, /\.phone-dd__disposition-pill::after/);
  assert.match(styles, /@media \(max-width: 1279px\)/);
  assert.match(styles, /html\.dark #root \.phone-disposition #dialer-disposition \{ color-scheme: dark; \}/);
  assert.match(styles, /#root \.phone-disposition #dialer-disposition \{[\s\S]*color-scheme: light;/);
});

test('disposition control has visible placeholder, configured options, and disabled empty save', () => {
  assert.match(box, /Select disposition/);
  assert.match(box, /CALL_OUTCOME_OPTIONS\.map/);
  assert.match(box, /No dispositions configured/);
  assert.match(box, /disabled=\{saving\|\|!outcome/);
  assert.match(styles, /#root \.phone-disposition #dialer-disposition \{[\s\S]*width: 100% !important;[\s\S]*text-indent: 0 !important;/);
  assert.match(styles, /#root \.phone-disposition #dialer-disposition option \{[\s\S]*background:[\s\S]*color:/);
  assert.match(phone, /phone-dd__panel--disposition-modal/);
  assert.match(styles, /\.phone-dd__backdrop \{[\s\S]*position: fixed;[\s\S]*inset: 0;/);
});
