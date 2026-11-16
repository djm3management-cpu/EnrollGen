import {createHash} from 'node:crypto';
import {jsPDF} from 'jspdf';
// Stored immutable-copy hashes come from recording_ingestion; audio bytes are
// never fetched. Database rows without a stored file have no file checksum.
export function evidenceIndex(events,files=[]){
 const index=new Map();
 for(const event of events)for(const item of event.evidence){
  const key=item.table+':'+item.id,old=index.get(key);
  index.set(key,{...item,time:old?.time||item.time,sha256:old?.sha256||(/^[a-f0-9]{64}$/i.test(event.details.sha256||'')&&event.details.stored===true?event.details.sha256:null)});
 }
 for(const file of files){const key=file.table+':'+file.id;index.set(key,{...(index.get(key)||{}),...file});}
 return [...index.values()];
}
export function buildLifecyclePacket({agency,consumerId,asOf,events,checks,files=[]}){
 const doc=new jsPDF({unit:'pt',format:'letter',compress:false});let y=72,page=1;
 const footer=()=>{doc.setFontSize(9);doc.text(String(page),550,760);};
 const newPage=()=>{footer();doc.addPage();page++;y=54;};
 const line=(text,size=10)=>{doc.setFont('helvetica','normal');doc.setFontSize(size);
  const lines=doc.splitTextToSize(String(text??'--'),496);
  for(const part of lines){if(y>718){newPage();doc.setFontSize(size);}doc.text(part,58,y);y+=size+6;}y+=4;
 };
 const block=parts=>{let height=0;for(const [text,size=10] of parts){doc.setFontSize(size);height+=doc.splitTextToSize(String(text??'--'),496).length*(size+6)+4;}if(y+height>718&&height<664)newPage();};
 line(agency,18);line('Consumer audit packet',18);line(`Consumer ${consumerId}`);line(`As of ${asOf}`);line('Timeline | Completeness checks | Evidence index');
 newPage();line('Timeline',16);
 for(const e of events){const parts=[[`${e.time} | ${e.type} | ${e.status}`,11],[`${e.summary} | Staff ${e.staff||'--'}`],[Object.entries(e.details).filter(([k,v])=>!['sha256','stored'].includes(k)&&v!=null).map(([k,v])=>`${k}: ${v}`).join(' | ')],...e.evidence.map(item=>[`${item.table} / ${item.id}`,9])];block(parts);for(const [text,size] of parts)line(text,size);}
 newPage();line('Completeness checks',16);
 for(const group of checks){line(`Enrollment ${group.enrollmentId}`,11);for(const check of group.checks){block([[`${check.name}: ${check.status}`],...check.evidence.map(item=>[`${item.table} / ${item.id}`,9])]);line(`${check.name}: ${check.status}`);for(const item of check.evidence)line(`${item.table} / ${item.id}`,9);for(const item of check.items||[])line(`${item.callId}: ${item.status}`,9);}}
 newPage();line('Evidence index',16);
 for(const e of evidenceIndex(events,files)){block([[`${e.table} / ${e.id}`],[e.time,9],[`SHA-256: ${e.sha256||'not available'}`,9]]);line(`${e.table} / ${e.id}`,10);line(e.time,9);line(`SHA-256: ${e.sha256||'not available'}`,9);}
 footer();return new Uint8Array(doc.output('arraybuffer'));
}

// Hash existing protected files through the already audited storage client.
// No file bytes, paths or names enter the document, logs or durable state.
export async function packetFileIndex(db,manifest){
 const files=[];let total=0;
 for(const file of manifest){
  let hash=file.sha256;
  if(!/^[a-f0-9]{64}$/i.test(hash||'')){
   const result=await db.storage.from(file.bucket).download(file.storage_path);
   if(result.error||!result.data||result.data.size>64*1024*1024)throw Error('Packet file unavailable');
   const bytes=new Uint8Array(await result.data.arrayBuffer());total+=bytes.byteLength;
   if(total>128*1024*1024)throw Error('Packet file limit');
   hash=createHash('sha256').update(bytes).digest('hex');
  }
  files.push({table:file.source_table,id:file.id,time:file.occurred_at,sha256:hash});
 }
 return files;
}
