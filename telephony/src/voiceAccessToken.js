import twilio from 'twilio';
import {config} from './config.js';
// One issuer for both the normal phone and the restricted coach connection.
export function voiceAccessToken(identity,{incoming=true,ttl=3600,settings=config}={}) {
 const AccessToken=twilio.jwt.AccessToken;
 const token=new AccessToken(settings.twilioAccountSid,settings.twilioApiKeySid,settings.twilioApiKeySecret,{identity,ttl});
 token.addGrant(new AccessToken.VoiceGrant({incomingAllow:incoming,outgoingApplicationSid:settings.twilioTwimlAppSid}));
 return token.toJwt();
}
