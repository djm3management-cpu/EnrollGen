import {nativeRecovery} from './native.js';
if(!await nativeRecovery('backup',process.argv.slice(2)))process.exitCode=1;
