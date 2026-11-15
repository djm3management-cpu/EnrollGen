import {deploymentProfile} from './deploymentProfile.js';
export const MEDIA_LIMITS=Object.freeze({bytes:5*1024*1024,timeoutMs:10000});
export async function downloadMessageMedia(value,{headers={},transport=fetch,hosts=deploymentProfile().messageMediaHosts||['api.twilio.com'],limits=MEDIA_LIMITS}={}) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.hash||(url.port&&url.port!=='443')||!hosts.includes(url.hostname))throw Error('Media host forbidden');
 const controller=new AbortController();let reader;
 let timer;
 const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();void reader?.cancel();reject(Error('Media download timed out'));},limits.timeoutMs);});
 const read=async()=>{
  const response=await transport(url,{headers,redirect:'error',signal:controller.signal});
  if(!response.ok)throw Error('Media download failed');
  if(Number(response.headers.get('content-length'))>limits.bytes){await response.body?.cancel();throw Error('Media too large');}
  reader=response.body?.getReader();if(!reader)throw Error('Media body missing');
  const chunks=[];let bytes=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>limits.bytes)throw Error('Media too large');chunks.push(value);}
   return Buffer.concat(chunks,bytes);
  }catch(error){await reader.cancel();throw error;}finally{reader.releaseLock();}
 };
 try{return await Promise.race([read(),timeout]);}finally{clearTimeout(timer);controller.abort();}
}
