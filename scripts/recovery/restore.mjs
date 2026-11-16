import {nativeRecovery} from './native.js';
if(!await nativeRecovery('restore',process.argv.slice(2)))process.exitCode=1;
