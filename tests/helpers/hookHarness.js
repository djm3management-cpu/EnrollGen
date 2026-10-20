// Executes the real hook callbacks with deterministic effects and SDK/network
// fakes. No browser, phone call, auth session or production write is performed.
export function hookHarness() {
 const slots=[];let cursor=0,dirty=false,pending=[],component,value;
 const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((x,i)=>!Object.is(x,b[i]));
 const hooks={
  useState(initial){const i=cursor++;slots[i]??={value:typeof initial==='function'?initial():initial};slots[i].set??=next=>{const v=typeof next==='function'?next(slots[i].value):next;if(!Object.is(slots[i].value,v)){slots[i].value=v;dirty=true;}};return[slots[i].value,slots[i].set];},
  useRef(initial){const i=cursor++;return slots[i]??=( {current:initial} );},
  useMemo(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps))slots[i]={value:fn(),deps};return slots[i].value;},
  useEffect(fn,deps){const i=cursor++;if(!slots[i]||changed(slots[i].deps,deps)){pending.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}},
 };
 hooks.useSyncExternalStore=(subscribe,getSnapshot)=>{
  const [,setTick]=hooks.useState(0);
  hooks.useEffect(()=>subscribe(()=>setTick(value=>value+1)),[subscribe,getSnapshot]);
  return getSnapshot();
 };
 hooks.useCallback=(fn,deps)=>hooks.useMemo(()=>fn,deps);
 const render=()=>{cursor=0;dirty=false;value=component();const run=pending;pending=[];run.forEach(fn=>fn());return value;};
 return {hooks,render, mount(fn){component=fn;return render();},get value(){return value;},
  async flush(){for(let i=0;i<30;i++){await new Promise(resolve=>setImmediate(resolve));if(!dirty)return value;render();}throw new Error('Hook render did not settle');},
  unmount(){slots.forEach(slot=>slot?.cleanup?.());},
 };
}
