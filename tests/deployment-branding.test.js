import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import * as publicDisplay from '../src/lib/deploymentPublic.js';
import {AGENCY_CLOSING} from '../src/data/agencyClosing.js';
import {ENROLLMENT_CLOSING} from '../src/data/enrollmentClosing.js';
import {getAncillarySteps} from '../src/flows/ancillary/ancillarySteps.js';
import {SUB_PRODUCT} from '../src/flows/ancillary/ancillaryConstants.js';
import {ACA_GATES} from '../src/flows/aca/ACAData.js';
import {U65_GATES} from '../src/flows/u65/U65Data.js';
import {MEDSUP_SECTIONS} from '../src/context/MedSupScript.js';
import {generateSessionSummary,initialState} from '../src/context/scriptReducer.js';

test('MA, Med Supp, ACA and U65 scripts render the synthetic name, line and staffed hours',()=>{
 const scripts=[ENROLLMENT_CLOSING,AGENCY_CLOSING,JSON.stringify(ACA_GATES),JSON.stringify(U65_GATES),JSON.stringify(MEDSUP_SECTIONS),...Object.values(SUB_PRODUCT).map(p=>JSON.stringify(getAncillarySteps(p))).filter(s=>s!=='[]')];
 for(const script of scripts){assert.ok(script.includes(publicDisplay.agencyName));assert.ok(script.includes(publicDisplay.agencyLine));assert.ok(script.includes(publicDisplay.agencyHours));}
});

test('actual session PDF contains configured document branding, phone and hours on rendered pages',()=>{
 const code=transformSync(readFileSync(new URL('../src/components/SessionSummary.jsx',import.meta.url),'utf8'),{loader:'jsx',format:'cjs'}).code;
 const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require(name){
  if(name.endsWith('/deploymentPublic.js'))return publicDisplay;
  if(name==='react')return {memo:fn=>fn};
  if(name.endsWith('/ComplianceScorer'))return {groupByCategory:()=>({})};
  if(name.endsWith('/CopilotTranscriptLog'))return {LOG_TYPES:{}};
  return {};
 }});
 const summary=generateSessionSummary({...structuredClone(initialState),sessionStart:Date.now()});
 assert.equal(summary.agencyName,publicDisplay.agencyName);assert.equal(summary.timezone,publicDisplay.deploymentPublic.timezone);
 const doc=module.exports.exportSessionSummaryPdf(summary,{score:100,grade:'A',categoriesPassed:0,totalCategories:0,totalPassed:0,totalQuestions:0,categories:[],flags:[],summary:'Synthetic session.'},[],[],[],{jsPDF,autoTable,save:false});
 const pdf=doc.output().replace(/\\([()\\])/g,'$1');assert.ok(pdf.includes(publicDisplay.deploymentPublic.documentName));assert.ok(pdf.includes(publicDisplay.agencyHours));assert.ok(pdf.includes('555-0100'));assert.ok(doc.getNumberOfPages()>=1);
 for(const term of JSON.parse(readFileSync(new URL('./fixtures/forbidden-deployment-terms.json',import.meta.url))))assert.ok(!pdf.toLowerCase().includes(term.toLowerCase()),term);
});
