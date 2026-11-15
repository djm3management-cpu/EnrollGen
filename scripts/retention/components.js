// Strongly connected reference groups are deleted in one database transaction.
export function referenceComponents(nodes) {
  const byKey=new Map(nodes.map(n=>[n.key,n])),index=new Map(),low=new Map(),stack=[],active=new Set(),groups=[];
  let next=0;
  const visit=n=>{
    index.set(n.key,next);low.set(n.key,next++);stack.push(n);active.add(n.key);
    for(const key of n.refs)if(byKey.has(key)) {
      if(!index.has(key)){visit(byKey.get(key));low.set(n.key,Math.min(low.get(n.key),low.get(key)));}
      else if(active.has(key))low.set(n.key,Math.min(low.get(n.key),index.get(key)));
    }
    if(low.get(n.key)===index.get(n.key)) {
      const group=[];let current;
      do {current=stack.pop();active.delete(current.key);group.push(current);}while(current!==n);
      groups.push(group);
    }
  };
  for(const n of nodes)if(!index.has(n.key))visit(n);
  return groups;
}
