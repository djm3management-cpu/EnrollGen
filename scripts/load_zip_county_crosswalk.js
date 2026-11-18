// Loads a local HUD USPS ZIP to county crosswalk file into
// public.ping_zip_county_crosswalk (migration 181) through the service client.
// It never downloads anything: the operator passes the path of a CSV already
// on disk with the HUD columns ZIP, COUNTY, USPS_ZIP_PREF_STATE and RES_RATIO
// (header case does not matter; other columns are ignored).
//
//   node scripts/load_zip_county_crosswalk.js path/to/ZIP_COUNTY.csv [--batch=1000]
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const CROSSWALK_TABLE='ping_zip_county_crosswalk';
export const DEFAULT_BATCH_SIZE=1000;
const REQUIRED=['zip','county','usps_zip_pref_state','res_ratio'];

/** Splits CSV text into rows of fields; handles quoted fields, doubled quotes and CRLF. */
export function parseCsv(text){
 const rows=[];let row=[];let field='';let quoted=false;
 const source=String(text).replace(/^\uFEFF/,'');
 for(let i=0;i<source.length;i+=1){
  const ch=source[i];
  if(quoted){
   if(ch==='"'&&source[i+1]==='"'){field+='"';i+=1;}
   else if(ch==='"')quoted=false;
   else field+=ch;
  }else if(ch==='"')quoted=true;
  else if(ch===','){row.push(field);field='';}
  else if(ch==='\n'||ch==='\r'){
   if(ch==='\r'&&source[i+1]==='\n')i+=1;
   row.push(field);field='';
   if(row.some(value=>value!==''))rows.push(row);
   row=[];
  }else field+=ch;
 }
 row.push(field);
 if(row.some(value=>value!==''))rows.push(row);
 return rows;
}

const digits=(value,width)=>{const text=String(value??'').trim();return /^[0-9]{1,5}$/.test(text)?text.padStart(width,'0'):null;};

/**
 * Normalizes the HUD layout to {zip, county_fips, state_code, res_ratio}.
 * Invalid rows are skipped and counted; a repeated (zip, county) keeps the last.
 */
export function crosswalkRows(text){
 const [header,...body]=parseCsv(text);
 if(!header)throw Error('The crosswalk file is empty');
 const index=Object.fromEntries(header.map((name,i)=>[name.trim().toLowerCase(),i]));
 const missing=REQUIRED.filter(name=>!(name in index));
 if(missing.length)throw Error(`The crosswalk file is missing columns: ${missing.map(name=>name.toUpperCase()).join(', ')}`);
 const byKey=new Map();let skipped=0;
 for(const fields of body){
  const zip=digits(fields[index.zip],5);
  const county=digits(fields[index.county],5);
  const state=String(fields[index.usps_zip_pref_state]??'').trim().toUpperCase();
  const ratioText=String(fields[index.res_ratio]??'').trim();
  const ratio=Number(ratioText);
  if(!zip||!county||!/^[A-Z]{2}$/.test(state)||ratioText===''||!Number.isFinite(ratio)||ratio<0||ratio>1){skipped+=1;continue;}
  byKey.set(`${zip}:${county}`,{zip,county_fips:county,state_code:state,res_ratio:ratio});
 }
 return {rows:[...byKey.values()],skipped};
}

/** Upserts the rows in batches on (zip, county_fips). Returns counts. */
export async function loadZipCountyCrosswalk({text,client,batchSize=DEFAULT_BATCH_SIZE}){
 if(!client?.from)throw Error('A service client is required');
 const size=Number(batchSize);
 if(!Number.isInteger(size)||size<1)throw Error('The batch size must be a positive integer');
 const {rows,skipped}=crosswalkRows(text);
 let batches=0;
 for(let start=0;start<rows.length;start+=size){
  const {error}=await client.from(CROSSWALK_TABLE).upsert(rows.slice(start,start+size),{onConflict:'zip,county_fips'});
  if(error)throw Error(`Crosswalk batch ${batches+1} failed: ${error.message}`);
  batches+=1;
 }
 return {rows:rows.length,skipped,batches};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const args=process.argv.slice(2);
 const file=args.find(arg=>!arg.startsWith('--'));
 const batch=args.find(arg=>arg.startsWith('--batch='))?.slice('--batch='.length);
 if(!file)throw Error('Usage: node scripts/load_zip_county_crosswalk.js path/to/ZIP_COUNTY.csv [--batch=1000]');
 const text=await readFile(file,'utf8');
 const {createSupabaseClient,supabaseSecretKey}=await import('../integrations/supabase.js');
 const client=createSupabaseClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,supabaseSecretKey());
 const result=await loadZipCountyCrosswalk({text,client,batchSize:batch??DEFAULT_BATCH_SIZE});
 console.log(`Crosswalk loaded: ${result.rows} rows in ${result.batches} batches, ${result.skipped} skipped`);
}
