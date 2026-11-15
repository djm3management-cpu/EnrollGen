import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import express from 'express';
import {installSecurityHeaders} from '../src/lib/securityHeaders.js';
test('actual telephony middleware covers normal, token, denied, preflight and parser-error responses',async()=>{
  const app=express();installSecurityHeaders(app);app.use(express.json());
  app.get('/healthz',(_req,res)=>res.json({ok:true}));
  app.post('/token',(_req,res)=>res.json({token:'synthetic-only'}));
  app.get('/denied',(_req,res)=>res.status(403).json({error:'Forbidden'}));
  app.options('/token',(_req,res)=>res.status(204).end());
  app.use((error,_req,res,next)=>{void next;res.status(error.status||500).end();});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  try {
    for(const [url,options,status] of [['/healthz',{},200],['/token',{method:'POST'},200],['/denied',{},403],['/token',{method:'OPTIONS'},204],['/token',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'},400],['/absent',{},404]]){
      const response=await fetch(`http://127.0.0.1:${server.address().port}${url}`,options);assert.equal(response.status,status);
      assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000; includeSubDomains');
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
      assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('pragma'),'no-cache');
      assert.equal(response.headers.get('x-powered-by'),null);await response.arrayBuffer();
    }
  } finally {await new Promise(resolve=>server.close(resolve));}
});
test('server installs the shared header middleware before CORS and body parsing',()=>{
  const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('installSecurityHeaders(app)')<source.indexOf('app.use('));
});
