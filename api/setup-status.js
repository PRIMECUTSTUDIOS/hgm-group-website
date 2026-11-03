'use strict';
module.exports=function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;return res.end('Method not allowed')}
  const needed=['GOOGLE_CLIENT_ID','GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','VERCEL_API_TOKEN','CRON_SECRET','RESEND_API_KEY','HGM_BILLING_FROM'];
  const ready=needed.every(k=>Boolean(process.env[k]));
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({
    readyForClientTesting:ready,
    loginEnabled:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    billingVerificationEnabled:Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET&&process.env.PAYPAL_WEBHOOK_ID),
    notificationsEnabled:Boolean(process.env.RESEND_API_KEY&&process.env.HGM_BILLING_FROM),
    automaticSuspensionEnabled:ready&&process.env.HGM_AUTO_SUSPEND==='true'&&Boolean(process.env.HGM_SUSPEND_PROJECT_IDS)
  }));
};