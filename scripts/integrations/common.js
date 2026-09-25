import { createClient } from '@supabase/supabase-js';
import { parseArgs } from 'node:util';
import { randomBytes,createHash } from 'node:crypto';
export const randomKey=()=>randomBytes(32).toString('base64url');
export const hash=value=>createHash('sha256').update(value).digest('hex');
export function args(options){return parseArgs({options,strict:true}).values;}
export function database(){
 const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url || !key)throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
 return createClient(url,key,{auth:{persistSession:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})}});
}
export async function checked(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
export function requiredName(name){if(!name || !/^[\w .-]{1,100}$/.test(name))throw Error('--name is required (letters, numbers, spaces, dots, hyphens)');return name;}
