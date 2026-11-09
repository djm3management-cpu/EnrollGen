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
});

test('dialer and pending disposition share a right-aligned dropdown below the relative toolbar trigger', () => {
  assert.match(styles, /\.phone-dd\s*\{[^}]*position:\s*relative;/);
  const panel = [...styles.matchAll(/\.phone-dd__panel\s*\{([^}]+)\}/g)].find(match => match[1].includes('box-sizing: border-box'))[1];
  assert.match(panel, /position:\s*absolute;/);
  assert.match(panel, /top:\s*calc\(100% \+ 8px\);/);
  assert.match(panel, /right:\s*0;/);
  assert.match(panel, /left:\s*auto;/);
  assert.match(panel, /transform:\s*none;/);
  assert.match(panel, /max-height:\s*min\(600px, calc\(100dvh/);
  const disposition = styles.match(/\.phone-dd__panel--disposition\s*\{([^}]+)\}/)[1];
  assert.doesNotMatch(disposition, /position:|top:|left:|right:|transform:/);
  assert.match(phone, /phone-dd__panel--disposition/);
  assert.doesNotMatch(phone + styles, /phone-dd__backdrop|phone-dd__panel--disposition-modal/);
});
