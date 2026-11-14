import {createRecordingComplianceHandler} from './recordingCompliance.js';
// Ordinary playback and compliance downloads share the exact audited streaming
// boundary, including stored WAVs. Signed object URLs never leave this server.
export function createRecordingMediaHandler(options){
 return createRecordingComplianceHandler({...options,ticketTable:'recording_download_tickets'});
}
