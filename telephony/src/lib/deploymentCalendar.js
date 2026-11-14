// Pure calendar helpers, shared with the browser. No environment or secrets.
export function localDay(now,timezone) {
 return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
}
export function calendarMidnight(day,timezone) {
 const wanted=Date.parse(`${day}T00:00:00Z`);if(!Number.isFinite(wanted))throw Error('Invalid calendar day');
 let instant=wanted;
 for(let n=0;n<4;n++){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
  const asUtc=Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
  if(asUtc===wanted)return new Date(instant).toISOString();instant+=wanted-asUtc;
 }
 throw Error('Calendar midnight is not representable in deployment timezone');
}
export function shiftCalendarDay(day,days) {const d=new Date(`${day}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
