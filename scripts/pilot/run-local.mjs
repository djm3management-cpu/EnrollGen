// Outer process ceiling includes bootstrap and shutdown, even if a fake stalls.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertSafeEnvironment} from './load-safety.js';
try {
 assertSafeEnvironment(process.env);
 const args=process.argv.slice(2);
 for(let i=0;i<args.length;i++){
  if(args[i]==='--long')continue;
  if(args[i]==='--output'&&args[i+1]){i++;continue;}
  throw Error('Unknown local load argument');
 }
 const long=args.includes('--long');
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./local-load.mjs',import.meta.url)),...args],{stdio:'inherit',timeout:(long?120:30)*1000,killSignal:'SIGKILL'});
 if(result.error)throw Error('Local load hard duration ceiling reached or child startup failed');
 process.exitCode=result.status??1;
}catch(error){console.error(error.message);process.exitCode=1;}
