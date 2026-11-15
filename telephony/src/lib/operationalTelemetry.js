import {setLogObserver,createLogger} from './logger.js';
const logger=createLogger('integrations');
let pending=new Set();
let connectedDb;
export function installOperationalTelemetry(db){
 connectedDb=db;
 setLogObserver(row=>{
  if(row.event==='telemetry_write_failed')return;
  if(row.category!=='security'&&row.level!=='error'&&!/lease|routing|overflow|presence|provider_(?:request|result)/.test(row.event))return;
  if(pending.size>=1000)return;
  const task=Promise.resolve().then(()=>{const request=db.rpc('record_operational_event',{p_event:row.event,p_level:row.level,p_subject:row.subject||null,p_status:Number.isInteger(row.status)?row.status:null});return typeof request.abortSignal==='function'?request.abortSignal(AbortSignal.timeout(3000)):request;}).then(r=>{if(r.error)throw Error();}).catch(()=>logger.error('telemetry_write_failed')).finally(()=>pending.delete(task));
  pending.add(task);
 });
}
export async function flushOperationalTelemetry(){await Promise.allSettled([...pending]);}
export async function scheduledSuccess(db,job){const {error}=await db.rpc('record_scheduled_success',{p_job:job});if(error)throw Error('Scheduled status write failed');}

export async function scheduledRequestSuccess(job){if(connectedDb)await scheduledSuccess(connectedDb,job);}
