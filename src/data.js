export const seedDeals = [
  { id:'DL-1001', investmentName:'Auto_2909_1', projectName:'Project Atlas', investmentType:'Co-Investment', investmentTypeDetail:'Co-Investment - Mid-Life', dateCreated:'09/29/2026', daysToClose:7, icApproved:'Yes', readyToClose:'No', closed:'No', currency:'USD', commitment:'75,000,000', targetCloseDate:'10/07/2026', sponsor:'Atlas Capital Partners', region:'North America', dealLead:'Test User', status:'Active' },
  { id:'DL-1002', investmentName:'Auto_2809_1', projectName:'Project Summit', investmentType:'Co-Investment', investmentTypeDetail:'Co-Investment - Mid-Life', dateCreated:'09/28/2026', daysToClose:6, icApproved:'Yes', readyToClose:'No', closed:'No', currency:'USD', commitment:'50,000,000', targetCloseDate:'10/06/2026', sponsor:'Summit Equity', region:'North America', dealLead:'Jason Adams', status:'Active' },
  { id:'DL-1003', investmentName:'Primary_2809_1', projectName:'Project Horizon', investmentType:'Primary', investmentTypeDetail:'Primary Fund Investment', dateCreated:'09/28/2026', daysToClose:6, icApproved:'Yes', readyToClose:'Yes', closed:'No', currency:'EUR', commitment:'40,000,000', targetCloseDate:'10/06/2026', sponsor:'Horizon Partners', region:'Europe', dealLead:'John Smith', status:'Active' },
  { id:'DL-1004', investmentName:'Secondary_2709_1', projectName:'Project Falcon', investmentType:'Secondary', investmentTypeDetail:'Secondary - LP Interests', dateCreated:'09/27/2026', daysToClose:5, icApproved:'Yes', readyToClose:'Yes', closed:'No', currency:'USD', commitment:'90,000,000', targetCloseDate:'10/05/2026', sponsor:'Falcon GP', region:'North America', dealLead:'Bill Root', status:'Active' },
  { id:'DL-1005', investmentName:'CoInvest_2609_1', projectName:'Project Nova', investmentType:'Co-Investment', investmentTypeDetail:'Co-Investment - Direct', dateCreated:'09/26/2026', daysToClose:4, icApproved:'Yes', readyToClose:'No', closed:'No', currency:'USD', commitment:'30,000,000', targetCloseDate:'10/04/2026', sponsor:'Nova Holdings', region:'Asia Pacific', dealLead:'Axl Heck', status:'Active' },
  { id:'DL-1006', investmentName:'Primary_2509_2', projectName:'Project Redwood', investmentType:'Primary', investmentTypeDetail:'Primary Fund Investment', dateCreated:'09/25/2026', daysToClose:3, icApproved:'Yes', readyToClose:'Yes', closed:'Yes', currency:'USD', commitment:'60,000,000', targetCloseDate:'10/03/2026', sponsor:'Redwood Investments', region:'North America', dealLead:'Zack Abraham', status:'Closed' },
  { id:'DL-1007', investmentName:'Secondary_2409_1', projectName:'Project Phoenix', investmentType:'Secondary', investmentTypeDetail:'Secondary - GP Led', dateCreated:'09/24/2026', daysToClose:2, icApproved:'Yes', readyToClose:'Yes', closed:'Yes', currency:'GBP', commitment:'35,000,000', targetCloseDate:'10/02/2026', sponsor:'Phoenix Capital', region:'Europe', dealLead:'Test User', status:'Closed' },
  { id:'DL-1008', investmentName:'Auto_2309_3', projectName:'Project Mercury', investmentType:'Co-Investment', investmentTypeDetail:'Co-Investment - Mid-Life', dateCreated:'09/23/2026', daysToClose:10, icApproved:'No', readyToClose:'No', closed:'No', currency:'USD', commitment:'25,000,000', targetCloseDate:'10/10/2026', sponsor:'Mercury Partners', region:'North America', dealLead:'Jason Adams', status:'Active' },
  { id:'DL-1009', investmentName:'Primary_2209_1', projectName:'Project Everest', investmentType:'Primary', investmentTypeDetail:'Primary Fund Investment', dateCreated:'09/22/2026', daysToClose:12, icApproved:'No', readyToClose:'No', closed:'No', currency:'USD', commitment:'45,000,000', targetCloseDate:'10/12/2026', sponsor:'Everest Fund Management', region:'Asia Pacific', dealLead:'John Smith', status:'Active' },
  { id:'DL-1010', investmentName:'Secondary_2109_2', projectName:'Project Orion', investmentType:'Secondary', investmentTypeDetail:'Secondary - LP Interests', dateCreated:'09/21/2026', daysToClose:15, icApproved:'Yes', readyToClose:'No', closed:'No', currency:'USD', commitment:'80,000,000', targetCloseDate:'10/15/2026', sponsor:'Orion Advisors', region:'North America', dealLead:'Bill Root', status:'Active' }
];

export const dealModules = [
  { id:'investment-allocations', title:'Investment Allocations', desc:'Manage deal level and close level allocations', status:'In Progress', progress:'1 / 2', tone:'green', tasks:[
    { id:'initiate-allocations', name:'Initiate Allocations', date:'09/30/2026', assignedTo:'Investment Team', taskStatus:'inProgress' },
    { id:'finalize-allocations', name:'Finalize Allocations', date:'10/02/2026', assignedTo:'Investment Operations', taskStatus:'pending' }
  ]},
  { id:'risk-compliance', title:'Ethics & Compliance', desc:'Complete ethics, compliance and risk requirements', status:'Overdue', progress:'0 / 3', tone:'orange', tasks:[
    { id:'pre-commitment-review', name:'Complete AMGO Pre-Commitment Review', date:'09/25/2026', assignedTo:'US AMGO', taskStatus:'inProgress' },
    { id:'controls-review', name:'Complete Compliance and Risk Controls Review', date:'08/31/2026', assignedTo:'Controls Review', taskStatus:'overdue' },
    { id:'aml-kya-review', name:'Complete AML/KYA Controls Review', date:'08/31/2026', assignedTo:'AML/KYA Controls Review', taskStatus:'overdue' }
  ]},
  { id:'legal-entity', title:'Legal Entity Management', desc:'Manage legal entities and documentation', status:'In Progress', progress:'1 / 2', tone:'purple', tasks:[
    { id:'validate-legal-entity', name:'Validate Legal Entity', date:'09/27/2026', assignedTo:'Legal Operations', taskStatus:'completed' },
    { id:'confirm-entity-docs', name:'Confirm Entity Documentation', date:'09/30/2026', assignedTo:'Legal Team', taskStatus:'inProgress' }
  ]},
  { id:'investment-docs', title:'Investment Docs', desc:'Upload and track investment documents', status:'Not Started', progress:'0 / 2', tone:'blue', tasks:[
    { id:'upload-executed-docs', name:'Upload Executed Investment Documents', date:'10/01/2026', assignedTo:'Deal Team', taskStatus:'pending' },
    { id:'validate-docs', name:'Validate Closing Documents', date:'10/02/2026', assignedTo:'Legal Team', taskStatus:'pending' }
  ]},
  { id:'funding', title:'Funding', desc:'Track funding activities and settlement readiness', status:'Not Started', progress:'0 / 2', tone:'teal', tasks:[
    { id:'funding-instructions', name:'Confirm Funding Instructions', date:'10/03/2026', assignedTo:'Treasury', taskStatus:'pending' },
    { id:'confirm-funding', name:'Confirm Funding Complete', date:'10/05/2026', assignedTo:'Investment Operations', taskStatus:'pending' }
  ]}
];

