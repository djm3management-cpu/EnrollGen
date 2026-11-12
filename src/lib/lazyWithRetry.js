import { lazy } from 'react';
import { preloadRecovery } from './preloadRecovery.js';

const CHUNK_FAILURE = /Failed to fetch dynamically imported module|Importing a module script failed|Failed to load module script/i;

export function lazyWithRetry(importer) {
  return lazy(() => importer().catch(error => {
    if (CHUNK_FAILURE.test(String(error?.message || error))) preloadRecovery.reloadOnce();
    throw error;
  }));
}
