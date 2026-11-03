'use strict';
const crypto=require('node:crypto');
const {env,fail,reqJson}=require('./_lib');
function controlsConfigured(){return Boolean(process.env.HGM_CONTROL_GATEWAY_URL&&process.env.HGM_CONTROL_GATEWAY_SECRET)}
async function controlSite(actor,command){
 if(!controlsConfigured())throw fail('El control de páginas requiere completar la conexión segura de Google y Vercel.',503);
 const endpoint=new URL(env('HGM_CONTROL_GATEWAY_URL'));
 if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(endpoint.pathname))throw fail('Invalid control gateway configuration',503);
 const payload=JSON.stringify({actor,command}),timestamp=Date.now(),nonce=crypto.randomUUID();
 const signature=crypto.createHmac('sha256',env('HGM_CONTROL_GATEWAY_SECRET')).update(timestamp+'.'+nonce+'.'+payload).digest('hex');
 const result=await reqJson(endpoint.href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,timestamp,nonce,signature}),signal:AbortSignal.timeout(65000)});
 if(result.ok!==true)throw fail(result.error||'No se pudo verificar el cambio; actualiza el panel antes de reintentar.',result.code||503);
 return result;
}
module.exports={controlSite,controlsConfigured};
