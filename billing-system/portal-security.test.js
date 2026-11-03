'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const libPath=require.resolve('../api/_lib'),controlPath=require.resolve('../api/_controls'),portalPath=require.resolve('../api/portal');
const {json,fail}=require(libPath);
async function run({admin=false,action='me',method='GET',body={},auth=true}={}){
 const data={Clients:[{client_id:'a',email:'a@example.test'},{client_id:'b',email:'b@example.test'}],Sites:[{site_id:'site-a',client_id:'a'},{site_id:'site-b',client_id:'b'}],Subscriptions:[{subscription_id:'sub-a',site_id:'site-a'},{subscription_id:'sub-b',site_id:'site-b'}]};
 let calls=[];const originalLib=require.cache[libPath],originalControl=require.cache[controlPath];
 require.cache[libPath]={id:libPath,filename:libPath,loaded:true,exports:{json,fail,list:async name=>data[name]||[],googleUser:async()=>{if(!auth)throw fail('Login required',401);return {email:'a@example.test'}},isAdmin:()=>admin}};
 require.cache[controlPath]={id:controlPath,filename:controlPath,loaded:true,exports:{controlsConfigured:()=>true,controlSite:async(actor,cmd)=>{calls.push({actor,cmd});return {ok:true}}}};
 delete require.cache[portalPath];const handler=require(portalPath);
 const res={setHeader(){},end(value){this.body=JSON.parse(value)}};
 try{await handler({method,headers:{},query:{action},body},res);return {res,calls}}finally{require.cache[libPath]=originalLib;if(originalControl)require.cache[controlPath]=originalControl;else delete require.cache[controlPath];delete require.cache[portalPath]}
}
test('client can only read its own site and subscription',async()=>{
 const {res}=await run();assert.equal(res.statusCode,200);assert.deepEqual(res.body.sites.map(s=>s.site_id),['site-a']);assert.equal(res.body.sites[0].subscription.subscription_id,'sub-a');
});
test('client cannot read admin ledger or use site controls',async()=>{
 assert.equal((await run({action:'admin'})).res.statusCode,403);
 const r=await run({method:'POST',action:'site-control',body:{actor:'admin@example.test'}});assert.equal(r.res.statusCode,403);assert.equal(r.calls.length,0);
});
test('unauthenticated visitors cannot access the account',async()=>{assert.equal((await run({auth:false})).res.statusCode,401)});
test('control actor is derived from verified identity and cannot be spoofed',async()=>{
 const r=await run({admin:true,method:'POST',action:'site-control',body:{siteId:'site-a',field:'billingExempt',value:true,expectedVersion:0,reason:'Partner exemption',actor:'fake@example.test'}});
 assert.equal(r.res.statusCode,200);assert.equal(r.calls[0].actor,'a@example.test');assert.equal(r.calls[0].cmd.actor,undefined);
});
