import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDeploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {validateRoster} from '../telephony/src/lib/deploymentRoster.js';
import {FEATURE_NAMES} from '../telephony/src/lib/deploymentFeatures.js';
import {forbiddenIdentityOffsets} from '../scripts/security/agency-fingerprints.mjs';
const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/clean-export/'+name,import.meta.url),'utf8'));
test('sanitized export profiles validate even with every optional integration enabled',()=>{
  const enabled=Object.fromEntries(FEATURE_NAMES.map(name=>[name,true]));
  for(const name of ['root-profile.json','telephony-profile.json']){
    const profile=fixture(name);
    assert.equal(forbiddenIdentityOffsets(JSON.stringify(profile)).length,0);
    assert.equal(parseDeploymentProfile(profile,enabled).tenantId,profile.tenantId);
  }
});
test('sanitized export roster preserves twelve valid distinct agent bindings and profile tenancy',()=>{
  const roster=fixture('roster.json');
  assert.equal(validateRoster(roster,{ghl:true}).length,12);
  assert.equal(forbiddenIdentityOffsets(JSON.stringify(roster)).length,0);
  assert.ok(roster.every(agent=>agent.tenant_id===fixture('root-profile.json').tenantId));
});
