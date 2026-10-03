import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTranscriptionHealth, transcriptionHealthError, transcriptionHealthForCall } from '../src/lib/transcriptionHealth.js';

test('browser tracks each speaker failure independently and preserves recovery coverage markers', () => {
  let state = updateTranscriptionHealth({}, { type:'transcription_error',speaker:'agent',message:'Agent disconnected',status:'reconnecting',coverageGap:true,gapSince:10 });
  state = updateTranscriptionHealth(state, { type:'transcription_error',speaker:'customer',message:'Customer disconnected',status:'unavailable' });
  assert.equal(transcriptionHealthError(state),'Customer disconnected Agent disconnected');
  state = updateTranscriptionHealth(state, { type:'transcription_health',speaker:'customer',status:'connected' });
  assert.equal(transcriptionHealthError(state),'Agent disconnected');
  state = updateTranscriptionHealth(state, { type:'transcription_health',speaker:'agent',status:'connected',coverageGap:true,gapUntil:20 });
  assert.equal(transcriptionHealthError(state),''); assert.equal(state.agent.gapSince,10); assert.equal(state.agent.gapUntil,20);
});

test('accepting a ringing call retains its early speaker failure and discards another call health', () => {
  let state = updateTranscriptionHealth({}, { type:'transcription_error',speaker:'agent',inboundCallId:'new-call',message:'Agent disconnected' });
  state = updateTranscriptionHealth(state, { type:'transcription_error',speaker:'customer',inboundCallId:'old-call',message:'Old call disconnected' });
  assert.equal(transcriptionHealthError(transcriptionHealthForCall(state,'new-call')),'Agent disconnected');
});
test('legacy customer failures are supported; transcript messages cannot clear another speaker failure', () => {
  const state = updateTranscriptionHealth({}, { type:'transcription_error',message:'Legacy customer failure' });
  assert.equal(transcriptionHealthError(state),'Legacy customer failure');
  assert.equal(updateTranscriptionHealth(state, { type:'transcript',speaker:'agent',text:'Speech' }),state);
  assert.equal(updateTranscriptionHealth(state, { type:'transcription_error',speaker:'spoofed' }),state);
  assert.equal(transcriptionHealthError(updateTranscriptionHealth(state, { type:'transcript',speaker:'customer',text:'Recovered speech' })), '');
});
