import {parseFeatureFlag} from '../../telephony/src/lib/featureFlags.js';
// Application extension of the shared strict parser. No phone-server changes.
export const reshopFeatures=(env={})=>({RESHOP_LIST_ENABLED:parseFeatureFlag(env.RESHOP_LIST_ENABLED,'RESHOP_LIST_ENABLED')});
export const RESHOP_REASONS=Object.freeze({
 terminated:'Plan terminated or not renewed',county_dropped:'County dropped from service area',
 crosswalked:'Plan consolidated or crosswalked',low_performing:'Successor flagged low performing',
 stars_below_3:'Successor star rating below 3.0',premium_increase:'Monthly premium increased',
 type_changed:'Plan type changed',renewing:'Renewing with no flagged change',
});
export const RESHOP_OUTCOMES=Object.freeze({kept_plan:'Kept plan',reshopped:'Re-shopped',could_not_reach:'Could not reach',asked_not_to_be_contacted:'Asked not to be contacted',no_longer_client:'No longer a client'});
export const RESHOP_GROUPS=Object.freeze({needs_review:'Needs a call',renewing:'Renewing',next_year_not_loaded:'Next year not loaded',not_covered:'Not covered by CMS data',cms_not_confirmed:'CMS transition not confirmed',effective_date_missing:'Effective date not recorded'});
export function permissionLabel(ptc={},today=new Date().toISOString().slice(0,10)){
 if(ptc.on_file!==true)return 'Permission not on file';
 if(!ptc.date||!ptc.expiry)return 'Permission date not recorded';
 if(ptc.date>today)return 'Permission not yet effective';
 return ptc.expiry<today?'Permission expired':'Permission on file';
}
