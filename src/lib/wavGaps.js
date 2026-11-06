// Pure PCM WAV slicing: no provider, codec, filesystem or network dependency.
export function wavInfo(input){
 const b=new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength),str=(at,n)=>String.fromCharCode(...b.slice(at,at+n));
 if(b.length<44||str(0,4)!=='RIFF'||str(8,4)!=='WAVE')throw Error('Expected RIFF WAV');
 let fmt=null,data=null;
 for(let at=12;at+8<=b.length;){const n=v.getUint32(at+4,true);if(at+8+n>b.length)throw Error('Truncated WAV');const tag=str(at,4);if(tag==='fmt ')fmt={at:at+8,length:n};if(tag==='data')data={at:at+8,length:n};at+=8+n+(n%2);}
 if(!fmt||fmt.length<16||!data)throw Error('WAV format or audio missing');
 const encoding=v.getUint16(fmt.at,true),channels=v.getUint16(fmt.at+2,true),sampleRate=v.getUint32(fmt.at+4,true),byteRate=v.getUint32(fmt.at+8,true),blockAlign=v.getUint16(fmt.at+12,true);
 if(encoding!==1||![1,2].includes(channels)||!sampleRate||!byteRate||!blockAlign)throw Error('Only mono/stereo PCM WAV is supported');
 return {b,v,fmt,data,channels,sampleRate,byteRate,blockAlign,durationMs:data.length/byteRate*1000};
}
export function sliceWav(input,startMs,endMs){
 const x=wavInfo(input);if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs<0||endMs<=startMs||endMs>x.durationMs+1)throw Error('Invalid WAV gap range');
 const first=Math.floor(startMs*x.byteRate/1000/x.blockAlign)*x.blockAlign,last=Math.min(x.data.length,Math.ceil(endMs*x.byteRate/1000/x.blockAlign)*x.blockAlign),audio=x.b.slice(x.data.at+first,x.data.at+last);
 const out=new Uint8Array(44+audio.length),view=new DataView(out.buffer);const set=(at,s)=>{for(let i=0;i<s.length;i++)out[at+i]=s.charCodeAt(i);};
 set(0,'RIFF');view.setUint32(4,out.length-8,true);set(8,'WAVE');set(12,'fmt ');view.setUint32(16,16,true);out.set(x.b.slice(x.fmt.at,x.fmt.at+16),20);set(36,'data');view.setUint32(40,audio.length,true);out.set(audio,44);
 return {bytes:out,startMs:first/x.byteRate*1000,endMs:last/x.byteRate*1000,channels:x.channels};
}
