import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {cleanExport,exported} from '../scripts/clean-export.mjs';
const setup = () => {
  const parent=mkdtempSync(path.join(tmpdir(),'enrollgen-export-test-')),root=path.join(parent,'source');mkdirSync(root);
  return {parent,root,destination:path.join(parent,'review')};
};
test('reviewer export exclusions cover every requested internal category and retain source and templates',()=>{
  for(const file of ['ENROLLGEN_FULL_AUDIT.md','CODEX_PROMPT_example.md','PILOT_READINESS.md','docs/pilot-p0-3-authorization.md','docs/pilot-load.json','docs/internal-archive/plan.md','docs/legacy-operations/old.txt','docs/current-agency-profile.example.json','.claude/settings.local.json','.env','.env.local','telephony/.env','calls_500.jsonl','eval_report.json','supabase/migrations/007_multi_tenant_foundation.sql'])assert.equal(exported(file),false,file);
  for(const file of ['src/main.jsx','telephony/src/server.js','config/deployment-profile.example.json','.env.example','telephony/.env.example','supabase/migrations/159_ghl_delivery_minimization.sql'])assert.equal(exported(file),true,file);
});
test('export writes a new external directory, preserves source and templates, and excludes local settings',()=>{
  const f=setup();
  try {
    mkdirSync(path.join(f.root,'src'));writeFileSync(path.join(f.root,'src','safe.js'),'export const safe = true;');
    writeFileSync(path.join(f.root,'.env.example'),'OPENAI_API_KEY=replace-with-openai-api-key');
    writeFileSync(path.join(f.root,'.env.local'),'must stay private');
    cleanExport(f.root,f.destination);
    assert.equal(readFileSync(path.join(f.destination,'src/safe.js'),'utf8'),'export const safe = true;');
    assert.equal(existsSync(path.join(f.destination,'.env.local')),false);
    assert.ok(existsSync(path.join(f.destination,'.env.example')));
    assert.throws(()=>cleanExport(f.root,f.destination));assert.throws(()=>cleanExport(f.root,path.join(f.root,'review')));
  } finally {rmSync(f.parent,{recursive:true,force:true});}
});
for(const kind of ['secret','agency'])test(`export refuses and removes its output when the ${kind} scan fails`,()=>{
  const f=setup();
  try {
    mkdirSync(path.join(f.root,'src'));
    const content=kind==='secret'?['sk','proj','Ab9Cd8Ef7Gh6Ij5Kl4Mn3Op2Qr1St0Uv'].join('-'):JSON.parse(readFileSync('tests/fixtures/forbidden-deployment-terms.json','utf8'))[0];
    writeFileSync(path.join(f.root,'src','planted.js'),content);
    assert.throws(()=>cleanExport(f.root,f.destination));assert.equal(existsSync(f.destination),false);
    assert.ok(existsSync(path.join(f.root,'src/planted.js')));
  } finally {rmSync(f.parent,{recursive:true,force:true});}
});
test('export rejects symlinks without reading outside the source tree',()=>{
  const f=setup();
  try {symlinkSync('/etc/passwd',path.join(f.root,'link'));assert.throws(()=>cleanExport(f.root,f.destination));assert.equal(existsSync(f.destination),false);}
  finally {rmSync(f.parent,{recursive:true,force:true});}
});
