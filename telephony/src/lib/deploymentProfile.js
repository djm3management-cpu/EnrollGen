import {validateAlerting} from './alertPolicy.js';
import {securityEvent} from './logger.js';
import { validateRetention } from './retentionPolicy.js';
// Server-held, per-deployment configuration. This file ships in every service.
import { deploymentFeatures, serverFeatureEnvironment } from './deploymentFeatures.js';
const fail = key => { securityEvent(key==='destination host'||key==='destination URL'?'destination_rejected':'configuration_failed'); throw new Error(`Invalid deployment profile: ${key}`); };
const text = (value, key) => typeof value === 'string' && value.trim() && value.length <= 500 && !Array.from(value).some(c=>c.charCodeAt(0)<32) ? value.trim() : fail(key);
const list = (value, key) => Array.isArray(value) && value.length && value.every(v => typeof v === 'string' && v.trim()) ? [...new Set(value.map(v => text(v,key)))] : fail(key);
const email = (value,key) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(text(value,key)) ? value : fail(key);
const emails = (value,key) => list(value,key).map(v=>email(v,key));
export function validateDestination(value, allowedHosts) {
  let url; try { url = new URL(value); } catch { fail('destination URL'); }
  const host = url.hostname.toLowerCase();
  // No IP literals, alternate numeric encodings, local suffixes or single labels.
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443') ||
      !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|localdomain|intranet)$/.test(host) || host==='home.arpa' || host.endsWith('.home.arpa') || !allowedHosts?.includes(host)) fail('destination host');
  return url.toString();
}
export function parseDeploymentProfile(raw, features = deploymentFeatures()) {
  let p; try { p = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw); } catch { fail('DEPLOYMENT_PROFILE_JSON'); }
  if (!p || typeof p !== 'object' || Array.isArray(p)) fail('DEPLOYMENT_PROFILE_JSON required');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.tenantId || '')) fail('tenantId');
  for (const key of ['organizationId','agencyName','documentName','agencyLineLabel']) p[key] = text(p[key],key);
  if (!/^org_[a-zA-Z0-9]+$/.test(p.organizationId)) fail('organizationId');
  p.agencyAliases = list(p.agencyAliases,'agencyAliases');
  for (const key of ['agencyLine','textSender']) if (!/^\+[1-9]\d{7,14}$/.test(p[key] || '')) fail(key);
  if (!['national','international'].includes(p.phoneDisplay)) fail('phoneDisplay');
  try { new Intl.DateTimeFormat('en-US',{timeZone:text(p.timezone,'timezone')}).format(); } catch { fail('timezone'); }
  if (!p.timezone.includes('/')) fail('timezone (IANA name required)');
  if (!p.staffedHours || Object.keys(p.staffedHours).sort().join(',') !== 'fri,mon,sat,sun,thu,tue,wed') fail('staffedHours');
  for (const day of Object.values(p.staffedHours)) {
    if (!day || typeof day.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.start || '') ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(day.end || '') || day.start >= day.end) fail('staffedHours day');
  }
  if (!Object.values(p.staffedHours).some(day=>day.enabled)) fail('staffedHours open day');
  // Closing/legal text is code-owned; operators configure identity and hours only.
  p.allowedHosts = list(p.allowedHosts,'allowedHosts').map(host=>{
    validateDestination(`https://${host}/`,[host]); return host;
  });
  for (const key of ['appOrigin','telephonyOrigin']) {p[key]=validateDestination(p[key],p.allowedHosts);const origin=new URL(p[key]);if(origin.pathname!=='/'||origin.search)fail(key);}
  if (p.logoUrl) p.logoUrl = validateDestination(p.logoUrl,p.allowedHosts);
  if (p.primaryColor && !/^#[a-f0-9]{6}$/i.test(p.primaryColor)) fail('primaryColor');
  const required = (feature, section, fields) => {
    if (!features[feature]) return;
    if (!p[section] || typeof p[section] !== 'object') fail(section);
    for (const key of fields) p[section][key] = text(p[section][key],`${section}.${key}`);
  };
  required('GHL_ENABLED','ghl',['postCallUrl','enrollmentUrl','locationId']);
  required('CONVERSELY_UPLOAD_ENABLED','conversely',['target','endpoint']);
  required('IX_UPLOAD_ENABLED','ix',['teamName','environment','origin']);
  required('OPERATIONAL_EMAIL_ENABLED','email',['from','replyTo','endpoint']);
  required('PARAGON_ENABLED','paragon',['sourceName','pushUrl','postbackUrl','pushSecret','postbackSecret','pingKeyHash','availabilityKeyHash','reportTokenHash','capMode']);
  if (features.IX_UPLOAD_ENABLED && !['test','production'].includes(p.ix.environment)) fail('ix.environment');
  if (features.OPERATIONAL_EMAIL_ENABLED) {
    email(p.email.from,'email.from'); email(p.email.replyTo,'email.replyTo');
    p.email.recipients = emails(p.email.recipients,'email.recipients');
  }
  if (features.IX_REPORT_ENABLED && features.IX_UPLOAD_ENABLED && features.OPERATIONAL_EMAIL_ENABLED) p.ix.reportRecipients = emails(p.ix.reportRecipients,'ix.reportRecipients');
  for (const [flag,section,keys] of [
    ['GHL_ENABLED','ghl',['postCallUrl','enrollmentUrl']], ['CONVERSELY_UPLOAD_ENABLED','conversely',['endpoint']],
    ['IX_UPLOAD_ENABLED','ix',['origin']], ['OPERATIONAL_EMAIL_ENABLED','email',['endpoint']], ['PARAGON_ENABLED','paragon',['pushUrl','postbackUrl']],
  ]) if (features[flag]) for (const key of keys) p[section][key] = validateDestination(p[section][key],p.allowedHosts);
  if (features.PARAGON_ENABLED) {
    if (!Number.isFinite(p.paragon.rate) || p.paragon.rate <= 0 || (p.paragon.dailyCap!==null && (!Number.isInteger(p.paragon.dailyCap) || p.paragon.dailyCap < 1))) fail('paragon rate/dailyCap');
    if(!['soft','hard'].includes(p.paragon.capMode)||p.paragon.pushSecret.length<32||p.paragon.postbackSecret.length<32)fail('paragon contract settings');
    for(const key of ['pingKeyHash','availabilityKeyHash','reportTokenHash'])if(!/^[a-f0-9]{64}$/.test(p.paragon[key]))fail(`paragon.${key}`);
    for(const key of ['requiredCarriers','criticalCarriers'])p.paragon[key]=list(p.paragon[key],`paragon.${key}`);
    const carrierKeys=['aetna','humana','uhc','wellcare','devoted','healthspring'];
    if([...p.paragon.requiredCarriers,...p.paragon.criticalCarriers].some(key=>!carrierKeys.includes(key))||p.paragon.criticalCarriers.some(key=>!p.paragon.requiredCarriers.includes(key))||p.paragon.eligibility?.some(row=>!Array.isArray(row.carriers)||row.carriers.some(key=>!carrierKeys.includes(key))))fail('paragon carrier keys');
    if(!Number.isInteger(p.paragon.planYear)||p.paragon.planYear<2027||!Number.isInteger(p.paragon.reservationTtlSeconds)||p.paragon.reservationTtlSeconds<5||p.paragon.reservationTtlSeconds>120)fail('paragon routing settings');
    if(!Array.isArray(p.paragon.eligibility)||p.paragon.eligibility.some(row=>!row.agentId||!/^([A-Z]{2})$/.test(row.state)||!Array.isArray(row.carriers)))fail('paragon.eligibility');
    p.paragon.states = list(p.paragon.states,'paragon.states');
    if (p.paragon.states.some(s=> !/^[A-Z]{2}$/.test(s))) fail('paragon.states');
    if (features.OPERATIONAL_EMAIL_ENABLED) p.paragon.reportRecipients = emails(p.paragon.reportRecipients,'paragon.reportRecipients');
  }
  // Auth defaults are exact deployment origins and a deployment-specific audience.
  p.browserOrigins = p.browserOrigins ? list(p.browserOrigins,'browserOrigins') : [new URL(p.appOrigin).origin];
  p.authorizedParties = p.authorizedParties ? list(p.authorizedParties,'authorizedParties') : [...p.browserOrigins];
  for(const origin of [...p.browserOrigins,...p.authorizedParties]) {
    const u=new URL(validateDestination(origin,p.allowedHosts));
    if(u.origin!==origin)fail('auth origin must be an exact origin');
  }
  p.tokenAudiences = p.tokenAudiences ? list(p.tokenAudiences,'tokenAudiences') : [p.organizationId];
  if(p.messageMediaHosts)p.messageMediaHosts=list(p.messageMediaHosts,'messageMediaHosts').map(h=>{validateDestination(`https://${h}/`,[h]);return h;});
  if(p.admissionLimits) {
    const keys=['clientRecap','coachingRegenerate','lifecycleExport','vendorLead','vendorPing','availability','voiceToken','agentSocket','sms','gifs','coach','transcription','sttStream','scoring','summary','embeddings'];
    for(const [route,limits] of Object.entries(p.admissionLimits)) {
      if(!keys.includes(route)||!limits||typeof limits!=='object'||Array.isArray(limits))fail('admissionLimits');
      for(const [key,value] of Object.entries(limits))if(!['minute','subjectDay','deploymentDay','concurrent'].includes(key)||!Number.isInteger(value)||value<1||value>1000000)fail('admissionLimits value');
    }
  }
  try{p.alerting=validateAlerting(p.alerting,validateDestination,p.allowedHosts);}catch{fail('alerting');}
  p.retention = validateRetention(p.retention);
  return deepFreeze(p);
}
function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
export function deploymentProfile(env) {
 const configured=env ?? globalThis.process?.env ?? {...serverFeatureEnvironment(),DEPLOYMENT_PROFILE_JSON:globalThis.Deno?.env.get('DEPLOYMENT_PROFILE_JSON')};
 return parseDeploymentProfile(configured.DEPLOYMENT_PROFILE_JSON,deploymentFeatures(configured));
}
export function publicDeploymentProfile(p = deploymentProfile()) {
  return deepFreeze({...Object.fromEntries(['tenantId','organizationId','agencyName','agencyAliases','documentName','logoUrl','primaryColor','agencyLine','agencyLineLabel','phoneDisplay','staffedHours','timezone','telephonyOrigin'].map(key=>[key,p[key]])),agencyClosing:agencyClosing(p)});
}
export function agencyPhone(p) {
  const digits=p.agencyLine.slice(1);
  return p.phoneDisplay==='national' && /^1\d{10}$/.test(digits) ? `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}` : p.agencyLine;
}
export function staffedHoursLabel(p) {
  const names={mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'};
  const time=s=>{const [h,m]=s.split(':').map(Number);return `${h%12||12}${m?`:${String(m).padStart(2,'0')}`:''} ${h<12?'AM':'PM'}`;};
  const groups=[];
  for (const key of Object.keys(names)) {
    const d=p.staffedHours[key]; if (!d.enabled) continue;
    const previous=groups.at(-1);
    if (previous && previous.end===d.end && previous.start===d.start && previous.index===Object.keys(names).indexOf(key)-1) {previous.last=key;previous.index++;}
    else groups.push({...d,first:key,last:key,index:Object.keys(names).indexOf(key)});
  }
  return groups.map(g=>`${names[g.first]}${g.first!==g.last?` through ${names[g.last]}`:''}, ${time(g.start)} to ${time(g.end)}`).join('; ') + ` (${p.timezone})`;
}
export function localDate(now, timezone) { return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
export function isStaffed(now,p) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:p.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(v=>[v.type,v.value]));
  const day=p.staffedHours[parts.weekday.toLowerCase()],t=`${parts.hour}:${parts.minute}`;
  return Boolean(day?.enabled && t>=day.start && t<day.end);
}

export function agencyClosing(p) {
 return `Thank you for calling ${p.agencyName}. If you're ever interested, we'd be happy to set up a separate time to review other coverage options with you. You can reach us at ${agencyPhone(p)}, ${staffedHoursLabel(p)}. Have a great day!`;
}
