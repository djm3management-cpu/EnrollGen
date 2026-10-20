import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {createCallContinuity,installCallNavigationGuard,createCallSafeClerkRouter} from '../src/lib/callContinuity.js';
import {createAuthRecovery,onAuthFailure,reportAuthFailure} from '../src/lib/authRecovery.js';
import {createClerkFetch} from '../src/lib/clerkFetch.js';
import {optionalCallDetailsPatch,OPTIONAL_CALL_FIELDS} from '../src/lib/callRecordDetails.js';
const strip=source=>source.replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,'').replace(/^export /gm,'');
const h=(type,props,...children)=>({type,props:props||{},children});

test('immediate call claims survive auth rerenders and only their own terminal event releases the protection',()=>{
 const state=createCallContinuity(),first={},second={},events=[];const stop=state.subscribe(()=>events.push(state.getSnapshot()));
 state.begin(first);state.replace(first,second);state.end(first);assert.equal(state.getSnapshot(),true);
 state.end(second);assert.equal(state.getSnapshot(),false);assert.deepEqual(events,[true,true,false]);stop();
});

test('401 refresh giving up reports failure without navigation, sign-out or mutation replay beyond one retry',async()=>{
 let failures=0,sends=0;const stop=onAuthFailure(()=>failures++);
 try{
  const fetch=createClerkFetch(async()=> 'valid-looking-token',{send:async()=>{sends++;return new Response('{}',{status:401});}});
  assert.equal((await fetch('/post',{method:'POST',body:'one mutation'})).status,401);assert.equal(sends,2);assert.equal(failures,1);
  await assert.rejects(createClerkFetch(async()=>{throw new Error('Refresh failed');})('/post'),/Refresh failed/);assert.equal(failures,2);
 }finally{stop();}
});

test('auth refresh failures back off, deduplicate, preserve a call, recover and cancel on unmount',async()=>{
 const timers=[],changes=[],state=createCallContinuity();let attempts=0,recovered=0;
 const call={};state.begin(call);
 const recovery=createAuthRecovery({getToken:async options=>{assert.equal(options.skipCache,true);if(++attempts<3)throw new Error('Temporary auth failure');return 'fresh';},
  onChange:value=>changes.push(value),onRecovered:()=>recovered++,schedule:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},cancel:timer=>{timer.cancelled=true;}});
 recovery.fail();recovery.fail();assert.equal(timers.length,1);assert.equal(timers[0].delay,1000);
 timers.shift().fn();await recovery.refresh();assert.equal(attempts,1);assert.equal(timers[0].delay,2000);assert.equal(state.getSnapshot(),true);
 timers.shift().fn();await recovery.refresh();assert.equal(attempts,2);assert.equal(timers[0].delay,4000);
 timers.shift().fn();await recovery.refresh();assert.equal(attempts,3);assert.equal(recovered,1);assert.equal(changes.at(-1),false);assert.equal(state.getSnapshot(),true);
 recovery.fail();assert.equal(timers[0].delay,1000);recovery.dispose();assert.equal(timers[0].cancelled,true);state.end(call);
});

function authFixture(){
 const hooks=hookHarness(),state=createCallContinuity(),user={id:'user-original'},organization={id:'org-original'};
 let auth={isLoaded:true,isSignedIn:true,userId:user.id,getToken:async()=> 'good'},currentUser=user,currentOrg=organization;
 let source=strip(readFileSync(new URL('../src/context/AuthContext.jsx',import.meta.url),'utf8'))
  .replace('import.meta.env.VITE_DISABLE_CLERK_AUTH === "true"','false')
  .replace("import('../lib/supabase')","Promise.resolve({refreshClerkSupabaseToken:async()=>{}})");
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',format:'cjs'}).code;
 const context=vm.createContext({...hooks.hooks,h,createContext:()=>({Provider:'auth-provider'}),useContext:()=>{},
  useAuth:()=>auth,useUser:()=>({user:currentUser,isLoaded:true}),useOrganization:()=>({organization:currentOrg,isLoaded:true}),
  callContinuity:state,installTokenRefresh:()=>()=>{},installCallNavigationGuard:()=>()=>{},createAuthRecovery,onAuthFailure,reportAuthFailure,window:{},document:{},
 });
 vm.runInContext(source+';globalThis.component=ClerkAuthBridge;',context);hooks.mount(()=>context.component({children:'workspace'}));
 return{hooks,state,expire(){auth={isLoaded:true,isSignedIn:false,userId:null,getToken:async()=>null};currentUser=null;currentOrg=null;hooks.render();},
  replaceUser(){auth={isLoaded:true,isSignedIn:true,userId:'other',getToken:async()=> 'other-token'};currentUser={id:'other'};currentOrg={id:'org-other'};hooks.render();},
  value:()=>hooks.value.props.value};
}

test('the real auth bridge freezes call identity after Clerk signs out, shows expiry and never returns an old JWT or another user token',async()=>{
 const fixture=authFixture();try{
  const call={};fixture.state.begin(call);await fixture.hooks.flush();const getter=fixture.value().getToken;
  fixture.expire();await fixture.hooks.flush();let value=fixture.value();
  assert.equal(value.callProtected,true);assert.equal(value.user.id,'user-original');assert.equal(value.organization.id,'org-original');assert.equal(value.identityLoaded,true);assert.equal(value.sessionExpired,true);
  await assert.rejects(value.getToken(),/Sign in to continue/);assert.equal(value.getToken,getter);
  fixture.replaceUser();await fixture.hooks.flush();value=fixture.value();assert.equal(value.user.id,'user-original');await assert.rejects(value.getToken(),/Session changed/);
  fixture.state.end(call);await fixture.hooks.flush();assert.equal(fixture.value().user.id,'other');assert.equal(await fixture.value().getToken(),'other-token');
 }finally{fixture.hooks.unmount();}
});

test('the actual App gate keeps the same authenticated provider tree and key while Clerk is signed out during a call',async()=>{
 const hooks=hookHarness(),state=createCallContinuity();let auth={isSignedIn:true,identityLoaded:true,callProtected:false,user:{id:'agent'}};
 let source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');source=source.slice(source.indexOf('export default function App()')).replace('export default function','function');
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',format:'cjs'}).code;
 const context=vm.createContext({...hooks.hooks,h,useAppAuth:()=>auth,callContinuity:state,LOGIN_DISABLED:false,
  AuthenticatedProviders:'providers',AuthenticatedAppContent:'workspace',SignIn:'sign-in',Suspense:'suspense',LandingPage:'landing',clerkTerminalAppearance:{},
  window:{location:{pathname:'/script/ma'},addEventListener(){},removeEventListener(){},history:{replaceState(){}}},
 });
 vm.runInContext(source+';globalThis.component=App;',context);hooks.mount(()=>context.component());
 try{
  assert.equal(hooks.value.type,'providers');const key=hooks.value.props.key;
  auth={...auth,isSignedIn:false,callProtected:true};hooks.render();assert.equal(hooks.value.type,'providers');assert.equal(hooks.value.props.key,key);
  auth={...auth,callProtected:false,user:null};hooks.render();assert.equal(hooks.value.type,'div');assert.equal(hooks.value.children[0].type,'sign-in');
 }finally{hooks.unmount();}
});

test('navigation guard blocks live-call links/reloads and cleans up without navigating or signing out',()=>{
 const win=new EventTarget(),doc=new EventTarget();let active=true;
 const stop=installCallNavigationGuard({host:win,documentTarget:doc,isActive:()=>active});
 const navigations=[];const router=createCallSafeClerkRouter({location:{assign:to=>navigations.push(['push',to]),replace:to=>navigations.push(['replace',to])}},()=>active);
 router.routerPush('/');router.routerReplace('/login');assert.equal(navigations.length,0);
 let event=new Event('beforeunload',{cancelable:true});win.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 event=new Event('click',{cancelable:true});Object.defineProperty(event,'target',{value:{closest:()=>({hasAttribute:()=>false,target:''})}});doc.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
 active=false;router.routerPush('/dashboard');router.routerReplace('/login');assert.deepEqual(navigations,[['push','/dashboard'],['replace','/login']]);event=new Event('beforeunload',{cancelable:true});win.dispatchEvent(event);assert.equal(event.defaultPrevented,false);stop();
});

test('closing has no required form or secondary save; optional later edits accept blank values and ignore protected fields',()=>{
 let source=strip(readFileSync(new URL('../src/components/SectionWrapUp.jsx',import.meta.url),'utf8')).replace('default React.memo','React.memo');
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',format:'cjs'}).code;
 const context=vm.createContext({h,React:{memo:fn=>{context.component=fn;return fn;}},ScriptBox:'script',MA_CLOSING:'Closing script'});
 vm.runInContext(source,context);const tree=context.component({});
 const nodes=[];const walk=node=>{if(!node||typeof node!=='object')return;nodes.push(node);node.children?.flat(Infinity).forEach(walk);};walk(tree);
 assert.ok(!nodes.some(node=>['input','select','textarea','button','form'].includes(node.type)));
 assert.deepEqual(optionalCallDetailsPatch({agent_notes:'',customer_first_name:null,call_outcome:'enrolled',agent_id:'other'}),{agent_notes:null,customer_first_name:null});
 assert.equal(Object.keys(optionalCallDetailsPatch({})).length,0);assert.ok(OPTIONAL_CALL_FIELDS.some(([key])=>key==='customer_mbi'));
 assert.throws(()=>optionalCallDetailsPatch({effective_date:'invalid'}),/valid effective date/);
});

test('tenant/organization refresh cannot replace the ready workspace while a call is protected',()=>{
 const hooks=hookHarness();let auth={user:{id:'agent'},organization:{id:'org'},organizationLoaded:true,callProtected:false},tenant={tenant:{id:'tenant'},loading:false};
 let source=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');source=source.slice(source.indexOf('function AuthenticatedAppContent()'),source.indexOf('function AuthenticatedProviders'));
 source=transformSync(source,{loader:'jsx',jsxFactory:'h',format:'cjs'}).code;
 const context=vm.createContext({...hooks.hooks,h,useAppAuth:()=>auth,useTenantConfig:()=>tenant,AppContent:'workspace',TenantAutoBootstrap:'bootstrap',LazyPanel:'panel',Onboarding:'onboarding'});
 vm.runInContext(source+';globalThis.component=AuthenticatedAppContent;',context);hooks.mount(()=>context.component());
 try{assert.equal(hooks.value.type,'workspace');auth={...auth,callProtected:true,organizationLoaded:false};tenant={tenant:null,loading:true};hooks.render();assert.equal(hooks.value.type,'workspace');}
 finally{hooks.unmount();}
});
