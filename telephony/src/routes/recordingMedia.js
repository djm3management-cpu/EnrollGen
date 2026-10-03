import { Router } from 'express';
import { config } from '../config.js';
import { supabase } from '../supabase.js';
import { createRecordingMediaHandler } from '../recordingMedia.js';
export const recordingMediaRouter = Router();
// Opaque, short-lived, server-issued capability. No provider URL or credentials
// are accepted from the browser. GET/Range enables native audio and downloads.
recordingMediaRouter.get('/api/recordings/media/:token', createRecordingMediaHandler({ db: supabase, config }));
