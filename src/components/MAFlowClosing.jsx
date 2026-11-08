import {useState} from 'react';
import {useScript} from '../context/ScriptContext';
import {hasSubmittedMAApplication} from '../lib/maScriptFlow.js';
import {scriptIntakePrefill} from '../lib/enrollmentIntake.js';
import {getActiveSessionMetadata,waitForActiveSessionMetadata} from '../hooks/useSessionTracker';
import {MA_CLOSING} from '../data/maScript2027.js';
import {AGENCY_CLOSING} from '../data/agencyClosing.js';
import SectionWrapUp from './SectionWrapUp';
import EnrollmentIntake from './enrollment/EnrollmentIntake';

export default function MAFlowClosing({scriptBody}) {
  const {state,dispatch,activeSection}=useScript();
  const [callId,setCallId]=useState(null),[error,setError]=useState('');
  const submitted=hasSubmittedMAApplication(state);
  const open=async()=>{
    setError('');
    const metadata=getActiveSessionMetadata().callRecordId?getActiveSessionMetadata():await waitForActiveSessionMetadata();
    if(!metadata.callRecordId){setError('Call record is still syncing. Try again in a moment.');return;}
    setCallId(metadata.callRecordId);
  };
  if(!submitted && activeSection<8)return null;
  return <SectionWrapUp scriptBody={submitted ? scriptBody||MA_CLOSING : AGENCY_CLOSING}>
    {submitted&&<>
      <button type="button" className="secondary" onClick={open}>Complete Enrollment Intake (after call)</button>
      {error&&<p className="ops-error" role="alert">{error}</p>}
      {callId&&<EnrollmentIntake callId={callId} initialPrefill={scriptIntakePrefill(state)} onClose={()=>setCallId(null)} onSaved={()=>dispatch({type:'SET_GATE',field:'enrollOk',value:true})}/>}
    </>}
  </SectionWrapUp>;
}
