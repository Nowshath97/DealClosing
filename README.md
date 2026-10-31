# Deal Closing UI - Working React POC

A functional React/Vite proof of concept for an investment deal-closing workspace.

## Included flows

- Login with demo credentials
- Persistent left navigation for Tasks, Deals, Reports and Admin
- Deals grid with search/filter and clickable investment names
- Deal-specific summary pages
- Expandable workflow modules
- Dedicated task pages for Initiate Allocations, Finalize Allocations, and Ethics & Compliance reviews
- Generic task pages for the other workflow tasks
- Create Deal form with investment identity, economics, closing and operational fields
- New deals are added to the in-memory deal list for the current browser session
- Tasks work queue, pipeline report and admin workflow defaults

## Run locally

1. Open a terminal in this folder.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open the local URL displayed by Vite.

### Demo login

- Email: `test.user@demo.com`
- Password: `Deal@123`

## Notes

This is a front-end POC. Data changes are held in React state and reset when the browser is refreshed. The component boundaries are ready for later Supabase/Temporal integration.
