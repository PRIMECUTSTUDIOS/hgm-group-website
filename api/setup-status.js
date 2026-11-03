'use strict';
module.exports=function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;return res.end('Method not allowed')}
  const needed=['GOOGLE_CLIENT_ID','GOOGLE_SERVICE_ACCOUNT_EMAIL','GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','VERCEL_API_TOKEN','CRON_SECRET','RESEND_API_KEY','HGM_BILLING_FROM'];
  const ready=needed.concat(['HGM_BILLING_SHEET_ID','HGM_VERCEL_TEAM_ID','HGM_ADMIN_EMAILS','HGM_CONTROL_GATEWAY_URL','HGM_CONTROL_GATEWAY_SECRET']).every(k=>Boolean(process.env[k]));
  res.setHeader('Content-Type','application/json');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({
    readyForClientTesting:ready,
    loginEnabled:Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY&&process.env.HGM_BILLING_SHEET_ID),
    billingVerificationEnabled:Boolean(process.env.PAYPAL_CLIENT_ID&&process.env.PAYPAL_CLIENT_SECRET&&process.env.PAYPAL_WEBHOOK_ID),
    notificationsEnabled:Boolean(process.env.RESEND_API_KEY&&process.env.HGM_BILLING_FROM),
    manualControlsConfigured:Boolean(process.env.HGM_CONTROL_GATEWAY_URL&&process.env.HGM_CONTROL_GATEWAY_SECRET),
    automaticSuspensionEnabled:false,
    automationStatus:'blocked_pending_end_to_end_verification'
  }));
};
