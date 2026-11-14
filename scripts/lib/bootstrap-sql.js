// Split SQL without splitting quoted strings, dollar bodies or nested comments.
// Comments are omitted so historical operational notes do not become install data.
export function statements(source) {
 const out=[]; let buffer='',i=0,quote=null,depth=0;
 while(i<source.length){
  if(depth){if(source.startsWith('/*',i)){depth++;i+=2;}else if(source.startsWith('*/',i)){depth--;i+=2;if(!depth)buffer+=' ';}else i++;continue;}
  if(quote){
   if(source.startsWith(quote,i)){
    buffer+=quote;i+=quote.length;
    if((quote==="'"||quote==='"')&&source.startsWith(quote,i)){buffer+=quote;i+=quote.length;}else quote=null;
   }else buffer+=source[i++];continue;
  }
  if(source.startsWith('--',i)){while(i<source.length&&source[i]!=='\n')i++;buffer+='\n';continue;}
  if(source.startsWith('/*',i)){depth=1;i+=2;continue;}
  const dollar=source.slice(i).match(/^\$(?:[a-zA-Z_][\w]*)?\$/)?.[0];
  if(dollar){quote=dollar;buffer+=dollar;i+=dollar.length;continue;}
  if(source[i]==="'"||source[i]==='"'){quote=source[i];buffer+=source[i++];continue;}
  if(source[i]===';'){if(buffer.trim())out.push(buffer.trim()+';');buffer='';i++;continue;}
  buffer+=source[i++];
 }
 if(quote||depth)throw Error('Unterminated SQL quote/comment');
 if(buffer.trim())out.push(buffer.trim());
 return out;
}
