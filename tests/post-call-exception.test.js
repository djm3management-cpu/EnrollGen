import test from 'node:test';
import assert from 'node:assert/strict';
import {postCallExceptionDetails} from '../netlify/lib/postCallException.js';

test('checkpoint diagnostics preserve full message, non-enumerable stack, storage details and nested transport cause',()=>{
 const cause=Object.assign(new Error('Connection terminated unexpectedly'),{code:'ECONNRESET',syscall:'read'});
 const error=Object.assign(new Error('Transcript storage update failed',{cause}),{
  code:'57014',status:503,details:'Statement canceled while updating call_transcripts',hint:'Check database statement timeout',table:'call_transcripts',
 });
 const result=postCallExceptionDetails(error);
 assert.equal(result.message,error.message);assert.equal(result.stack,error.stack);
 assert.equal(result.details,error.details);assert.equal(result.hint,error.hint);assert.equal(result.code,'57014');
 assert.equal(result.cause.message,cause.message);assert.equal(result.cause.stack,cause.stack);assert.equal(result.cause.syscall,'read');
});
test('plain PostgREST/storage exceptions retain diagnostics while credentials, identifiers and failing-row payloads are redacted',()=>{
 const error={message:'Storage request failed',statusCode:503,error:'ServiceUnavailable',details:'Failing row contains (private transcript, beneficiary name).',hint:'Contact admin at private@example.com',cause:new Error('Bearer secret-value sk-secret-value')};
 const result=postCallExceptionDetails(error),serialized=JSON.stringify(result);
 assert.equal(result.statusCode,503);assert.equal(result.error,'ServiceUnavailable');
 assert.equal(result.details,'Failing row contains [ROW_REDACTED]');
 assert.doesNotMatch(serialized,/private transcript|beneficiary name|private@example.com|secret-value/);
 error.cause.cause=error;
 assert.equal(postCallExceptionDetails(error).cause.cause,'[CIRCULAR]');
});

test('actual checkpoint failure emits the exception with session/action and keeps diagnostics out of the agent response',async()=>{
 const {createPostCallHandler}=await import('../netlify/lib/postCallWork.js');
 const error=Object.assign(new Error('Storage connection failed'),{code:'08006',details:'Database connection terminated',hint:'Inspect pool health'});
 const original=console.error,logs=[];console.error=value=>logs.push(JSON.parse(value));
 try {
  const handler=createPostCallHandler({authenticate:async()=>({userId:'fixture'}),getDb:()=>{throw error;}});
  const response=await handler(new Request('https://app.test/api/post-call',{method:'POST',body:JSON.stringify({action:'checkpoint',session_id:'fixture-session'})}));
  assert.equal(response.status,503);
  assert.equal(logs[0].event,'post_call_storage_error');assert.equal(logs[0].action,'checkpoint');assert.equal(logs[0].session_id,'fixture-session');
  assert.equal(logs[0].exception.stack,error.stack);assert.equal(logs[0].exception.details,error.details);
  assert.doesNotMatch(await response.text(),/Storage connection failed|pool health|08006/);
 }finally{console.error=original;}
});
