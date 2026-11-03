'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {policy,transition,automaticDecision,protectedProject,MAIN_PROJECT}=require('./site-policy');
const site={site_id:'test',vercel_project_id:'prj_TestOnly',manual_suspended:'FALSE',billing_exempt:'FALSE',suspension_enabled:'FALSE',control_version:'3'};
const command={field:'manualSuspended',value:true,expectedVersion:3,reason:'Customer requested suspension',confirmProjectId:'prj_TestOnly'};
test('suspend requires exact project confirmation and records independent state',()=>{
 assert.throws(()=>transition(site,{...command,confirmProjectId:'prj_Other'}),/CONFIRM_PROJECT/);
 const change=transition(site,command);assert.equal(change.providerAction,'pause');assert.equal(change.after.manualSuspended,true);assert.equal(change.after.billingExempt,false);assert.equal(change.after.version,4);
});
test('stale admin changes and invalid values are rejected',()=>{
 assert.throws(()=>transition(site,{...command,expectedVersion:2}),/STALE_VERSION/);
 assert.throws(()=>transition(site,{...command,value:'true'}),/INVALID_CHANGE/);
 assert.throws(()=>transition(site,{...command,reason:''}),/REASON_REQUIRED/);
});
test('exemption neither resumes a manual block nor calls PayPal or Vercel',()=>{
 const change=transition({...site,manual_suspended:'TRUE'},{...command,field:'billingExempt',value:true});
 assert.equal(change.after.manualSuspended,true);assert.equal(change.providerAction,null);
 assert.equal(automaticDecision({...site,manual_suspended:'TRUE',billing_exempt:'TRUE'}),'manual_block');
});
test('free sites remain active and never participate in automatic suspension',()=>{
 assert.equal(automaticDecision({...site,billing_exempt:'TRUE',suspension_enabled:'TRUE'}),'exempt');
 assert.equal(automaticDecision(site),'disabled');
});
test('automation enrollment requires a recorded contractual permission',()=>{
 assert.throws(()=>transition(site,{...command,field:'automaticSuspension'}),/CONTRACT_REQUIRED/);
 assert.equal(transition({...site,contract_allows_suspension:'TRUE'},{...command,field:'automaticSuspension'}).after.automaticSuspension,true);
});
test('HGM main and shared infrastructure remain protected',()=>{
 assert.equal(protectedProject({...site,vercel_project_id:MAIN_PROJECT}),true);
 assert.equal(protectedProject(site,[{vercel_project_id:site.vercel_project_id,assignment_status:'SHARED'}]),true);
 assert.equal(protectedProject(site),false);
});
test('only an explicit admin resume clears the manual lock',()=>{
 const change=transition({...site,manual_suspended:'TRUE'},{...command,value:false});
 assert.equal(change.providerAction,'unpause');assert.equal(change.after.manualSuspended,false);
});
test('billing evaluation gives manual locks precedence over payment',()=>{
 const {evaluateBilling}=require('./billing-state');
 assert.equal(evaluateBilling({manualSuspended:true,paymentConfirmed:true}).state,'suspended_manual');
 assert.equal(evaluateBilling({billingExempt:true}).reason,'BILLING_EXEMPT');
 assert.equal(evaluateBilling({protectedProject:true}).state,'protected');
});
