import {serverRequest} from '../../telephony/src/lib/adminActions.js';
export {provisionDeployment as seedNewTenant} from '../../telephony/src/lib/deploymentProvisioning.js';
import {json} from './_tenantSettings.js';
// Provisioning requires the server-only operator command, never a browser payload.
export default serverRequest('seed-new-tenant',async () => json(410,{error:'Use the server operator deployment provisioning command.'}));
export const config={path:'/api/seed-new-tenant'};
