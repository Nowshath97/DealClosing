import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { TASK_RULES, tasksForNewDeal, norm } from '../src/taskRules.js';

const PORT = Number(process.env.API_PORT || 3001);
// Match vite.config.js precedence so the API and UI always query the same Supabase project
// when both VITE_* and unprefixed credentials are present.
const URL_BASE = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
if (!URL_BASE || !ANON_KEY) { console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY'); process.exit(1); }
const json = (res, status, body) => { res.writeHead(status, {'Content-Type':'application/json','Access-Control-Allow-Origin':process.env.CORS_ORIGIN || 'http://localhost:5173','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}); res.end(JSON.stringify(body)); };
async function db(path, token, {method='GET',body,prefer}={}) {
  const response = await fetch(`${URL_BASE}/rest/v1/${path}`, {method,headers:{apikey:ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const content=await response.text();
  if(!response.ok) {const e=new Error(content || `Supabase error ${response.status}`);e.status=response.status;throw e;}
  return content?JSON.parse(content):null;
}
const refs=(name,token)=>db(`${name}?select=id,value&is_active=eq.true&order=id`,token);
const pick=(rows,key)=>rows.find(r=>norm(r.value)===norm(key))?.id ?? null;
const bool=v=>v===true||v==='Yes';
const blank=v=>String(v??'').trim()||null;
const field=(row,...names)=>{for(const name of names){const key=Object.keys(row||{}).find(k=>k.toLowerCase().replace(/[^a-z]/g,'')===name);if(key&&row[key]!=null&&row[key]!=='')return row[key];}return '';};
const userSummary=row=>{const email=String(field(row,'email','emailaddress','mail'));const name=String(field(row,'name','fullname','displayname','username')||[field(row,'firstname'),field(row,'lastname')].filter(Boolean).join(' ')||email);return {id:field(row,'id','userid'),name,email};};
async function loadDealContext(token,{dealCode,limit=300,includeTasks=true}={}){
  const select='deal_code,name,project_name,sponsor_gp,investment_type_detail,currency,commitment_usd,target_closing_date,target_funding_date,ic_approval,legal_lead,type,dealType:ref_deal_type(value),dealStatus:ref_deal_status(value),milestoneRef:ref_deal_milestone(value),task(*,name:ref_task_name(value),statusRef:ref_task_status(value),response:task_response(answers,answer,confirmation_date,confirmation_by,answered_by,answered_on))';
  const q=dealCode?`&deal_code=eq.${encodeURIComponent(dealCode)}`:'';
  const rows=await db(`deal?select=${encodeURIComponent(select)}${q}&order=created_on.desc&limit=${limit}`,token);
  if(dealCode&&!rows.length)return null;
  const leadIds=new Set(rows.filter(d=>(d.task||[]).some(t=>norm(t.name?.value)==='assignlegallead'&&/^(completed|complete|done)$/i.test(t.statusRef?.value||''))&&d.legal_lead!=null).map(d=>String(d.legal_lead)));
  const users=leadIds.size?await db(`users?id=in.(${[...leadIds].map(encodeURIComponent).join(',')})&select=*`,token):[];
  const userById=new Map(users.map(u=>[String(field(u,'id','userid')),userSummary(u)]));
  const deals=rows.map(d=>{
    const tasks=d.task||[];
    const legalTask=tasks.find(t=>norm(t.name?.value)==='assignlegallead');
    const taskCompleted=/^(completed|complete|done)$/i.test(legalTask?.statusRef?.value||'');
    const user=taskCompleted&&d.legal_lead!=null?userById.get(String(d.legal_lead))||null:null;
    return {
      dealCode:d.deal_code,dealName:d.name,projectName:d.project_name||null,sponsor:d.sponsor_gp||null,
      investmentType:d.dealType?.value||null,investmentTypeDetail:d.investment_type_detail||null,
      dealStatus:d.dealStatus?.value||null,milestone:d.milestoneRef?.value||null,
      currency:d.currency||null,commitmentUsd:d.commitment_usd??null,targetClosingDate:d.target_closing_date||null,targetFundingDate:d.target_funding_date||null,
      icApproved:d.ic_approval??null,assignLegalLeadTaskStatus:legalTask?.statusRef?.value||'Not created',
      legalLead:user?{name:user.name,email:user.email||null}:null,
      tasks:includeTasks?tasks.map(t=>{const r=Array.isArray(t.response)?t.response[0]:t.response;return {name:t.name?.value||'Task',status:t.statusRef?.value||'Unknown',assignedTo:t.assigned_to||null,completedBy:t.completed_by||null,completedDate:t.completed_date||null,dueDate:t.due_date||null,answers:r?.answers||null,answer:r?.answer||null,confirmationDate:r?.confirmation_date||null,confirmationBy:r?.confirmation_by||null,answeredBy:r?.answered_by||null,answeredOn:r?.answered_on||null};}):undefined
    };
  });
  return {generatedAt:new Date().toISOString(),totalDeals:deals.length,dealCode:dealCode||null,deals};
}
const code=()=>{let s;do{s=[...randomBytes(15)].map(n=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[n%36]).join('')}while(!/[A-Z]/.test(s)||!/[0-9]/.test(s));return s;};
async function createDeal(form,token,email){
  for(const k of ['investmentName','projectName','investmentType','commitment','targetCloseDate','relationshipLead','executionTeamMember','executionLocation']) if(!String(form[k]??'').trim()) throw Object.assign(new Error(`${k} is required`),{status:400});
  if(!Number.isFinite(Number(form.commitment))||Number(form.commitment)<=0)throw Object.assign(new Error('commitment must be positive'),{status:400});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(form.targetCloseDate))throw Object.assign(new Error('targetCloseDate must be YYYY-MM-DD'),{status:400});
  const [types,statuses,milestones,funding,names,activities,taskStatuses,map]=await Promise.all([refs('ref_deal_type',token),refs('ref_deal_status',token),refs('ref_deal_milestone',token),refs('ref_funding_required',token),refs('ref_task_name',token),refs('ref_deal_activity',token),refs('ref_task_status',token),db('task_activity_map?select=*',token).catch(()=>[])]);
  const type=types.find(r=>r.value===form.investmentType)?.id;
  if(type==null)throw Object.assign(new Error('Unknown investmentType'),{status:400});
  const icApproved=bool(form.icApproved), fundingRequired=bool(form.fundingRequired);
  const fundingId=funding.find(r=>{const v=norm(r.value);return (v==='yes'||v==='true'||(v.includes('required')&&!v.includes('not')&&!v.includes('no')))===fundingRequired})?.id??null;
  let id;
  for(let i=0;i<5;i++){
    id=code();
    try {await db('deal',token,{method:'POST',prefer:'return=minimal',body:{deal_code:id,name:form.investmentName.trim(),project_name:blank(form.projectName),sponsor_gp:blank(form.sponsor),investment_type_detail:blank(form.investmentTypeDetail),investment_type_detail_id:form.investmentTypeDetailId?Number(form.investmentTypeDetailId):null,relationship_lead:Number(form.relationshipLead),execution_team_member:Number(form.executionTeamMember),execution_location:blank(form.executionLocation),execution_type:blank(form.executionType||'Direct'),asset_class:blank(form.assetClass),region:blank(form.region),type,status:pick(statuses,'Active')??statuses[0]?.id,milestone:pick(milestones,'IC Approved')??milestones[0]?.id,currency:form.currency||'USD',is_funding_required:fundingId,commitment_funding_currency:Number(form.commitment),commitment_usd:(form.currency||'USD')==='USD'?Number(form.commitment):null,target_closing_date:form.targetCloseDate,ic_approval:icApproved}});break;}catch(e){if(i===4||!(/409|23505|duplicate/i.test(e.message)))throw e;}
  }
  const taskKeys=tasksForNewDeal({icApproved,fundingRequired});
  const missing=[];
  const tasks=taskKeys.flatMap(key=>{const taskId=pick(names,key);if(taskId==null){missing.push(key);return [];}const mapped=map.find(m=>m.task_id===taskId&&m.activity_id!=null);return [{task_id:taskId,deal_code:id,activity_id:mapped?.activity_id??pick(activities,TASK_RULES[key].activity),status:pick(taskStatuses,'Not Started')??taskStatuses[0]?.id,created_by:email}];});
  try {if(tasks.length)await db('task',token,{method:'POST',prefer:'return=minimal',body:tasks});}catch(e){e.message=`Deal ${id} created, but workflow task creation failed: ${e.message}`;throw e;}
  return {dealCode:id,missingTaskReferences:missing};
}
async function run(req,res){
  if(req.method==='OPTIONS')return json(res,204,{});
  const u=new URL(req.url,'http://localhost');const path=u.pathname;
  if(path==='/api/health'&&req.method==='GET')return json(res,200,{status:'ok'});
  const token=req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return json(res,401,{error:'Bearer access token required'});
  const auth=await fetch(`${URL_BASE}/auth/v1/user`,{headers:{apikey:ANON_KEY,Authorization:`Bearer ${token}`}});
  if(!auth.ok)return json(res,401,{error:'Invalid or expired Supabase session'});
  const user=await auth.json();
  let body={};if(req.method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1_000_000)throw Object.assign(new Error('Request too large'),{status:413});}try{body=JSON.parse(raw||'{}')}catch{throw Object.assign(new Error('Invalid JSON'),{status:400})}}
  if(path==='/api/deals'&&req.method==='POST')return json(res,201,await createDeal(body,token,user.email));
  if(path==='/api/deals'&&req.method==='GET')return json(res,200,await db('deal?select=*&order=created_on.desc',token));
  if(path==='/api/deal-context'&&req.method==='GET'){
    const dealCode=u.searchParams.get('dealCode')||undefined;
    const requestedLimit=Number(u.searchParams.get('limit')||300);
    const limit=Number.isInteger(requestedLimit)?Math.max(1,Math.min(300,requestedLimit)):300;
    const includeTasks=u.searchParams.get('includeTasks')!=='false';
    const context=await loadDealContext(token,{dealCode,limit,includeTasks});
    return context?json(res,200,context):json(res,404,{error:'Deal not found'});
  }
  const taskMatch=path.match(/^\/api\/deals\/([A-Za-z0-9]+)\/tasks$/);
  if(taskMatch && req.method==='GET'){
    const dealCode=taskMatch[1],q=encodeURIComponent(dealCode);
    const deals=await db(`deal?deal_code=eq.${q}&select=deal_code,name`,token);
    if(!deals.length)return json(res,404,{error:'Deal not found'});
    const tasks=await db(`task?deal_code=eq.${q}&select=*,name:ref_task_name(value),statusRef:ref_task_status(value)`,token);
    const today=new Date().toISOString().slice(0,10);
    const normalized=tasks.map(t=>{
      const status=t.statusRef?.value||'Unknown';
      const complete=/^(completed|complete|done)$/i.test(status);
      const skipped=/^(not required|not applicable|skipped)$/i.test(status);
      return {id:t.id,name:t.name?.value||'Task',status,assignedTo:t.assigned_to||t.assignee||null,completedBy:t.completed_by||null,dueDate:t.due_date||null,overdue:!complete&&!skipped&&!!t.due_date&&t.due_date<today,pending:!complete&&!skipped};
    });
    return json(res,200,{dealCode,dealName:deals[0].name,summary:{total:normalized.length,completed:normalized.filter(t=>!t.pending&&!/^(not required|not applicable|skipped)$/i.test(t.status)).length,pending:normalized.filter(t=>t.pending).length,overdue:normalized.filter(t=>t.overdue).length},tasks:normalized});
  }
  const match=path.match(/^\/api\/deals\/([A-Za-z0-9]+)(?:\/allocations(?:\/(initiate))?)?$/);
  if(match){const dealCode=match[1],q=encodeURIComponent(dealCode);
    if(path.endsWith('/allocations/initiate')&&req.method==='POST'){
      const exists=await db(`deal?deal_code=eq.${q}&select=deal_code`,token);if(!exists.length)return json(res,404,{error:'Deal not found'});
      if(body.deal_code&&body.deal_code!==dealCode)return json(res,400,{error:'deal_code mismatch'});
      if(!body.header||!Array.isArray(body.lines)||!body.lines.length)return json(res,400,{error:'header and nonempty lines required'});
      const exposure=Number(body.header.total_adjusted_exposure),allocated=body.lines.reduce((s,l)=>s+Number(l.adjusted_exposure||0),0);
      if(!Number.isFinite(exposure)||exposure<=0||Math.abs(exposure-allocated)>0.005)return json(res,400,{error:'Allocation total must equal positive adjusted exposure'});
      if(![0,1].includes(Number(body.header.funding_required)))return json(res,400,{error:'funding_required must be 0 or 1'});
      if(!Array.isArray(body.legal_map)||!Array.isArray(body.closes)||!body.closes.length)return json(res,400,{error:'legal_map and at least one close required'});
      const p={...body,deal_code:dealCode,user:user.email,header:{...body.header,status:'Initiated'},comments:body.comments||[],documents:body.documents||[]};
      await db('rpc/save_allocation',token,{method:'POST',body:{p}});
      return json(res,200,{dealCode,status:'Initiated',message:'Allocation saved; workflow task completion remains separate'});
    }
    if(path.endsWith('/allocations')&&req.method==='GET'){
      const [header,storedLines,legalMap,closes,comments,documents,fundAllocations]=await Promise.all(['allocation','allocation_line','allocation_legal_map','fund_closes','deal_comment','deal_document','fund_allocations'].map(t=>db(`${t}?deal_code=eq.${q}&select=*`,token)));
      const lines=storedLines.map(line=>{
        const fund=fundAllocations.find(f=>f.fund_close_id==null&&f.entity_id===line.entity_id);
        return fund?{...line,adjusted_exposure:fund.amount_invested,percentage:fund.allocation_pct,expenses_amount:fund.expenses_amount}:line;
      });
      return json(res,200,{header:header[0]||null,lines,legalMap,closes,comments,documents,fundAllocations});
    }
    if(!path.includes('/allocations')&&req.method==='GET'){
      const rows=await db(`deal?deal_code=eq.${q}&select=*`,token);return rows.length?json(res,200,rows[0]):json(res,404,{error:'Deal not found'});
    }
  }
  return json(res,404,{error:'Route not found'});
}
http.createServer((req,res)=>{run(req,res).catch(e=>json(res,e.status>=400&&e.status<500?e.status:500,{error:e.message}))}).listen(PORT,()=>console.log(`Deal API listening on http://localhost:${PORT}`));
