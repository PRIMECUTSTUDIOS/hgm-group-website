'use strict';
const {json,env,uid,list,append,update,paypalToken,reqJson}=require('./_lib');
module.exports=async function handler(req,res){
 if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
 try{
  const event=typeof req.body==='object'?req.body:JSON.parse(req.body||'{}');
  const {root,token}=await paypalToken();
  const body={
   auth_algo:req.headers['paypal-auth-algo'],
   cert_url:req.headers['paypal-cert-url'],
   transmission_id:req.headers['paypal-transmission-id'],
   transmission_sig:req.headers['paypal-transmission-sig'],
   transmission_time:req.headers['paypal-transmission-time'],
   webhook_id:env('PAYPAL_WEBHOOK_ID'),
   webhook_event:event
  };
  if(!body.transmission_id||!body.transmission_sig||!event.id) return json(res,400,{error:'Invalid webhook'});
  const verification=await reqJson(root+'/v1/notifications/verify-webhook-signature',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(verification.verification_status!=='SUCCESS')return json(res,401,{error:'Webhook signature invalid'});
  const seen=await list('WebhookEvents');
  if(seen.some(e=>e.paypal_event_id===event.id))return json(res,200,{received:true,duplicate:true});
  const type=event.event_type,resource=event.resource||{};
  const paypalId=(type==='PAYMENT.SALE.COMPLETED'||type==='PAYMENT.SALE.REVERSED'||type==='PAYMENT.SALE.REFUNDED')?resource.billing_agreement_id:resource.id;
  const subs=await list('Subscriptions');
  const s=subs.find(x=>x.paypal_subscription_id===paypalId);
  // A signed event from a different subscription must never change a mapped client.
  if(s){
   const now=new Date().toISOString();
   if(type==='BILLING.SUBSCRIPTION.PAYMENT.FAILED'){
    const due=resource.billing_info?.last_failed_payment?.time||event.create_time||now;
    await update('Subscriptions',s.__row,{...s,status:'grace',due_at:due,grace_expires_at:new Date(new Date(due).getTime()+5*86400000).toISOString(),last_verified_at:now});
   }else if(type==='PAYMENT.SALE.COMPLETED'){
    // Reconcile actual payment detail via PayPal REST at the next scheduled check.
    await append('Payments',{payment_id:uid(),subscription_id:s.subscription_id,paypal_event_id:event.id,amount_usd:resource.amount?.total||'',paid_at:resource.create_time||event.create_time||now,verified_at:now,status:'paypal_signed_event'});
   }else if(['PAYMENT.SALE.REVERSED','PAYMENT.SALE.REFUNDED','BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.SUSPENDED','BILLING.SUBSCRIPTION.EXPIRED'].includes(type)){
    await update('Subscriptions',s.__row,{...s,status:'review_required',last_verified_at:now});
   }
  }
  await append('WebhookEvents',{paypal_event_id:event.id,event_type:type,processed_at:new Date().toISOString(),result:s?'matched':'unmatched'});
  return json(res,200,{received:true});
 }catch(e){return json(res,503,{error:'Webhook not processed; retry requested'})}
};