// Always re-read service-owned state; callers may hold an older row or capability.
export async function recordingBlocked(db,row){
 if(row.deletion_pending_at)return true;
 const key=/^[a-f0-9-]{36}$/i.test(row.id||row.recording_id||'')?'id':row.recording_sid?'recording_sid':row.storage_path?'storage_path':null;
 if(!key)return false;
 const value=key==='id'?(row.id||row.recording_id):row[key];
 const {data,error}=await db.from('recording_ingestion').select('*').eq(key,value).limit(1);
 if(error)throw Error('Recording availability unavailable');
 return (data||[]).some(r=>r.deletion_pending_at);
}
