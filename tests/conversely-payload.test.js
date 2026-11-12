import assert from 'node:assert/strict';
import {test} from 'node:test';
import {converselyPayload} from '../integrations/complianceUploads.js';

const requiredKeys=[
  'CallID','CallType','RecordingPath','Target','ApplicantFirstName','ApplicantLastName',
  'ApplicantPhoneNumber','ApplicantState','ApplicantZip','AgentID','AgentName','CallDateTime',
  'EffectiveDate','PlanName','CarrierName','SubmissionDate','EnrollmentID','ContractYear',
  'ContractID','PlanID','SegmentID','Conversion','Billable',
];
const call={
  id:'call-1',call_type:'enrollment',call_start:'2026-11-03T23:59:59-05:00',
  agent_id:'agent-1',agent_name:'Agent',customer_first_name:'Jane',customer_last_name:'Doe',
  customer_phone:'(212) 555-0101',customer_state:'NY',zip_code:'10001',
  plan_name:'Plan',carrier_name:'Humana',effective_date:'2027-01-01',
  enrollment_confirmation_number:'ENR-1',plan_id:'7',
  metadata:{submission_date:'2026-11-05T23:30:00-05:00',contract_id:'H1234'},
};

test('Conversely record has every exact required key and normalized values',()=>{
  const payload=converselyPayload(call,'https://recording.test/audio.mp3');
  assert.deepEqual(Object.keys(payload).sort(),requiredKeys.sort());
  assert.equal(payload.CallType,'Medicare');
  assert.equal(payload.Target,'New Gen Health Solutions');
  assert.equal(payload.CallDateTime,'2026-11-04 04:59:59');
  assert.equal(payload.EffectiveDate,'2027-01-01');
  assert.equal(payload.SubmissionDate,'2026-11-06');
  assert.equal(payload.ContractYear,'2027');
  assert.equal(payload.PlanID,'007');
  assert.equal(payload.SegmentID,'0');
  assert.equal(payload.Conversion,'1');
  assert.equal(payload.Billable,'1');
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(payload.CallDateTime));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(payload.EffectiveDate));
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(payload.SubmissionDate));
});

test('optional keys appear only when present and keep their required types',()=>{
  const payload=converselyPayload({...call,call_duration_seconds:'42',call_outcome:'enrolled',lead_source:'Campaign'},
    'https://recording.test/audio.mp3',{email:'agent@example.test',pcpName:'Dr Test'});
  assert.equal(payload.AgentEmail,'agent@example.test');
  assert.equal(payload.CallDuration,42);
  assert.equal(payload.Disposition,'enrolled');
  assert.equal(payload.CampaignName,'Campaign');
  assert.equal(payload.PCPName,'Dr Test');
});

test('missing enrollment ID and invalid required dates stop submission',()=>{
  assert.throws(()=>converselyPayload({...call,enrollment_confirmation_number:''},'https://recording.test/audio.mp3'),/conversely_missing_enrollment_id/);
  assert.throws(()=>converselyPayload({...call,call_start:'not-a-date'},'https://recording.test/audio.mp3'),/conversely_invalid_call_datetime/);
  assert.throws(()=>converselyPayload({...call,metadata:{...call.metadata,submission_date:''}},'https://recording.test/audio.mp3'),/conversely_missing_submission_date/);
});
