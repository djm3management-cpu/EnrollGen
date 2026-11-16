// Live conference transcription uses isolated inbound tracks. Recordings can
// contain the coach in the agent's outbound track and must never be fed back
// through diarization, gap recovery, scoring or post-call coaching as speech.
export function assertWhisperRecordingSafe(call) {
 if(call?.metadata?.supervisor_whisper===true)throw Object.assign(new Error('Whisper recording cannot be transcribed.'),{status:409});
}
