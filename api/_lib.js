'use strict';
const crypto=require('node:crypto');
const SHEET=process.env.HGM_BILLING_SHEET_ID;
const BASE='https://sheets.googleapis.com/v4/spreadsheets/';
const uid=()=>crypto.randomUUID();
const json=(res,code,payload)=>{res.statusCode=code;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(payload));};
const fail=(message,code=400)=>Object.assign(new Error(message),{status:code});
function env(name){if(!process.env[name])throw fail('Missing server configuration: '+name,503);return process.env[name]}
async function reqJson(url,options={}){
 const r=await fetch(url,{signal:AbortSignal.timeout(15000),...options});const body=await r.text();let val;try{val=JSON.parse(body)}catch{val={raw:body.slice(0,200)}}
 if(!r.ok)throw fail('Upstream service error ('+r.status+')',502);
 return val;
}
let cache={token:null,until:0};
async function sheetsToken(){
 if(cache.token&&Date.now()<cache.until)return cache.token;
 const email=env('GOOGLE_SERVICE_ACCOUNT_EMAIL');
 const raw=env('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g,'\n');
 const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const h=enc({alg:'RS256',typ:'JWT'}),p=enc({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500});
 const assertion=h+'.'+p+'.'+crypto.createSign('RSA-SHA256').update(h+'.'+p).sign(raw,'base64url');
 const v=await reqJson('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 cache={token:v.access_token,until:Date.now()+((v.expires_in||3500)-90)*1000};return cache.token;
}
async function sheetRequest(path,method='GET',body){
 const token=await sheetsToken();return reqJson(BASE+encodeURIComponent(env('HGM_BILLING_SHEET_ID'))+'/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
}
function columnName(n){let out='';while(n){n--;out=String.fromCharCode(65+n%26)+out;n=Math.floor(n/26)}return out}
function a1(name){return encodeURIComponent("'"+name+"'!A1:Z")}
function valuesObject(rows){const headers=rows[0]||[];return rows.slice(1).map((row,i)=>Object.assign({__row:i+2},Object.fromEntries(headers.map((col,j)=>[col,row[j]||'']))));}
async function list(sheet){const v=await sheetRequest('values/'+a1(sheet));return valuesObject(v.values||[])}
async function append(sheet,record){
 const hdr=(await sheetRequest('values/'+encodeURIComponent("'"+sheet+"'!A1:Z1"))).values?.[0]||[];
 if(!hdr.length)throw fail('Ledger schema unavailable',503);
 const values=hdr.map(k=>String(record[k]??''));
 await sheetRequest('values/'+encodeURIComponent("'"+sheet+"'!A1:Z")+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:[values]});
}
async function update(sheet,row,record){
 if(!Number.isInteger(row)||row<2)throw fail('Invalid sheet row');
 const hdr=(await sheetRequest('values/'+encodeURIComponent("'"+sheet+"'!A1:Z1"))).values?.[0]||[];
 const values=hdr.map(k=>String(record[k]??''));
 await sheetRequest('values/'+encodeURIComponent("'"+sheet+"'!A"+row+':'+columnName(hdr.length)+row)+'?valueInputOption=RAW','PUT',{values:[values]});
}
async function googleUser(req){
 const header=req.headers.authorization||'';if(!header.startsWith('Bearer '))throw fail('Login required',401);
 const raw=header.slice(7);if(raw.length>6000)throw fail('Invalid token',401);
 const v=await reqJson('https://oauth2.googleapis.com/tokeninfo?id_token='+encodeURIComponent(raw));
 if(v.aud!==env('GOOGLE_CLIENT_ID')||!['accounts.google.com','https://accounts.google.com'].includes(v.iss)||![true,'true'].includes(v.email_verified)||!Number.isFinite(Number(v.exp))||Number(v.exp)*1000<=Date.now()||typeof v.email!=='string')throw fail('Login verification failed',401);
 return {email:v.email.toLowerCase(),sub:v.sub};
}
function isAdmin(u){return (process.env.HGM_ADMIN_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).includes(u.email)}
async function paypalToken(){
 const client=env('PAYPAL_CLIENT_ID'),secret=env('PAYPAL_CLIENT_SECRET');
 const root=process.env.PAYPAL_MODE==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
 const v=await reqJson(root+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(client+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
 return {root,token:v.access_token};
}
async function paypalGet(path){
 const {root,token}=await paypalToken();return reqJson(root+path,{headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
}
async function verifyProject(id,team){
 const t=env('VERCEL_API_TOKEN');const url='https://api.vercel.com/v9/projects/'+encodeURIComponent(id)+(team?'?teamId='+encodeURIComponent(team):'');
 const p=await reqJson(url,{headers:{Authorization:'Bearer '+t}});
 if(p.id!==id||team&&p.accountId!==team)throw fail('Project ownership mismatch',403);
 return p;
}
module.exports={json,fail,env,uid,list,append,update,googleUser,isAdmin,paypalGet,paypalToken,verifyProject,reqJson};
