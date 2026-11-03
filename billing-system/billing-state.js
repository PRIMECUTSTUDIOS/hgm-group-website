'use strict';
/**
 * HGM Group billing state evaluator.
 * Pure logic only. It NEVER calls Vercel or suspends a website.
 * All inputs must come from trusted, authenticated server-side sources.
 */
const DAY=24*60*60*1000;
const GRACE_DAYS=5;
function evaluateBilling(input,now=new Date()){
 const nowMs=new Date(now).getTime();
 const dueMs=new Date(input.dueAt).getTime();
 if(!Number.isFinite(nowMs)||!Number.isFinite(dueMs))throw Error('Invalid date');
 const reasons=[];
 // Any ambiguity leaves the website online for human review.
 if(input.managedByHGM!==true||input.suspensionEnabled!==true) reasons.push('NOT_ENROLLED');
 if(input.paypalVerified!==true||input.verifiedAt===undefined)reasons.push('PAYPAL_NOT_VERIFIED');
 else if(nowMs-new Date(input.verifiedAt).getTime()>DAY||!Number.isFinite(new Date(input.verifiedAt).getTime()))reasons.push('STALE_VERIFICATION');
 if(input.hasDispute===true||input.hasExtension===true)reasons.push('CUSTOMER_EXCEPTION');
 if(input.webhookHealthy!==true)reasons.push('WEBHOOK_UNHEALTHY');
 if(input.invoicesReconciled!==true)reasons.push('UNRECONCILED_INVOICE');
 if(input.ownershipVerified!==true)reasons.push('SITE_OWNERSHIP_UNVERIFIED');
 if(input.noticeDelivered!==true)reasons.push('NOTIFICATION_NOT_DELIVERED');
 const paidMs=input.paidThroughAt?new Date(input.paidThroughAt).getTime():NaN;
 if(input.paymentConfirmed===true && Number.isFinite(paidMs)&&paidMs>=dueMs){
   return {state:'active',maySuspend:false,reason:'PAID',graceExpiresAt:null};
 }
 const graceExpiresAt=new Date(dueMs+GRACE_DAYS*DAY).toISOString();
 if(reasons.length)return {state:'review_required',maySuspend:false,reason:reasons.join(','),graceExpiresAt};
 if(nowMs<=dueMs)return {state:'active',maySuspend:false,reason:'NOT_DUE',graceExpiresAt};
 if(nowMs<dueMs+GRACE_DAYS*DAY)return {state:'grace',maySuspend:false,reason:'WITHIN_5_DAY_GRACE',graceExpiresAt};
 // Gate may suspend only if PayPal was checked after the entire grace period.
 if(new Date(input.verifiedAt).getTime()<dueMs+GRACE_DAYS*DAY){
   return {state:'review_required',maySuspend:false,reason:'VERIFY_AFTER_GRACE',graceExpiresAt};
 }
 return {state:'eligible_for_manual_review',maySuspend:false,reason:'GRACE_EXPIRED_VERIFIED_UNPAID',graceExpiresAt};
}
module.exports={evaluateBilling,GRACE_DAYS};