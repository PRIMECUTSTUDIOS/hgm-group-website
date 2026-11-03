'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('verified payment cannot resume a manual suspension even if automation env is true',async()=>{
 const libPath=require.resolve('../api/_lib'),cronPath=require.resolve('../api/billing-cron');const original=require.cache[libPath];
 const calls=[];const previousSecret=process.env.CRON_SECRET,previousAuto=process.env.HGM_AUTO_SUSPEND;
 process.env.CRON_SECRET='local-test';process.env.HGM_AUTO_SUSPEND='true';
 const real=require('../api/_lib');
 require.cache[libPath]={id:libPath,filename:libPath,loaded:true,exports:{...real,list:async name=>({Sites:[{site_id:'s',manual_suspended:'TRUE',site_status:'suspended',vercel_project_id:'prj_Test'}],Clients:[{client_id:'c',email:'client@example.test'}],Subscriptions:[{subscription_id:'sub',site_id:'s',client_id:'c',paypal_subscription_id:'I-TEST',paypal_plan_id:'P-TEST',due_at:'2026-01-01T00:00:00Z',status:'suspended'}],Notices:[]}[name]),paypalGet:async()=>({plan_id:'P-TEST',subscriber:{email_address:'client@example.test'},billing_info:{last_payment:{time:'2026-01-02T00:00:00Z',amount:{value:'29.99'}},next_billing_time:'2026-02-01T00:00:00Z'}}),update:async(name,row,data)=>calls.push({name,data}),reqJson:async()=>{throw Error('Unexpected external mutation')}}};
 delete require.cache[cronPath];const handler=require(cronPath),res={setHeader(){},end(s){this.body=JSON.parse(s)}};
 try{await handler({method:'GET',headers:{authorization:'Bearer local-test'}},res);assert.equal(res.statusCode,200);assert.equal(calls.some(c=>c.name==='Sites'),false);assert.equal(calls[0].name,'Subscriptions')}
 finally{require.cache[libPath]=original;delete require.cache[cronPath];if(previousSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=previousSecret;if(previousAuto===undefined)delete process.env.HGM_AUTO_SUSPEND;else process.env.HGM_AUTO_SUSPEND=previousAuto}
});
