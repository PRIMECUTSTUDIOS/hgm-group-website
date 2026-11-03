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
