'use strict';
const MAIN_PROJECT='prj_7HBdNvapbweuPds58wQM4XgUo6zK';
const yes=value=>value===true||value==='TRUE';
function policy(site){
 return {manualSuspended:yes(site.manual_suspended),billingExempt:yes(site.billing_exempt),automaticSuspension:yes(site.suspension_enabled),version:Number(site.control_version||0)};
}
function protectedProject(site,inventory=[]){
 return site.vercel_project_id===MAIN_PROJECT||yes(site.protected_service)||inventory.some(p=>p.vercel_project_id===site.vercel_project_id&&/PROTECTED|SHARED/i.test(p.assignment_status||''));
}
function transition(site,command){
 const before=policy(site);
 if(!Number.isInteger(command.expectedVersion)||command.expectedVersion!==before.version)throw Error('STALE_VERSION');
 if(!['manualSuspended','billingExempt','automaticSuspension'].includes(command.field)||typeof command.value!=='boolean')throw Error('INVALID_CHANGE');
 if(typeof command.reason!=='string'||command.reason.trim().length<5||command.reason.length>500)throw Error('REASON_REQUIRED');
 if(command.field==='manualSuspended'&&command.value&&command.confirmProjectId!==site.vercel_project_id)throw Error('CONFIRM_PROJECT');
 if(command.field==='automaticSuspension'&&command.value&&!yes(site.contract_allows_suspension))throw Error('CONTRACT_REQUIRED');
 const after={...before,[command.field]:command.value,version:before.version+1};
 return {before,after,providerAction:command.field==='manualSuspended'?(command.value?'pause':'unpause'):null};
}
function automaticDecision(site){
 const p=policy(site);
 if(protectedProject(site))return 'protected';
 if(p.manualSuspended)return 'manual_block';
 if(p.billingExempt)return 'exempt';
 if(!p.automaticSuspension)return 'disabled';
 return 'review';
}
if(typeof module!=='undefined')module.exports={policy,transition,protectedProject,automaticDecision,MAIN_PROJECT};

/* Google Apps Script V8. Prepend site-policy.js; deploy only after owner authorization.
 * Script properties: HGM_CONTROL_GATEWAY_SECRET, HGM_ADMIN_EMAILS,
 * HGM_BILLING_SHEET_ID, HGM_VERCEL_TEAM_ID, VERCEL_API_TOKEN.
 * All control writes and provider calls run under the same ScriptLock.
 */
function output_(body){return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON)}
function table_(book,name,required){
 const sheet=book.getSheetByName(name);if(!sheet)throw Error('MISSING_'+name);
 let headers=sheet.getRange(1,1,1,Math.max(sheet.getLastColumn(),1)).getValues()[0];
 required.forEach(key=>{if(headers.indexOf(key)<0)headers.push(key)});
 sheet.getRange(1,1,1,headers.length).setValues([headers]);
 return {sheet,headers};
}
function records_(t){return t.sheet.getLastRow()<2?[]:t.sheet.getRange(2,1,t.sheet.getLastRow()-1,t.headers.length).getValues().map((row,i)=>Object.assign({__row:i+2},Object.fromEntries(t.headers.map((k,j)=>[k,row[j]]))))}
function write_(t,row,obj){t.sheet.getRange(row,1,1,t.headers.length).setValues([t.headers.map(k=>obj[k]===undefined?'':obj[k])]);SpreadsheetApp.flush()}
function append_(t,obj){write_(t,t.sheet.getLastRow()+1,obj)}
function provider_(id,team,verb,token){
 const path=verb?'v1/projects/'+id+'/'+verb:'v9/projects/'+id;
 const response=UrlFetchApp.fetch('https://api.vercel.com/'+path+'?teamId='+encodeURIComponent(team),{method:verb?'post':'get',headers:{Authorization:'Bearer '+token},muteHttpExceptions:true,followRedirects:false});
 if(response.getResponseCode()<200||response.getResponseCode()>=300)throw Error('VERCEL_'+response.getResponseCode());
 return JSON.parse(response.getContentText()||'{}');
}
function doPost(e){
 let lock;
 try{
  const raw=e.postData.contents;if(raw.length>16000)throw Error('INVALID_REQUEST');
  const envelope=JSON.parse(raw),props=PropertiesService.getScriptProperties();
  const secret=props.getProperty('HGM_CONTROL_GATEWAY_SECRET');if(!secret||secret.length<32)throw Error('NOT_CONFIGURED');
  if(!Number.isFinite(envelope.timestamp)||Math.abs(Date.now()-envelope.timestamp)>120000||!/^[-a-zA-Z0-9]{36}$/.test(envelope.nonce)||typeof envelope.payload!=='string')throw Error('INVALID_REQUEST');
  const bytes=Utilities.computeHmacSha256Signature(envelope.timestamp+'.'+envelope.nonce+'.'+envelope.payload,secret);
  const expected=bytes.map(b=>(b&255).toString(16).padStart(2,'0')).join('');
  let mismatch=0;const sig=String(envelope.signature||'');if(sig.length!==64)throw Error('UNAUTHORIZED');
  for(let i=0;i<64;i++)mismatch|=sig.charCodeAt(i)^expected.charCodeAt(i);
  if(mismatch)throw Error('UNAUTHORIZED');
  const payload=JSON.parse(envelope.payload),actor=String(payload.actor||'').toLowerCase(),cmd=payload.command||{};
  const admins=(props.getProperty('HGM_ADMIN_EMAILS')||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!admins.includes(actor))throw Error('UNAUTHORIZED');
  lock=LockService.getScriptLock();if(!lock.tryLock(1000))return output_({ok:false,code:409,error:'Hay otro cambio en curso. Actualiza el panel.'});
  const book=SpreadsheetApp.openById(props.getProperty('HGM_BILLING_SHEET_ID'));
  const audit=table_(book,'Audit',['request_id','before_state','after_state','result']);
  if(records_(audit).some(r=>r.request_id===envelope.nonce))throw Error('REPLAY');
  const sites=table_(book,'Sites',['manual_suspended','billing_exempt','control_version','protected_service','contract_allows_suspension','control_updated_at','control_updated_by','control_error']);
  const inventory=table_(book,'ProjectInventory',[]),site=records_(sites).find(s=>s.site_id===cmd.siteId);
  if(!site||!yes(site.managed_by_hgm))throw Error('SITE_NOT_MANAGED');
  const team=props.getProperty('HGM_VERCEL_TEAM_ID');
  if(!team||site.vercel_team_id!==team||!/^prj_[a-zA-Z0-9]+$/.test(site.vercel_project_id))throw Error('TEAM_MISMATCH');
  const inv=records_(inventory);if(!inv.some(p=>p.vercel_project_id===site.vercel_project_id&&p.vercel_team_id===team))throw Error('NOT_IN_INVENTORY');
  if(protectedProject(site,inv))throw Error('PROTECTED_PROJECT');
  const change=transition(site,cmd),token=props.getProperty('VERCEL_API_TOKEN');
  const project=provider_(site.vercel_project_id,team,null,token);
  if(project.id!==site.vercel_project_id||project.accountId!==team||project.name==='hgm-group')throw Error('OWNERSHIP_MISMATCH');
  const now=new Date().toISOString(),event={event_id:Utilities.getUuid(),entity_type:'site',entity_id:site.site_id,actor,event_name:'site-control-'+cmd.field,event_at:now,reason:cmd.reason,request_id:envelope.nonce,before_state:JSON.stringify(change.before),after_state:JSON.stringify(change.after),result:'intent'};
  append_(audit,event);
  // Persist intent before calling Vercel. Ambiguous failures retain the manual lock.
  const pending={...site,control_version:change.after.version,control_updated_at:now,control_updated_by:actor,control_error:''};
  if(cmd.field==='manualSuspended'){
   pending.manual_suspended='TRUE';pending.site_status='control_pending';
  }else if(cmd.field==='billingExempt')pending.billing_exempt=cmd.value?'TRUE':'FALSE';
  else pending.suspension_enabled=cmd.value?'TRUE':'FALSE';
  write_(sites,site.__row,pending);
  try{
   if(change.providerAction){
    provider_(site.vercel_project_id,team,change.providerAction,token);
    pending.manual_suspended=cmd.value?'TRUE':'FALSE';
    pending.site_status=cmd.value?'suspended_manual':'active';
    write_(sites,site.__row,pending);
   }
   append_(audit,{...event,event_id:Utilities.getUuid(),event_at:new Date().toISOString(),result:'applied'});
   return output_({ok:true,policy:policy(pending),siteStatus:pending.site_status});
  }catch(error){
   pending.control_error='VERIFY_PROVIDER_STATE';write_(sites,site.__row,pending);
   append_(audit,{...event,event_id:Utilities.getUuid(),event_at:new Date().toISOString(),result:'review_required'});
   return output_({ok:false,code:503,error:'El cambio requiere verificar Vercel. El bloqueo manual se conserva hasta una activación administrativa confirmada.'});
  }
 }catch(error){return output_({ok:false,code:400,error:String(error.message||'CONTROL_ERROR').slice(0,100)})}
 finally{if(lock&&lock.hasLock())lock.releaseLock()}
}
