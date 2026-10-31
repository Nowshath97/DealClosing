// Review tasks (Risk & Compliance etc.) share ONE page, ReviewTaskPage, driven by this config.
// Add a task here (key = ref_task_name value with everything but letters removed, lower-case) and it gets the page.
//
//   title        : banner text
//   actionLabel  : text of the button that completes the task
//   extras       : true -> show the Comments and Documents panels
//   saveAndExit  : true -> also show "Save and exit" (stores the answers, leaves the task open)
//   confirmation : true -> once the first question is answered, show Confirmation Date (editable, defaults to today)
//                  and Confirmation By (the signed-in user)
//   questions    : asked in order; each is
//       key      : name the answer is stored under
//       text     : the question (shown bold, required)
//       notes    : optional explanatory paragraphs (shown in italics)
//       bullets  : optional list
//       options  : [{ value, label?, outcome? }]  outcome 'complete' (default) -> task Completed, 'notRequired' -> task Skipped
//       showIf   : { key, value } -> only asked when that earlier question has that answer; otherwise hidden and not stored
//
// Nothing else happens on any answer: answers are stored and the task is completed.
const YES_OR_NOT_REQUIRED = [{ value: 'Yes' }, { value: 'Not Required' }]; // "Not Required" = other paperwork is handled elsewhere; still completes

export const REVIEW_TASKS = {
  amlcounterpartyscreening: {
    title: 'AML Counterparty Screening',
    actionLabel: 'AML Approved',
    confirmation: true,
    extras: true, // show Comments and Documents
    questions: [{
      key: 'screened',
      text: 'Has the AML Counterparty screening (which is inclusive of screening for sanctions issued by the below authorities) been completed?',
      bullets: ['Office of Foreign Assets Control (OFAC)', 'European Union', 'United Nations Security Council', "Her Majesty's Treasury (U.K.)"],
      options: YES_OR_NOT_REQUIRED
    }]
  },

  avoidancepolicyconfirmation: {
    title: 'Avoidance Policy Confirmation - Investment Team',
    actionLabel: 'Finalize',
    saveAndExit: true,
    questions: [
      {
        key: 'materialExposure',
        text: 'Will the transaction result in a “material exposure” to any single company?',
        notes: [
          'For these purposes, “material exposure” means that the capital invested into such company – on a look-through basis by the dedicated NB commingled secondaries funds which participate in the transaction – represents greater than 1% of the capital commitments of each dedicated commingled secondaries fund that participates in the transaction.',
          'Note that if the materiality threshold is not met for dedicated commingled secondaries fund(s) participating in the transaction, then the transaction is compliant for all PIPCO accounts participating.',
          'If no dedicated secondaries fund is participating in a secondary transaction, contact Legal and the Sustainability Investing Team for guidance on how an account which has applied the NB Private Markets Avoidance Policy should comply.'
        ],
        options: [{ value: 'Yes' }, { value: 'No' }]
      },
      {
        key: 'alignedWithPolicy',
        showIf: { key: 'materialExposure', value: 'Yes' },
        text: 'To our knowledge, the transaction will not result in “material exposure” to a company that is not aligned with the Avoidance section of the NB Private Markets Avoidance Policy.',
        notes: [
          'With respect to secondary fund transactions subject to this Policy, the Manager will generally seek to avoid making an investment that would, to its knowledge, be subject to the Avoidance section of the Policy.',
          'For these purposes, “material exposure” means that the capital invested into such company – on a look-through basis by the dedicated NB commingled secondaries funds which participate in the transaction – represents greater than 1% of the capital commitments of each dedicated commingled secondaries fund that participates in the transaction.'
        ],
        options: [
          { value: 'YES', label: 'YES - To our knowledge, the transaction will not result in a “material exposure” (as defined above) that is not in alignment with Private Markets Avoidance Policy.' },
          { value: 'NO', label: 'NO - The transaction may result in a “material exposure” (as defined above) that conflicts with the Avoidances outlined in the PM Avoidance Policy – alert Sustainability Investing team for guidance.' }
        ]
      }
    ]
  }
};

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
export const reviewConfigFor = task => REVIEW_TASKS[norm(task.name)] || null;

// Questions that apply for the answers given so far (follow-ups appear only when their condition is met).
export const visibleQuestions = (config, answers) => config.questions.filter(q => !q.showIf || answers[q.showIf.key] === q.showIf.value);
