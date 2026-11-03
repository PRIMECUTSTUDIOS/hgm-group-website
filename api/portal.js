'use strict';
const {json,fail,env,uid,list,append,update,googleUser,isAdmin,paypalGet,verifyProject,reqJson}=require('./_lib');
module.exports=async function handler(req,res){
 try{
  if(req.method==='GET'&&req.query.action==='config')return json(res,200,{googleClientId:env('GOOGLE_CLIENT_ID'),paypalPlanId:'P-5SD11848RB0454849NLUV7CA'});
  const user=await googleUser(req);
  const admin=isAdmin(user);
  if(req.method==='GET'){
   const [clients,sites,subscriptions]=await Promise.all([list('Clients'),list('Sites'),list('Subscriptions')]);
   if(req.query.action==='me'){
    return json(res,200,{email:user.email,admin,sites:sites.filter(x=>admin||clients.some(c=>c.client_id===x.client_id&&c.email.toLowerCase()===user.email)).map(x=>({...x,subscription:subscriptions.find(s=>s.site_id===x.site_id)||null}))});
   }
   if(req.query.action==='vercel-projects'){
    if(!admin)throw fail('Not authorized',403);
    const team=env('HGM_VERCEL_TEAM_ID'),token=env('VERCEL_API_TOKEN');
    const payload=await reqJson('https://api.vercel.com/v9/projects?limit=100&teamId='+encodeURIComponent(team),{headers:{Authorization:'Bearer '+token}});
    return json(res,200,{teamId:team,projects:(payload.projects||[]).filter(p=>p.id&&p.name).map(p=>({id:p.id,name:p.name}))});
   }
   if(req.query.action==='admin'){
    if(!admin)throw fail('Not authorized',403);
    const [payments,notices]=await Promise.all([list('Payments'),list('Notices')]);
    return json(res,200,{clients,sites,subscriptions,payments,notices});
   }
   throw fail('Unknown action',404);
  }
  if(req.method!=='POST')throw fail('Method not allowed',405);
  if(!admin)throw fail('Administrator authorization required',403);
  const body=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}');
  const audit=async(entity,kind,reason)=>append('Audit',{event_id:uid(),entity_type:kind,entity_id:entity,actor:user.email,event_name:req.query.action,event_at:new Date().toISOString(),reason});
  if(req.query.action==='add-client'){
   const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim();
   if(!/^\S+@\S+\.\S+$/.test(email)||name.length<2)throw fail('Valid client email and name required');
   const clients=await list('Clients');if(clients.some(x=>x.email.toLowerCase()===email))throw fail('Client already exists',409);
   const id=uid();await append('Clients',{client_id:id,email,name,status:'invited',created_at:new Date().toISOString()});
   await audit(id,'client','Created client record');return json(res,201,{clientId:id});
  }
  if(req.query.action==='assign-site'){
   const clientId=String(body.clientId||''),projectId=String(body.vercelProjectId||''),teamId=String(body.vercelTeamId||'');
   if(!/^prj_[a-zA-Z0-9]+$/.test(projectId)||!/^team_[a-zA-Z0-9]+$/.test(teamId))throw fail('Exact Vercel project and team IDs are required');
   const clients=await list('Clients');if(!clients.some(c=>c.client_id===clientId))throw fail('Client not found',404);
   const sites=await list('Sites');if(sites.some(s=>s.vercel_project_id===projectId))throw fail('Project is already assigned',409);
   const project=await verifyProject(projectId,teamId);
   if(project.name==='hgm-group')throw fail('Cannot enroll HGM billing portal in suspension',403);
   const id=uid();await append('Sites',{site_id:id,client_id:clientId,domain:String(body.domain||'').trim().toLowerCase(),vercel_project_id:projectId,vercel_team_id:teamId,managed_by_hgm:'TRUE',suspension_enabled:'FALSE',site_status:'pending_payment'});
   await audit(id,'site','Assigned verified Vercel project '+projectId);return json(res,201,{siteId:id});
  }
  if(req.query.action==='link-subscription'){
   const siteId=String(body.siteId||''),subId=String(body.paypalSubscriptionId||'');
   if(!/^I-[A-Z0-9]+$/.test(subId))throw fail('PayPal subscription ID must begin I-');
   const sites=await list('Sites'),site=sites.find(s=>s.site_id===siteId);
   if(!site)throw fail('Site not found',404);
   if((await list('Subscriptions')).some(s=>s.paypal_subscription_id===subId))throw fail('Subscription already linked',409);
   const customer=(await list('Clients')).find(c=>c.client_id===site.client_id);
   const subscription=await paypalGet('/v1/billing/subscriptions/'+encodeURIComponent(subId));
   if(subscription.plan_id!=='P-5SD11848RB0454849NLUV7CA')throw fail('PayPal plan does not match HGM plan',409);
   if(subscription.subscriber?.email_address?.toLowerCase()!==customer.email.toLowerCase())throw fail('PayPal payer email does not match client; manual validation required',409);
   const id=uid();
   const lastPayment=subscription.billing_info?.last_payment;
   const actualPayment=Number(lastPayment?.amount?.value)>0&&Number.isFinite(Date.parse(lastPayment?.time||''))&&subscription.status==='ACTIVE';
   const nextDue=subscription.billing_info?.next_billing_time||'';
   await append('Subscriptions',{subscription_id:id,client_id:site.client_id,site_id:siteId,paypal_subscription_id:subId,paypal_plan_id:subscription.plan_id,due_at:nextDue,paid_through_at:actualPayment?nextDue:'',grace_expires_at:'',status:actualPayment?'active':subscription.status==='ACTIVE'?'pending_first_payment':'pending_activation',last_verified_at:new Date().toISOString()});
   await audit(id,'subscription','Linked verified PayPal billing agreement');
   return json(res,201,{subscriptionId:id,status:subscription.status});
  }
  throw fail('Unknown action',404);
 }catch(e){return json(res,e.status||500,{error:e.status?e.message:'Server error. Please contact HGM Group.'})}
};