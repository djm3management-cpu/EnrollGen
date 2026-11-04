const transient=new Set([429,500,502,503,504]);
export async function retryPostCall(operation,{wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onRetry=()=>{},attempts=4}={}) {
  for(let attempt=1;;attempt++) {
    const response=await operation();
    if(!transient.has(response.status)||attempt>=attempts)return response;
    await response.body?.cancel();
    onRetry({attempt,status:response.status});
    await wait(1000*2**(attempt-1));
  }
}
