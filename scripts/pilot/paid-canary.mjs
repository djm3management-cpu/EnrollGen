// Preparation only. No provider transport, database connector or environment loader.
import {readFileSync} from 'node:fs';
import {assertLoadSafety} from './load-safety.js';
const path=process.argv[2];
try {
 if(!path)throw Error('Pass a reviewed JSON plan with disposableHosts and spendCeilingUsd');
 const plan=assertLoadSafety(JSON.parse(readFileSync(path,'utf8')),{paid:true});
 console.log(JSON.stringify({status:'prepared_only',targets:plan.targets.length,spendCeilingUsd:plan.spendCeilingUsd,transportEnabled:false}));
 console.error('Execution disabled: later separate authorization and provider quota checks required.');
 process.exitCode=2;
}catch(error){console.error(error.message);process.exitCode=1;}
