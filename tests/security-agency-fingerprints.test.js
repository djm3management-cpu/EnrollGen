import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fingerprint,forbiddenIdentityOffsets} from '../scripts/security/agency-fingerprints.mjs';
const terms=JSON.parse(readFileSync('tests/fixtures/forbidden-deployment-terms.json','utf8'));
const captured=JSON.parse(readFileSync('scripts/security/agency-fingerprints.json','utf8'));
test('every private forbidden term has an exact captured fingerprint, in order with no omissions',()=>{
  assert.deepEqual(captured,terms.map(fingerprint));
  for(const term of terms){
    const lower=term.toLowerCase();
    const content=`prefix:${term.toUpperCase()}:middle:${lower}:suffix`;
    const offsets=forbiddenIdentityOffsets(content);
    const expected=[];
    for(let i=0;i<content.length;i++)if(terms.some(t=>content.toLowerCase().startsWith(t.toLowerCase(),i)))expected.push(i);
    assert.deepEqual(offsets,expected,'Complete substring and case-insensitive parity');
  }
});
test('fingerprint matching preserves offsets in binary text and finds repeated adjacent terms',()=>{
  const term=terms[0];
  const content=Buffer.concat([Buffer.from([0,255]),Buffer.from(term+term),Buffer.from([0])]);
  const text=content.toString().toLowerCase();
  const expected=[];
  for(let i=0;i<text.length;i++)if(terms.some(t=>text.startsWith(t.toLowerCase(),i)))expected.push(i);
  assert.deepEqual(forbiddenIdentityOffsets(content),expected);
  assert.deepEqual(forbiddenIdentityOffsets('Synthetic agency with reserved example.test domains'),[]);
});
