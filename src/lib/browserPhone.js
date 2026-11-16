// The existing Voice SDK client, with the same codecs for both phone purposes.
export function createBrowserPhone(Device,token,options={}) {
 return new Device(token,{codecPreferences:['opus','pcmu'],...options});
}
