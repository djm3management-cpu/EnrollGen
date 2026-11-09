import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {createClerkFetch} from '../src/lib/clerkFetch.js';
import * as api from '../src/lib/adminReviewApi.js';
const source=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const jwt=claims=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const hookSource=source('src/hooks/useAdminReviewAccess.js').replace(/^import .*;\n/gm,'').replace(/^export /gm,'');
const claims=vm.runInNewContext(hookSource+';adminReviewClaims',{atob});
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
function fixture(component,{admin=false,loaded=true,status=200}={}){
 const h=hookHarness(),requests=[],timers=new Map(),tokenOptions=[];let nextId=0,replyStatus=status;
 let payload={sub:'user',org_id:'org',org_role:admin?'org:admin':'org:member'};
 const auth={user:{id:'user'},organization:{id:'org'},identityLoaded:loaded,isSignedIn:true,sessionExpired:false,
  getToken:async options=>{tokenOptions.push(options);return jwt(payload);}};
 const useAdminReviewAccess=vm.runInNewContext(hookSource+';useAdminReviewAccess',{...h.hooks,useAppAuth:()=>auth,atob});
 const fetchWithClerk=(getToken,url,init)=>createClerkFetch(getToken,{send:async(target,options)=>{
  requests.push({url:target,options});
  const isAdmin=claims(options.headers.get('Authorization').slice(7));
  const status=isAdmin?replyStatus:403;
  const data=component==='ComplianceUploads'?{admin:true,ix_environment:'TEST',failures:[],missing:[],reconciliation:[]}: {count:0,rows:[]};
  return Response.json(status===200?data:{error:'Forbidden'},{status});
 }})(url,init);
 const compiled=transformSync(source(`src/components/callLog/${component}.jsx`),{loader:'jsx',format:'cjs',jsxFactory:'element',jsxFragment:'fragment'}).code;
 const module={exports:{}};
 vm.runInNewContext(compiled,{module,exports:module.exports,URLSearchParams,element:(type,props,...children)=>({type,props:props||{},children}),fragment:'fragment',
  setInterval:(fn,ms)=>{timers.set(++nextId,{fn,ms});return nextId;},clearInterval:id=>timers.delete(id),
  require(name){if(name==='react')return h.hooks;if(name.endsWith('/AuthContext'))return {useAppAuth:()=>auth};if(name.endsWith('/useAdminReviewAccess.js'))return {useAdminReviewAccess};if(name.endsWith('/adminReviewApi.js'))return api;if(name.endsWith('/clerkFetch.js'))return {fetchWithClerk};if(name.endsWith('/EnrollmentIntake'))return {__esModule:true,default:'intake'};throw Error(name);},
 });
 h.mount(()=>module.exports.default());
 return {h,auth,requests,timers,tokenOptions,nodes:()=>walk(h.value),setStatus:status=>{replyStatus=status;},setClaims:next=>{payload=next;},tick:async()=>{for(const {fn} of [...timers.values()])await fn();await h.flush();}};
}

test('admin claims match server vocabulary and never trust roster roles or unsafe metadata',()=>{
 for(const payload of [{org_id:'org',org_role:'org:admin'},{o:{id:'org',rol:'admin'}},{o:{id:'org',rol:'owner'}},{role:'admin'},{public_metadata:{isAdmin:true}},{metadata:{role:'admin'}}])assert.equal(claims(jwt(payload)),true);
 for(const payload of [{},{org_role:'org:admin'},{org_id:'org',org_role:'org:member'},{unsafe_metadata:{role:'admin'}},{agent_role:'admin'}])assert.equal(claims(jwt(payload)),false);
 assert.equal(claims('not-a-token'),false);
});
for(const component of ['ParagonResidenceReview','ComplianceUploads']){
 test(`${component}: page load and timers make zero admin requests for ordinary agents, before auth hydration, or during expired sessions`,async()=>{
  const f=fixture(component,{loaded:false});try{
   await f.h.flush();assert.equal(f.requests.length,0);assert.equal(f.tokenOptions.length,0);
   f.auth.identityLoaded=true;f.h.render();await f.h.flush();await f.tick();assert.equal(f.requests.length,0);assert.equal(f.timers.size,0);assert.equal(f.h.value,null);
   f.auth.sessionExpired=true;f.h.render();await f.h.flush();await f.tick();assert.equal(f.requests.length,0);
  }finally{f.h.unmount();}
 });
 test(`${component}: authorized page load uses the full endpoint and bearer header without a 403`,async()=>{
  const f=fixture(component,{admin:true});try{
   await f.h.flush();assert.equal(f.requests.length,1);assert.ok(f.h.value);
   const request=f.requests[0];assert.ok(request.options.headers.get('Authorization').startsWith('Bearer '));
   assert.equal(request.url,component==='ComplianceUploads'?'/.netlify/functions/compliance-uploads?enrollment_type=all':'/api/paragon-residence?offset=0');
   if(component==='ComplianceUploads'){
    const select=f.nodes().find(node=>node.type==='select');select.props.onChange({target:{value:'test'}});await f.h.flush();assert.equal(f.requests.at(-1).url,'/.netlify/functions/compliance-uploads?enrollment_type=test');
   }
  }finally{f.h.unmount();}
 });
 test(`${component}: a server permission denial stops repeat requests until identity changes`,async()=>{
  const f=fixture(component,{admin:true,status:403});try{
   await f.h.flush();assert.equal(f.requests.length,1);assert.equal(f.h.value,null);
   await f.tick();await f.tick();assert.equal(f.requests.length,1);
   f.setStatus(200);f.auth.user={id:'other-admin'};f.setClaims({sub:'other-admin',public_metadata:{isAdmin:true}});f.h.render();await f.h.flush();assert.equal(f.requests.length,2);assert.ok(f.h.value);
   f.auth.user={id:'ordinary-agent'};f.setClaims({sub:'ordinary-agent',org_id:'org',org_role:'org:member'});f.h.render();assert.equal(f.h.value,null);await f.h.flush();await f.tick();assert.equal(f.requests.length,2);
  }finally{f.h.unmount();}
 });
}
test('review URLs cannot truncate the function name or inject filter text into its path',()=>{
 for(const enrollmentType of ['all','real','test']){
  const url=new URL(api.complianceUploadsUrl(enrollmentType),'https://app.test');assert.equal(url.pathname,'/.netlify/functions/compliance-uploads');assert.equal(url.searchParams.get('enrollment_type'),enrollmentType);
 }
 assert.throws(()=>api.complianceUploadsUrl('../.rollment_type=x'));
 assert.equal(api.paragonResidenceUrl(50),'/api/paragon-residence?offset=50');
});
test('admin requests refresh an expired bearer once and keep the complete URL',async()=>{
 const requests=[],tokenOptions=[];
 const send=async(url,options)=>{requests.push({url,authorization:options.headers.get('Authorization')});return Response.json({}, {status:requests.length===1?401:200});};
 const getToken=async options=>{tokenOptions.push(options);return options.skipCache?'fresh-token':'expired-token';};
 const response=await createClerkFetch(getToken,{send})(api.paragonResidenceUrl(0));assert.equal(response.status,200);
 assert.deepEqual(requests.map(row=>row.authorization),['Bearer expired-token','Bearer fresh-token']);assert.ok(requests.every(row=>row.url==='/api/paragon-residence?offset=0'));assert.equal(tokenOptions[1].skipCache,true);
});
