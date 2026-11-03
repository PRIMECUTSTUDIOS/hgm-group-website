'use strict';
const {json,env,uid,list,append,update,paypalGet,reqJson}=require('./_lib');
const DAY=86400000;
async function sendNotice(to,subject,text){
 const key=env('RESEND_API_KEY'),from=env('HGM_BILLING_FROM');
 const result=await reqJson('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text})});return result.id;
}
async function vercelPause(site){
 if(!/^prj_[a-zA-Z0-9]+$/.test(site.vercel_project_id)||!/^team_[a-zA-Z0-9]+$/.test(site.vercel_team_id))throw Error('Unverified project ID');
 const token=env('VERCEL_API_TOKEN');
 return reqJson('https://api.vercel.com/v1/projects/'+encodeURIComponent(site.vercel_project_id)+'/pause?teamId='+encodeURIComponent(site.vercel_team_id),{method:'POST',headers:{Authorization:'Bearer '+token}});
}
async function vercelResume(site){
 const token=env('VERCEL_API_TOKEN');
 return reqJson('https://api.vercel.com/v1/projects/'+encodeURIComponent(site.vercel_project_id)+'/unpause?teamId='+encodeURIComponent(site.vercel_team_id),{method:'POST',headers:{Authorization:'Bearer '+token}});
}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
 if(!process.env.CRON_SECRET)return json(res,200,{configured:false,processed:0});
 if(req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return json(res,401,{error:'Unauthorized'});
 try{
  const [subs,sites,clients,notices]=await Promise.all([list('Subscriptions'),list('Sites'),list('Clients'),list('Notices')]);
  const now=Date.now(),results=[];
  for(const sub of subs){
   const site=sites.find(s=>s.site_id===sub.site_id),client=clients.find(c=>c.client_id===sub.client_id);
   if(!site||!client||!sub.paypal_subscription_id){results.push({id:sub.subscription_id,state:'review_required'});continue}
   try{
    const p=await paypalGet('/v1/billing/subscriptions/'+encodeURIComponent(sub.paypal_subscription_id));
    if(p.plan_id!==sub.paypal_plan_id||p.subscriber?.email_address?.toLowerCase()!==client.email.toLowerCase())throw Error('PayPal ownership mismatch');
    const paidTime=Date.parse(p.billing_info?.last_payment?.time||'');
    const due=Date.parse(sub.due_at||'');
    const evidence=Number.isFinite(due)&&Number.isFinite(paidTime)&&paidTime>=due&&Number(p.billing_info?.last_payment?.amount?.value)>0;
    const nextDue=p.billing_info?.next_billing_time||'';
    if(evidence){
      const restored=sub.status==='suspended'&&site.site_status==='suspended';
      // Never auto-resume a manually suspended site without a verified matching payment.
      if(restored&&process.env.HGM_AUTO_SUSPEND==='true'){
        await vercelResume(site);
        await update('Sites',site.__row,{...site,site_status:'active'});
      }
      await update('Subscriptions',sub.__row,{...sub,status:'active',due_at:nextDue||sub.due_at,paid_through_at:nextDue||new Date(paidTime).toISOString(),last_verified_at:new Date().toISOString()});
      results.push({id:sub.subscription_id,state:'active'});continue;
    }
    if(!Number.isFinite(due)){results.push({id:sub.subscription_id,state:'review_required',reason:'No verified due date'});continue}
    const overdue=now-due;
    if(overdue<0){
      if((sub.status==='pending_first_payment'||sub.status==='pending_activation')&&p.status==='ACTIVE'&&Number.isFinite(paidTime)&&Number(p.billing_info?.last_payment?.amount?.value)>0){
        await update('Subscriptions',sub.__row,{...sub,status:'active',paid_through_at:sub.due_at,last_verified_at:new Date().toISOString()});
        results.push({id:sub.subscription_id,state:'active'});continue;
      }
      results.push({id:sub.subscription_id,state:'not_due'});continue;
    }
    const relevantNotices=notices.filter(n=>n.subscription_id===sub.subscription_id&&Date.parse(n.sent_at)>=due);
    const days=Math.floor(overdue/DAY),kind=days>=4?'final_warning':days>=2?'reminder':'overdue';
    if(!relevantNotices.some(n=>n.notice_type===kind&&n.delivery_status==='sent')){
      const emailId=await sendNotice(client.email,'HGM Group - Aviso sobre tu mensualidad','Tu mensualidad del servicio web está pendiente. Tienes cinco días de gracia desde el vencimiento antes de una posible suspensión. Para revisar o regularizar tu suscripción, entra a tu cuenta PayPal o contacta a billing@hgmgrouphq.com. Si ya pagaste, ignora este mensaje mientras verificamos el cobro.');
      await append('Notices',{notice_id:uid(),client_id:client.client_id,subscription_id:sub.subscription_id,notice_type:kind,sent_at:new Date().toISOString(),delivery_status:'sent',provider_id:emailId});
    }
    await update('Subscriptions',sub.__row,{...sub,status:'grace',grace_expires_at:new Date(due+5*DAY).toISOString(),last_verified_at:new Date().toISOString()});
    const finalNotice=relevantNotices.some(n=>n.notice_type==='final_warning'&&n.delivery_status==='sent');
    const allowlisted=(process.env.HGM_SUSPEND_PROJECT_IDS||'').split(',').map(x=>x.trim()).includes(site.vercel_project_id);
    const eligible=overdue>=5*DAY&&finalNotice&&site.managed_by_hgm==='TRUE'&&site.suspension_enabled==='TRUE'&&site.site_status!=='suspended'&&allowlisted&&p.status!=='ACTIVE'&&p.status!=='APPROVAL_PENDING';
    // ACTIVE PayPal agreements can contain retried payments: leave online for review.
    if(eligible&&process.env.HGM_AUTO_SUSPEND==='true'){
      await vercelPause(site);
      await update('Sites',site.__row,{...site,site_status:'suspended'});
      await update('Subscriptions',sub.__row,{...sub,status:'suspended',grace_expires_at:new Date(due+5*DAY).toISOString(),last_verified_at:new Date().toISOString()});
      await append('Audit',{event_id:uid(),entity_type:'site',entity_id:site.site_id,actor:'billing-cron',event_name:'suspended',event_at:new Date().toISOString(),reason:'Confirmed overdue >5 days, final notice, PayPal inactive'});
      results.push({id:sub.subscription_id,state:'suspended'});
    }else results.push({id:sub.subscription_id,state:overdue>=5*DAY?'review_required':'grace'});
   }catch(e){results.push({id:sub.subscription_id,state:'review_required',reason:'Verification, notification or Vercel action failed'});}
  }
  return json(res,200,{processed:results.length,results});
 }catch(e){return json(res,503,{error:'Billing job unavailable; no automatic suspension performed'})}
};