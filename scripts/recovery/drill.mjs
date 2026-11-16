import './local-drill-env.js';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {freshDatabase,emptyLocalDatabase} from '../../tests/helpers/freshInstall.js';
import {freshInstallClient} from '../../tests/helpers/freshInstallClient.js';
import {profile,loadRecoveryDataset} from './dataset.js';
import {logicalBackup,logicalRestore,verifyRestore} from './logical.js';
import {recoveryAdminAction} from '../../telephony/src/lib/adminActions.js';
import {createLogger} from '../../telephony/src/lib/logger.js';
export async function runRecoveryDrill({writeEvidence=false}={}){
 const previous=process.env.DEPLOYMENT_PROFILE_JSON;process.env.DEPLOYMENT_PROFILE_JSON=JSON.stringify(profile);
 const started_at=new Date().toISOString(),start=performance.now(),id=randomUUID();let source,restored,result;
 try{
  source=await freshDatabase();await loadRecoveryDataset(source);
  const backup=await logicalBackup(source);restored=await emptyLocalDatabase();await logicalRestore(restored,backup);
  const verification=await verifyRestore(source,restored);
  result={id,started_at,finished_at:new Date().toISOString(),duration_ms:Math.round(performance.now()-start),backup_bytes:backup.length,...verification};
  await source.query('SET ROLE service_role');
  result.admin_action_id=await recoveryAdminAction(freshInstallClient(source),{action:'recovery_drill',target:id,count:verification.tables,success:verification.pass});
  result.admin_action_recorded=true;
 }catch{result={id,started_at,finished_at:new Date().toISOString(),duration_ms:Math.round(performance.now()-start),pass:false,checks:[{name:'drill_execution',pass:false}]};}
 finally{await source?.close();await restored?.close();if(previous===undefined)delete process.env.DEPLOYMENT_PROFILE_JSON;else process.env.DEPLOYMENT_PROFILE_JSON=previous;}
 result.finished_at=new Date().toISOString();result.duration_ms=Math.round(performance.now()-start);
 if(writeEvidence)writeFileSync(new URL(`../../docs/pilot-recovery-drill-${started_at.replace(/[:.]/g,'-')}.json`,import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 createLogger().info('recovery_completed',{success:result.pass,duration_ms:result.duration_ms,count:result.tables||0});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==2)process.exitCode=1;else if(!(await runRecoveryDrill({writeEvidence:true})).pass)process.exitCode=1;
}
