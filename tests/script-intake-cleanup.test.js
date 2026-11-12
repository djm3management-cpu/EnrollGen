import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {hookHarness} from './helpers/hookHarness.js';
import {scriptIntakePrefill,mergeIntakePrefill,ghlPayload,emptyIntake,PLAN_TYPES,INTAKE_FIELDS} from '../src/lib/enrollmentIntake.js';
import {ENROLLMENT_CLOSING,ENROLLMENT_CLOSING_TEMPLATE} from '../src/data/enrollmentClosing.js';
import {AGENCY_LINE_NUMBER,formatAgencyPhone} from '../src/lib/agencyLine.js';
import {MA_CLOSING} from '../src/data/maScript2027.js';
const read=file=>readFileSync(new URL(`../${file}`,import.meta.url),'utf8');
const compile=file=>transformSync(read(file).replace(/^import[\s\S]*?;\n/gm,'').replace('export default React.memo(function ScriptSection','const ScriptSection=React.memo(function ScriptSection').replace('export default React.memo(function SectionWrapUp','const SectionWrapUp=React.memo(function SectionWrapUp').replace('export default function','function'),{loader:'jsx',jsxFactory:'element',format:'cjs'}).code;
const walk=node=>!node||typeof node!=='object'?[]:[node,...(node.children||[]).flat(Infinity).flatMap(walk)];
const element=(type,props,...children)=>({type,props:props||{},children});
const text=node=>(node?.children||[]).flat(Infinity).filter(c=>typeof c==='string').join('');
test('step 7 opens the existing intake for this call with known values and chosen plan type; no duplicate fields or manual completion button',async()=>{
 const h=hookHarness(),actions=[];
 const state={sobOk:true,agentName:'Mike Shiomos',maAnswers:{'enrollment/0/2:selectedSnp':'dsnp'},notes:{customerFirstName:'Jane',customerLastName:'Doe',customerPhone:'2125550101',customerState:'NY',customerZip:'10001',planName:'Previously captured',enrollmentCode:'OLD-APP'}};
 const code=compile('src/components/ScriptSection.jsx');
 const context={...h.hooks,React:{memo:x=>x},element,EnrollmentIntake:'intake',scriptIntakePrefill,getActiveSessionMetadata:()=>({callRecordId:'current-call'}),waitForActiveSessionMetadata:async()=>({}),useScript:()=>({state,dispatch:action=>actions.push(action),activeSection:7,unlocked:{s7:true}}),getMAScriptView:()=>({items:[],complete:true}),MAScriptBranches:'branches',SectionToast:'toast',SectionAdvanceButton:'advance',LockText:'lock',ScriptBox:'box',ShieldCheck:'shield'};
 const {extras,section}=vm.runInNewContext(code+';({extras:EnrollmentExtras,section:ScriptSection})',context);
 h.mount(()=>extras({state,dispatch:action=>actions.push(action),disabled:false}));
 assert.equal(walk(h.value).filter(n=>n.type==='input').length,0);
 assert.ok(walk(h.value).some(n=>text(n)==='No Enrollment - Wrap Up'));
 await walk(h.value).find(n=>text(n)==='Complete Enrollment Intake').props.onClick();await h.flush();
 const intake=walk(h.value).find(n=>n.type==='intake');assert.equal(intake.props.callId,'current-call');
 assert.deepEqual({...intake.props.initialPrefill},scriptIntakePrefill(state));assert.equal(intake.props.initialPrefill.planType,'D-SNP');
 intake.props.onSaved();assert.equal(actions[0].field,'enrollOk');assert.equal(actions[0].value,true);
 assert.ok(!read('src/components/ScriptSection.jsx').includes('Plan name not entered'));
 h.unmount();
 const s=hookHarness();Object.assign(context,s.hooks);s.mount(()=>section({section:{key:'enrollment',section_number:7,gate_field:'enrollOk',nodes:[]}}));assert.ok(!walk(s.value).some(n=>n.type==='advance'));s.unmount();
});
test('all plan types normalize, remain editable, and reach GHL along with ZIP',()=>{
 for(const planType of PLAN_TYPES){
  const d=mergeIntakePrefill({...emptyIntake('Mike Shiomos'),firstName:'Server contact',phone:'2125550101',state:'NY',zip:'10001'},{planType,firstName:'Old note'});
  assert.equal(d.firstName,'Server contact');assert.equal(d.planType,planType);assert.equal(ghlPayload(d,'now').planType,planType);assert.equal(ghlPayload(d,'now').zip,'10001');
 }
 assert.ok(INTAKE_FIELDS.some(([key,,type])=>key==='planType'&&type==='planType'));
});
test('enrollment closing is exactly the requested text using only the dialer main DID',()=>{
 const expected="Congratulations, you're all set! Thank you for trusting us with your coverage today. From this point forward, I'm your agent, and New Gen Health Solutions is your agency. If you ever have a question about your plan, a bill, a doctor, or a prescription, call us first at {AGENCY_PHONE} and we'll take care of it.\n\nOne important thing before we hang up. After enrolling, a lot of people start getting calls from other agencies claiming to be from Medicare, your insurance company, or 'your plan.' Please don't give those callers any information. We've seen people switched into plans they never agreed to, and it can take months to undo. Medicare and your insurance company will never cold call you asking for your Medicare number, Social Security number, or banking information.\n\nIf anyone calls about changing your plan, just hang up and call us. If you ever want to review or change your coverage, we're happy to do that with you anytime. Thanks again, and welcome to the family!";
 assert.equal(ENROLLMENT_CLOSING_TEMPLATE,expected);assert.equal(MA_CLOSING,expected.replace('{AGENCY_PHONE}',formatAgencyPhone(AGENCY_LINE_NUMBER)));
 assert.ok(read('src/components/phone/DialerPanel.jsx').includes("from '../../lib/agencyLine.js'"));
 const code=compile('src/components/SectionWrapUp.jsx').replace('export default React.memo(', 'const SectionWrapUp=React.memo(');
 const component=vm.runInNewContext(code+';SectionWrapUp',{React:{memo:x=>x},element,ScriptBox:'box',MA_CLOSING});
 const rendered=walk(component({agentPhone:'(212) 555-9999',directNumber:'(312) 555-0100'})).find(n=>n.type==='box');
 assert.equal(text(rendered),MA_CLOSING);assert.ok(!text(rendered).includes('555-9999'));assert.match(text(rendered),/\(609\) 806-5996/);
});
test('both record views show the shared read-only enrollment summary with Edit targeting the selected intake',async()=>{
 assert.ok(read('src/components/callLog/CallLogTab.jsx').includes('<EnrollmentSummary callId={row.call_record_id}/>'));
 assert.ok(read('src/components/contacts/ContactsTab.jsx').includes('contactId={contact.id}'));
 const h=hookHarness();const getToken=()=>'';
 const component=vm.runInNewContext(compile('src/components/enrollment/EnrollmentSummary.jsx')+';EnrollmentSummary',{...h.hooks,element,encodeURIComponent,INTAKE_FIELDS,useAppAuth:()=>({getToken}),EnrollmentIntake:'intake',fetchWithClerk:async()=>Response.json({intakes:[{id:'intake-2',call_id:'call-2',completed_at:'today',data:{planName:'Saved plan',planType:'C-SNP'}}]})});
 h.mount(()=>component({contactId:'contact'}));await h.flush();assert.equal(walk(h.value).filter(n=>['input','select'].includes(n.type)).length,0);
 assert.ok(walk(h.value).some(n=>text(n)==='Saved plan'));
 walk(h.value).find(n=>text(n)==='Edit').props.onClick();await h.flush();const intake=walk(h.value).find(n=>n.type==='intake');assert.equal(intake.props.intakeId,'intake-2');assert.equal(intake.props.callId,'call-2');h.unmount();
});
