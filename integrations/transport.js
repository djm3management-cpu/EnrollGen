import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

export const signature = (body, secret) => 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
export function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
      (a===169 && b===254) || (a===172 && b>=16 && b<=31) || (a===192 && [0,168].includes(b)) ||
      (a===198 && [18,19,51].includes(b)) || (a===203 && b===0));
  }
  // Only global unicast IPv6; reject mapped IPv4, loopback, link-local and ULA.
  return net.isIP(address)===6 && /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:db8:/i.test(address);
}
export function validateUrl(value) {
  const url = new URL(value);
  if (url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || url.hash) throw Error('HTTPS public endpoint required');
  return url;
}
export async function postJson(urlString, body, headers = {}) {
  const url = validateUrl(urlString);
  const hostname = url.hostname.replace(/^\[|\]$/g,'');
  let dnsTimer;
  const addresses = await Promise.race([
    lookup(hostname,{all:true}),
    new Promise((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('DNS timeout')),5000);}),
  ]).finally(()=>clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some(a=>!publicAddress(a.address))) throw Error('Non-public destination');
  const address = addresses[0];
  // Pin the vetted DNS address for this connection; redirects are never followed.
  return new Promise((resolve,reject)=>{
    const req = https.request(url, { method:'POST', agent:false,
      lookup:(_host,options,callback)=>options.all ? callback(null,[address]) : callback(null,address.address,address.family),
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),...headers},
    },res=>{
      res.resume();
      resolve({status:res.statusCode});
    });
    const timer=setTimeout(()=>req.destroy(Error('Delivery timeout')),10000);
    req.on('close',()=>clearTimeout(timer));req.on('error',reject);req.end(body);
  });
}
