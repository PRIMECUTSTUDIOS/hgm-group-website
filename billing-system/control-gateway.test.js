'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
function fixture({providerFailure=false,locked=false}={}){
 const data={Sites:[['site_id','vercel_project_id','vercel_team_id','managed_by_hgm','site_status','control_version'],['site-test','prj_TestOnly','team_TestOnly','TRUE','active',0]],Audit:[['event_id','entity_type','entity_id','actor','event_name','event_at','reason']],ProjectInventory:[['vercel_project_id','vercel_team_id','assignment_status'],['prj_TestOnly','team_TestOnly','ASSIGNED']]};
 const calls=[];let hasLock=false,failProvider=providerFailure;
 const secret='test-secret-not-a-real-credential-000000000';
 const props={HGM_CONTROL_GATEWAY_SECRET:secret,HGM_ADMIN_EMAILS:'admin@example.test',HGM_BILLING_SHEET_ID:'test',HGM_VERCEL_TEAM_ID:'team_TestOnly',VERCEL_API_TOKEN:'test-only'};
 function sheet(name){const rows=data[name];return {getLastColumn:()=>rows[0].length,getLastRow:()=>rows.length,getRange:(r,c,h,w)=>({getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[r+i-1]?.[c+j-1]??'')),setValues:values=>{values.forEach((row,i)=>{rows[r+i-1]??=[];row.forEach((v,j)=>rows[r+i-1][c+j-1]=v)})}})}}
 const ctx={module:{exports:{}},ContentService:{MimeType:{JSON:'json'},createTextOutput:s=>({setMimeType:()=>JSON.parse(s)})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k]})},LockService:{getScriptLock:()=>({tryLock:()=>{hasLock=!locked;return hasLock},hasLock:()=>hasLock,releaseLock:()=>{hasLock=false}})},SpreadsheetApp:{openById:()=>({getSheetByName:sheet}),flush:()=>{}},Utilities:{getUuid:()=>crypto.randomUUID(),computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest())},UrlFetchApp:{fetch:(url,opts)=>{assert.equal(hasLock,true,'Provider call must be inside the lock');calls.push({url,opts});if(failProvider&&opts.method==='post')throw Error('Timeout');return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({id:'prj_TestOnly',accountId:'team_TestOnly',name:'test-only'})}}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/control-gateway.gs','utf8'),ctx);
 const request=(overrides={},actor='admin@example.test')=>{
  const payload=JSON.stringify({actor,command:{siteId:'site-test',field:'manualSuspended',value:true,expectedVersion:0,reason:'Isolated local test',confirmProjectId:'prj_TestOnly',...overrides}}),timestamp=Date.now(),nonce=crypto.randomUUID();
  const signature=crypto.createHmac('sha256',secret).update(timestamp+'.'+nonce+'.'+payload).digest('hex');return {postData:{contents:JSON.stringify({payload,timestamp,nonce,signature})}};
 };
 const readSite=()=>Object.fromEntries(data.Sites[0].map((k,i)=>[k,data.Sites[1][i]]));
 return {data,calls,request,invoke:r=>ctx.doPost(r),readSite,providerHealthy:()=>{failProvider=false}};
}
test('signed admin suspension reaches only the assigned Vercel project and audits both states',()=>{
 const f=fixture(),req=f.request();assert.equal(f.invoke(req).ok,true);
 assert.equal(f.readSite().manual_suspended,'TRUE');assert.equal(f.readSite().site_status,'suspended_manual');
 assert.equal(f.calls.filter(x=>x.opts.method==='post').length,1);assert.match(f.calls[1].url,/prj_TestOnly\/pause\?teamId=team_TestOnly$/);
 assert.equal(f.data.Audit.length,3);assert.equal(f.invoke(req).ok,false);assert.equal(f.calls.length,2);
});
test('non-admin and unsigned requests cannot modify sites',()=>{
 const f=fixture();assert.equal(f.invoke(f.request({},'client@example.test')).ok,false);
 const r=f.request(),env=JSON.parse(r.postData.contents);env.signature='0'.repeat(64);r.postData.contents=JSON.stringify(env);
 assert.equal(f.invoke(r).ok,false);assert.equal(f.calls.length,0);assert.equal(f.readSite().site_status,'active');
});
test('unconfirmed suspension and stale state never reach Vercel',()=>{
 const f=fixture();assert.equal(f.invoke(f.request({confirmProjectId:'prj_Wrong'})).ok,false);
 assert.equal(f.invoke(f.request({expectedVersion:9})).ok,false);assert.equal(f.calls.length,0);
});
test('provider timeout leaves a sticky lock; only a later admin resume clears it',()=>{
 const f=fixture({providerFailure:true});assert.equal(f.invoke(f.request()).ok,false);
 assert.equal(f.readSite().manual_suspended,'TRUE');assert.equal(f.readSite().control_error,'VERIFY_PROVIDER_STATE');
 f.providerHealthy();assert.equal(f.invoke(f.request({value:false,expectedVersion:1})).ok,true);
 assert.equal(f.readSite().manual_suspended,'FALSE');assert.equal(f.readSite().site_status,'active');
});
test('concurrent changes are rejected when lock is unavailable',()=>{
 const f=fixture({locked:true});assert.equal(f.invoke(f.request()).code,409);assert.equal(f.calls.length,0);
});
test('exemption remains independent and never cancels PayPal',()=>{
 const f=fixture();assert.equal(f.invoke(f.request({field:'billingExempt'})).ok,true);
 assert.equal(f.readSite().billing_exempt,'TRUE');assert.equal(f.calls.filter(c=>c.opts.method==='post').length,0);
});
test('shared services and the HGM main project cannot be suspended',()=>{
 const f=fixture();f.data.ProjectInventory[1][2]='PROTECTED - NEVER SUSPEND';assert.equal(f.invoke(f.request()).ok,false);assert.equal(f.calls.length,0);
});
