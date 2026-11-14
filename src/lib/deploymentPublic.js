// Vite replaces this server-side public projection with a literal virtual module.
import { publicDeploymentProfile, agencyPhone, staffedHoursLabel } from '../../telephony/src/lib/deploymentProfile.js';
export const deploymentPublic = publicDeploymentProfile();
export const agencyName = deploymentPublic.agencyName;
export const agencyLine = agencyPhone(deploymentPublic);
export const agencyHours = staffedHoursLabel(deploymentPublic);
