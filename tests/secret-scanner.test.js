import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {scanText,run} from '../scripts/security/scan-secrets.mjs';
const payload = 'Ab9Cd8Ef7Gh6Ij5Kl4Mn3Op2Qr1St0Uv';
const cases = [
  ['openai-key', ['sk','proj',payload].join('-')],
  ['clerk-secret', ['sk','live',payload].join('_')],
  ['stripe-key', ['rk','test',payload].join('_')],
  ['signing-secret', 'whsec'+'_'+payload],
  ['supabase-service-key', 'sb'+'_secret_'+payload],
  ['resend-key', 're'+'_'+payload],
  ['github-token', 'ghp'+'_'+payload],
  ['private-key', '-----BEGIN '+'PRIVATE KEY-----'],
  ['private-key', '-----BEGIN '+'RSA PRIVATE KEY-----'],
  ['private-key', '-----BEGIN '+'OPENSSH PRIVATE KEY-----'],
  ['password-connection-string', 'postgresql://review:'+payload+'@database.invalid/db'],
  ['password-connection-string', 'mongodb+srv://review:'+payload+'@database.invalid/db'],
  ['password-connection-string', 'rediss://review:'+payload+'@cache.invalid'],
  ['webhook-capability', 'https://hooks.slack.com/'+'services/T000/B000/'+payload],
  ['webhook-capability', 'https://services.leadconnectorhq.com/'+'hooks/'+payload+'/webhook-trigger/'+payload],
  ['webhook-capability', 'https://discord.com/api/'+'webhooks/123456/'+payload],
  ['webhook-capability', 'https://sink.invalid/webhook?token='+payload],
  ['deepgram-key', 'DEEPGRAM_API_KEY="'+payload+'"'],
  ['twilio-secret', 'TWILIO_AUTH_TOKEN='+payload],
  ['signing-secret', 'AGENT_WS_SIGNING_SECRET="'+payload+'"'],
  ['provider-credential', 'GIPHY_API_KEY="'+payload+'"'],
  ['provider-credential', 'IX_PASSWORD="'+payload+'"'],
  ['supabase-service-key', ['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url'),payload].join('.')],
];
for (const [type,value] of cases) test(`secret scanner catches synthetic ${type} variant ${cases.indexOf(cases.find(c=>c[1]===value))}`,()=>{
  const findings = scanText('\n'+value,'planted.txt');
  assert.ok(findings.some(f=>f.type===type));
  assert.ok(findings.every(f=>f.line===2));
  assert.ok(!JSON.stringify(findings).includes(payload));
});
test('whole placeholders and public identifiers pass; provider test keys remain secrets',()=>{
  for(const value of ['replace-with-twilio-auth-token','your_secret_key','<approved-secret>','fixture']) assert.deepEqual(scanText(`TWILIO_AUTH_TOKEN="${value}"`,'example.txt'),[]);
  assert.deepEqual(scanText('SUPABASE_PUBLISHABLE_KEY="public-opaque-key-placeholder"\nTWILIO_ACCOUNT_SID="AC00000000000000000000000000000000"','example.txt'),[]);
  assert.ok(scanText(['sk','test',payload].join('_'),'test.txt').length);
});
test('allowlist requires the exact path, type, fingerprint and documented reason',()=>{
  const value = cases[0][1], entry={path:'fixture.txt',type:'openai-key',sha256:createHash('sha256').update(value).digest('hex'),reason:'Planted unit fixture, not a provider credential.'};
  assert.deepEqual(scanText(value,'fixture.txt',{allowlist:[entry]}),[]);
  assert.ok(scanText(value,'other.txt',{allowlist:[entry]}).length);
  assert.ok(scanText(value+'X','fixture.txt',{allowlist:[entry]}).length);
  assert.ok(scanText(value,'fixture.txt',{allowlist:[{...entry,reason:''}]}).length);
});
test('directory CLI fails and never prints any planted value or secret-bearing argument',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'enrollgen-secret-test-'));
  try {
    writeFileSync(path.join(dir,'planted.txt'),cases.map(c=>c[1]).join('\n'));
    const result=spawnSync(process.execPath,['scripts/security/scan-secrets.mjs','--directory',dir],{encoding:'utf8'});
    assert.equal(result.status,1);
    assert.ok(!`${result.stdout}${result.stderr}`.includes(payload));
    assert.match(result.stdout,/planted.txt:1: openai-key/);
    assert.match(result.stdout,/FAIL secret scan/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test('history scan finds deleted secrets, reports commits and paths only, and never changes history',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'enrollgen-history-test-'));
  const git=args=>execFileSync('git',args,{cwd:dir,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try {
    git(['init','-b','pilot/release']);
    writeFileSync(path.join(dir,'removed.txt'),cases[0][1]);git(['add','removed.txt']);
    const commit=()=>git(['-c','user.name=Synthetic Reviewer','-c','user.email=reviewer@example.invalid','-c','commit.gpgsign=false','-c','core.hooksPath=/dev/null','commit','-m','Synthetic history fixture']);
    commit();const old=git(['rev-parse','HEAD']).trim();git(['rm','removed.txt']);commit();const head=git(['rev-parse','HEAD']);
    const report=path.join(dir,'report.json');
    const result=spawnSync(process.execPath,[path.resolve('scripts/security/scan-secrets.mjs'),'--history',report],{cwd:dir,encoding:'utf8'});
    assert.equal(result.status,0);assert.equal(git(['rev-parse','HEAD']),head);
    const text=readFileSync(report,'utf8'),data=JSON.parse(text);
    assert.equal(data.commitsScanned,2);assert.equal(data.byType['openai-key'],1);
    assert.ok(data.findings.some(f=>f.commit===old&&f.path==='removed.txt'));
    assert.ok(!`${text}${result.stdout}${result.stderr}`.includes(payload));
    assert.deepEqual(git(['status','--porcelain','--untracked-files=no']),'');
  } finally {rmSync(dir,{recursive:true,force:true});}
});

function pendingFixture(check) {
  const dir=mkdtempSync(path.join(tmpdir(),'enrollgen-pending-exception-'));
  const value=cases[14][1], file='pending.txt', text='\n'+value;
  writeFileSync(path.join(dir,file),text);
  const finding=scanText(text,file,{allowlist:[],fingerprints:true})[0];
  const entry={...finding,status:'active, rotation pending',reason:'Synthetic lifecycle fixture.',reviewBy:'2026-12-15',initialReviewBy:'2026-12-15'};
  try {check({dir,text,value,entry});} finally {rmSync(dir,{recursive:true,force:true});}
}
test('active exception passes with a visible path/date warning through the UTC review-by date, without leaking values',()=>pendingFixture(({dir,value,entry})=>{
  for(const time of ['2026-11-15T12:00:00Z','2026-12-15T23:59:59.999Z']) {
    const logs=[],result=run(['--directory',dir],{allowlist:[entry],now:new Date(time),log:line=>logs.push(line)});
    assert.equal(result,0);assert.ok(logs.some(line=>line.startsWith('WARNING ACTIVE SECRET EXCEPTION: pending.txt:2; review-by 2026-12-15')));
    assert.ok(!logs.join('\n').includes(value));assert.ok(!logs.join('\n').includes(payload));
  }
}));
test('active exception fails immediately after the review-by date even when its file is absent',()=>pendingFixture(({dir,value,entry})=>{
  for(const absent of [false,true]) {
    if(absent)rmSync(path.join(dir,'pending.txt'));
    const logs=[],result=run(['--directory',dir],{allowlist:[entry],now:new Date('2026-12-16T00:00:00Z'),log:line=>logs.push(line)});
    assert.equal(result,1);assert.ok(logs.some(line=>line.includes('review overdue')));
    assert.ok(!logs.join('\n').includes(value));assert.ok(!logs.join('\n').includes(payload));
  }
}));
test('marking an exact exception rotated passes cleanly after the old deadline with no active warning',()=>pendingFixture(({dir,value,entry})=>{
  const logs=[],result=run(['--directory',dir],{allowlist:[{...entry,status:'rotated'}],now:new Date('2026-12-20T12:00:00Z'),log:line=>logs.push(line)});
  assert.equal(result,0);assert.ok(logs.every(line=>!line.includes('WARNING')&&!line.includes('FAIL')));
  assert.ok(!logs.join('\n').includes(value));assert.ok(!logs.join('\n').includes(payload));
}));
test('extending a review deadline requires a separately documented new reason; malformed dates fail closed',()=>pendingFixture(({dir,entry})=>{
  const check=exception=>run(['--directory',dir],{allowlist:[exception],now:new Date('2026-12-20T12:00:00Z'),log:()=>{}});
  assert.equal(check({...entry,reviewBy:'2027-01-15'}),1);
  assert.equal(check({...entry,reviewBy:'2027-01-15',reviewExtensionReason:'Synthetic owner extension after documented provider delay.'}),0);
  assert.equal(check({...entry,reviewBy:'2027-02-30',reviewExtensionReason:'Synthetic invalid date.'}),1);
}));
test('active exception is confined to one fingerprint, path, line and column, including duplicates on the same line',()=>pendingFixture(({text,value,entry})=>{
  const options={allowlist:[entry],now:new Date('2026-11-15T12:00:00Z')};
  assert.deepEqual(scanText(text,entry.path,options),[]);
  for(const [content,file] of [[text,'other.txt'],['\n'+text,entry.path],['\n '+value,entry.path],['\n'+value+'X',entry.path],[text+' '+value,entry.path]])assert.ok(scanText(content,file,options).length);
  assert.ok(scanText(text,entry.path,{...options,allowlist:[{...entry,column:undefined}]}).length);
}));
