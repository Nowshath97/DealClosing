import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Save, ShieldCheck, Upload } from 'lucide-react';

const taskConfigs = {
  'initiate-allocations': { title:'Initiate Allocations', subtitle:'Establish the initial investor/fund allocation set for this deal.', fields:['Total Deal Allocation','Allocation Method','Allocation Effective Date','Allocation Notes'] },
  'finalize-allocations': { title:'Finalize Allocations', subtitle:'Review and lock the approved allocation set before downstream closing activities.', fields:['Final Allocated Amount','Variance to Target','Approval Reference','Finalization Notes'] },
  'pre-commitment-review': { title:'AMGO Pre-Commitment Review', subtitle:'Document pre-commitment ethics and compliance review before investment commitment.', fields:['Review Outcome','Conflicts Identified','Restricted List Check','Reviewer Comments'] },
  'controls-review': { title:'Compliance & Risk Controls Review', subtitle:'Assess required control evidence and outstanding compliance conditions.', fields:['Control Assessment','Open Conditions','Risk Rating','Reviewer Comments'] },
  'aml-kya-review': { title:'AML / KYA Controls Review', subtitle:'Capture anti-money laundering and Know Your Asset / counterparty diligence checks.', fields:['AML Status','KYC/KYA Status','Sanctions Screening','Diligence Notes'] }
};

export default function TaskPage({deal,module,task,onBack,onComplete,embedded=false}) {
  const cfg=taskConfigs[task.id] || {title:task.name,subtitle:`Complete the ${module.title} task for ${deal.investmentName}.`,fields:['Status','Owner Confirmation','Reference','Comments']};
  const [completed,setCompleted]=useState(task.taskStatus==='completed');
  const [saved,setSaved]=useState(false);const [saveError,setSaveError]=useState('');
  const [values,setValues]=useState({});
  const update=(k,v)=>setValues(s=>({...s,[k]:v}));
  return <div className={embedded?'task-embedded':'workspace-page'}>
    {!embedded&&<button className="back-link" onClick={onBack}><ArrowLeft size={16}/> Back to {deal.investmentName}</button>}
    {!embedded&&<div className="page-title-row task-page-title"><div><p className="eyebrow">{module.title.toUpperCase()}</p><h1>{cfg.title}</h1><p>{cfg.subtitle}</p></div><span className={`status-badge ${completed?'closed':''}`}>{completed?'Completed':task.taskStatus==='overdue'?'Overdue':'In Progress'}</span></div>}
    <div className="task-workspace-grid">
      <section className="workspace-card form-card">
        <div className="section-heading"><div><h2>Task Details</h2><p>Deal: {deal.investmentName} · Due {task.date}</p></div></div>
        <div className="form-grid">
          {cfg.fields.map((label,i)=><label className={i===cfg.fields.length-1?'full-span':''} key={label}><span>{label}</span>{label.toLowerCase().includes('notes')||label.toLowerCase().includes('comments')?<textarea rows="4" value={values[label]||''} onChange={e=>update(label,e.target.value)} placeholder={`Enter ${label.toLowerCase()}`}/>:label.includes('Date')?<input type="date" value={values[label]||''} onChange={e=>update(label,e.target.value)}/>:<input value={values[label]||''} onChange={e=>update(label,e.target.value)} placeholder={`Enter ${label.toLowerCase()}`}/>}</label>)}
        </div>
        <div className="attachment-drop"><Upload size={20}/><div><strong>Supporting evidence</strong><span>POC upload area for approvals, review evidence or allocation workpapers.</span></div><button className="secondary-action">Choose File</button></div>
        {saveError&&<div className="form-error">{saveError}</div>}{saved&&<div className="success-message"><CheckCircle2 size={17}/> Task details saved for this session.</div>}
        <div className="form-actions"><button className="secondary-action" onClick={()=>setSaved(true)}><Save size={16}/> Save Draft</button><button className="primary-action" onClick={async()=>{try{await onComplete?.(task.id);setSaved(true);setCompleted(true)}catch(e){setSaveError(e.message)}}}><CheckCircle2 size={16}/> Complete Task</button></div>
      </section>
      <aside className="workspace-card task-context"><ShieldCheck size={24}/><h3>Workflow Context</h3><dl><div><dt>Assigned To</dt><dd>{task.assignedTo}</dd></div><div><dt>Module</dt><dd>{module.title}</dd></div><div><dt>Deal</dt><dd>{deal.investmentName}</dd></div><div><dt>Target Close</dt><dd>{deal.targetCloseDate}</dd></div></dl><p>Completing this task records the workflow step in the POC. A production implementation can persist this state and trigger the next eligible task.</p></aside>
    </div>
  </div>;
}
