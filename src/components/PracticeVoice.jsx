import {useEffect,useRef,useState} from 'react';
import {useSpeechRecognition} from '../hooks/useSpeechRecognition';
// Mounted only by the enabled voice view. This feature has no audio transport.
export default function PracticeVoice({onText,reply,disabled}){
 const {stop,start,listening,supportsRecognition}=useSpeechRecognition({onNewFinal:onText}),[readAloud,setReadAloud]=useState(false),last=useRef(reply);
 useEffect(()=>{
  const changed=last.current!==reply;last.current=reply;
  if(changed&&readAloud&&reply?.speaker==='customer'&&window.speechSynthesis){
   stop();window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply.text));
  }
 },[reply,readAloud,stop]);
 useEffect(()=>{if(disabled)stop();},[disabled,stop]);
 useEffect(()=>{const stop=()=>{if(document.hidden){stop();window.speechSynthesis?.cancel();}};document.addEventListener('visibilitychange',stop);return()=>{document.removeEventListener('visibilitychange',stop);window.speechSynthesis?.cancel();};},[stop]);
 return <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
  <button type="button" className="contacts-mini-btn" disabled={disabled||!supportsRecognition} onClick={listening?stop:start}>{listening?'Stop microphone':'Speak'}</button>
  {window.speechSynthesis&&<label><input type="checkbox" checked={readAloud} onChange={e=>{setReadAloud(e.target.checked);if(!e.target.checked)window.speechSynthesis.cancel();}}/> Read replies</label>}
 </div>;
}
