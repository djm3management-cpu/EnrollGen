const net = require('node:net');
const connect = net.Socket.prototype.connect;
const local = host => ['localhost','127.0.0.1','::1','[::1]'].includes(host);
net.Socket.prototype.connect = function (...args) {
 const options=Array.isArray(args[0])?args[0][0]:args[0];
 const host=typeof options==='object'?(options.host||'localhost'):(typeof args[1]==='string'?args[1]:'localhost');
 if(!local(host))throw new Error('Offline test guard: external network disabled');
 return connect.apply(this,args);
};
const fetch=globalThis.fetch;
globalThis.fetch = (...args) => {
 const url=new URL(typeof args[0]==='string'||args[0] instanceof URL?args[0]:args[0].url);
 if(!local(url.hostname))throw new Error('Offline test guard: external fetch disabled; inject a fixture');
 return fetch(...args);
};
