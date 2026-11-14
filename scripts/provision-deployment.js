import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {deploymentProfile} from '../telephony/src/lib/deploymentProfile.js';
import {validateRoster} from '../telephony/src/lib/deploymentRoster.js';
import {deploymentFeatures} from '../telephony/src/lib/deploymentFeatures.js';
export {provisionDeployment} from '../telephony/src/lib/deploymentProvisioning.js';
import {provisionDeployment} from '../telephony/src/lib/deploymentProvisioning.js';

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
 const [file,mode]=process.argv.slice(2);if(!file || !['--preview','--apply'].includes(mode))throw Error('Usage: node scripts/provision-deployment.js roster.json --preview|--apply');
 const rows=JSON.parse(await readFile(file,'utf8')),profile=deploymentProfile();validateRoster(rows,{ghl:deploymentFeatures().GHL_ENABLED});
 if(mode==='--preview')console.log(JSON.stringify({tenantId:profile.tenantId,active:rows.filter(a=>a.is_active).length,agents:rows.length}));
 else {const {createSupabaseClient,supabaseSecretKey}=await import('../integrations/supabase.js');await provisionDeployment(createSupabaseClient(process.env.SUPABASE_URL,supabaseSecretKey()),rows);console.log('Deployment roster provisioned');}
}
