// Synthetic acceptance must never reach a hosted database or real processor.
import net from 'node:net';
const local=host=>!host || ['localhost','127.0.0.1','::1','[::1]'].includes(host);
const originalConnect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
 const first=args[0];
 const opts=Array.isArray(first)?first[0]:first;
 const host=typeof opts==='object'?opts?.host:typeof args[1]==='string'?args[1]:undefined;
 const socketPath=typeof opts==='object'?opts?.path:typeof opts==='string' && !/^\d+$/.test(opts)?opts:undefined;
 if(!socketPath && !local(host))throw Error('External network forbidden in synthetic tests');
 return originalConnect.apply(this,args);
};
const send=globalThis.fetch;
globalThis.fetch=(input,init)=>{
 const url=new URL(input instanceof Request?input.url:input);
 if(!local(url.hostname))throw Error('External fetch forbidden in synthetic tests');
 return send(input,init);
};
