<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Veyra Agent Guide

This file is the working guide for anyone making changes in `veyra`.

`veyra` is a premium personal finance workspace built with:
- Next.js App Router
- Clerk auth
- tRPC
- React Query
- Drizzle ORM
- Neon Postgres
- shadcn/ui

The goal is not to recreate Mynt screen-for-screen. The goal is to keep the useful finance structure while rebuilding it with cleaner architecture, calmer visual hierarchy, and a more premium product feel.

## Product Direction

Veyra should feel:
- calm
- premium
- modern
- structured
- private and personal

Veyra should not feel:
- noisy
- overly gradient-heavy
- generic dashboard-template-like
- visually crowded
- copied from Mynt

Use Mynt only as reference for useful workflows and domain coverage, not as a UI template.

## Core Principles

1. Build with restraint.
Use fewer visual effects, fewer competing accents, and tighter hierarchy.

2. Separate transport, business logic, and UI.
Routers should stay thin. Business logic should live in feature services. UI components should not own server logic.

3. Prefer feature ownership.
Feature-specific UI, schema, and server logic should live under `src/features/<feature>`.

4. Keep the app usable while refining it.
Do not block useful functionality while polishing visuals.

5. Preserve future flexibility.
Avoid overfitting the codebase to the current accounts screen or to old Mynt assumptions.

## Architecture

## Route Layer

`src/app` owns:
- route structure
- layouts
- page composition
- API route entrypoints

It should not hold deep business logic.

Examples:
- `src/app/(app)/accounts/page.tsx`
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `src/app/api/trpc/[trpc]/route.ts`

## Feature Layer

`src/features/<feature>` is the primary home for feature-specific code.

Current example:
- `src/features/accounts/components`
- `src/features/accounts/lib`
- `src/features/accounts/server`

Use this pattern going forward for:
- `transactions`
- `budgets`
- `loans`
- `categories`
- `settings`

Each feature can own:
- UI components
- local utilities
- Zod schemas
- service logic
- feature constants / labels / helpers

## Server Layer

The server layer should be split into:

- `src/server/api/routers`
  Transport layer for tRPC procedures.
- `src/features/<feature>/server`
  Business logic and feature schemas.
- `src/db`
  Database schema and DB client.

### Router Rules

Routers should:
- parse validated input
- require auth where needed
- delegate to feature services
- return results

Routers should not:
- hold large chunks of business logic
- duplicate summary calculations
- contain feature UI decisions

Good example:
- `src/server/api/routers/accounts.ts` should mostly call accounts service functions.

### Service Rules

Feature services should:
- talk to the database
- enforce feature-level rules
- calculate summaries
- throw typed server errors when needed

Use `z.infer<typeof schema>` for input typing.
Do not use Zod internals like `._type`.

## Data Layer

`src/db/schema.ts` is the source of truth for Drizzle tables.

Important project rule:
- Veyra shares a database environment with legacy Mynt data, so Veyra-owned tables must use the `veyra_` prefix.

Examples:
- `veyra_accounts`
- future `veyra_transactions`
- future `veyra_budgets`

Do not create unprefixed tables for Veyra features in the shared database.

## Auth Flow

Auth uses Clerk.

Rules:
- protected app routes must be protected in `src/proxy.ts`
- protected layouts should also perform server-side auth checks where appropriate
- tRPC context must receive auth state at the route boundary

Important implementation detail:
- do not rely on resolving Clerk auth deep inside the tRPC adapter callback if that causes inconsistent auth state
- prefer reading auth in `src/app/api/trpc/[trpc]/route.ts` and passing it into `createTRPCContext`

## Client Layer

`src/components` is for shared UI that is not feature-owned.

Examples:
- `src/components/app`
- `src/components/auth`
- `src/components/brand`
- `src/components/providers`
- `src/components/ui`

If a component is only used by one feature, prefer moving it into that feature folder.

Compatibility re-exports are acceptable during migration, but the final source of truth should be the feature folder.

Legacy compatibility rule:
- `mynt/` is legacy reference code, not active Veyra source
- do not point new Veyra code at `mynt/` as a source of truth
- if a temporary bridge is needed during migration, add a small compatibility re-export under `src/features/...` rather than expanding TS path aliases toward `mynt`
- keep `mynt` excluded from TypeScript project checking when it is not part of the active app surface

## Folder Structure

Current preferred structure:

```txt
src/
  app/
    (app)/
    (auth)/
    api/
  components/
    app/
    auth/
    brand/
    providers/
    ui/
  db/
  features/
    accounts/
      components/
      lib/
      server/
    budgets/
      lib/
      server/
    transactions/
      components/
      server/
  lib/
  server/
    api/
      routers/
  trpc/
```

As more features are added, prefer:

```txt
src/features/<feature>/
  components/
  lib/
  server/
```

Optional future sub-structure for larger features:

```txt
src/features/<feature>/
  components/
  hooks/
  lib/
  server/
    schema.ts
    service.ts
  types/
```

Current feature ownership should be treated as:

```txt
src/features/accounts/
  components/
    accounts-workspace.tsx
  lib/
    institutions.ts
  server/
    schema.ts
    service.ts

src/features/transactions/
  components/
    transactions-workspace.tsx
    global-quick-capture.tsx
  server/
    schema.ts
    service.ts

src/features/budgets/
  lib/
    period-engine.ts
  server/
    schema.ts
    service.ts
```

Shared shell/UI should stay in:

```txt
src/components/app/
src/components/auth/
src/components/brand/
src/components/providers/
src/components/ui/
```

Use `src/components` for shared cross-feature UI only.
If a component is primarily owned by one feature, move it into that feature folder instead of
growing `src/components` indefinitely.

## Current Architecture By Layer

### Accounts

Accounts currently follow the desired split:
- router:
  - `src/server/api/routers/accounts.ts`
- feature schemas and logic:
  - `src/features/accounts/server/schema.ts`
  - `src/features/accounts/server/service.ts`
- feature UI:
  - `src/features/accounts/components/accounts-workspace.tsx`

Accounts responsibilities:
- maintain user-scoped accounts
- keep balances in native currency
- support `Bank`, `Wallet`, `Credit`, and `Loan` account types
- treat credit cards with:
  - absolute `creditLimit`
  - live owed `balance`
  - derived available credit

### Transactions

Transactions are built as financial events, not just flat rows.

Current transaction event types:
- `income`
- `expense`
- `transfer`
- `credit_payment`
- `loan_disbursement`

Current transaction architecture:
- router:
  - `src/server/api/routers/transactions.ts`
- feature schemas and logic:
  - `src/features/transactions/server/schema.ts`
  - `src/features/transactions/server/service.ts`
- feature UI:
  - `src/features/transactions/components/transactions-workspace.tsx`
  - `src/features/transactions/components/global-quick-capture.tsx`

Current implemented transaction scope:
- list events with server-side pagination
- create event
- edit event
- delete event
- category support for `income` and `expense`
- budget support for `expense`
- global quick capture for simple `expense`, `income`, and `transfer`

Transaction rules:
- `income`
  - applies to a bank or wallet account
- `expense`
  - applies to a bank, wallet, or credit account
  - on credit, it increases debt
- `transfer`
  - moves money between liquid accounts
  - may include a fee
- `credit_payment`
  - reduces debt from a liquid account
  - may include a fee
- `loan_disbursement`
  - increases the loan account and the receiving liquid account

### Budgets

Budgets should stay period-aware and transaction-derived.

Current budget architecture:
- router:
  - `src/server/api/routers/budgets.ts`
- feature schemas and logic:
  - `src/features/budgets/server/schema.ts`
  - `src/features/budgets/server/service.ts`
- feature period logic:
  - `src/features/budgets/lib/period-engine.ts`

Current budget rules:
- budgets are user-scoped
- Veyra supports:
  - `daily`
  - `weekly`
  - `bi-weekly`
  - `monthly`
- `bi-weekly` budgets may use `salaryDates`
- `parentBudgetId` enables roll-up from child budgets into a parent budget
- budget spending is derived from `expense` transaction events only
- `transactionEvents.budgetId` is the linkage point for budget-scoped spending
- budget status levels are:
  - `safe`
  - `warning`
  - `danger`
  - `exceeded`

Current budget UI:
- route:
  - `src/app/(app)/budgets/page.tsx`
- workspace:
  - `src/features/budgets/components/budgets-workspace.tsx`
- the Budgets page should feel like a practical planning workspace, not a promo dashboard
- prefer:
  - compact summary cards
  - active budget list
  - clear empty state
  - restrained support copy
- avoid:
  - oversized hero sections
  - explanatory panels that take more space than the actual budget list
  - cramped modal layouts

Budget implementation guidance:
- keep the period engine as the single source of truth for active budget windows
- do not duplicate period logic inside routers or UI components
- do not manually store spent totals on the budget record
- derive spent / remaining / percentage from transaction events in the active window
- keep insights, rollover behavior, and recurring planning out of the current phase
- budget create/edit dialogs should use a comfortable desktop width and balanced two-column layout
- period choices should read as selectable planning modes, not tall narrow cards
- destructive dialogs should use compact inline actions, not full-width stacked buttons on desktop

Current implemented scope:
- Phase 1:
  - table + router + service foundation
  - active window calculation
  - spending roll-up
  - parent/child support
- Phase 2:
  - budget workspace UI
  - create / edit / delete flows
  - summary cards
  - searchable active budget list
  - empty state and support panel
- Phase 3:
  - expense form integration
  - `budgetId` can be selected directly during expense capture
  - budget-linked expense events feed budget spend automatically through derived logic

Current transaction-budget integration:
- only `expense` events expose a budget selector in the transaction composer
- the budget field is optional
- income, transfer, credit payment, and loan disbursement flows should not expose budget selection
- do not create a separate manual "spent" editing flow for budgets

Next budget step:
- extend budget assignment into deeper transaction editing surfaces only if it improves clarity
- surface more budget context inside the transactions experience only when it improves decision-making

Architectural rule:
- the user creates one event
- the service generates the corresponding ledger entries
- account balances are updated centrally in service logic

This is intentionally better-structured than legacy Mynt behavior, where too much of the finance
logic was implicitly carried by UI assumptions.

### Loans

Loans should be treated as first-class borrowing records, not as user-created liability accounts first.

Current loan foundation:
- Veyra already supports `Loan` as an account type
- Veyra already supports `loan_disbursement` as a transaction event
- the current transaction service treats loan disbursement as:
  - loan liability increases
  - receiving liquid account increases

V1 loans product direction:
- loans should get their own `Loans` page
- the user should create a loan record first, not manually create a loan account first
- if the accounting model still needs an underlying loan account, create it automatically behind the scenes
- loans may still appear in Accounts as `Loan` type records, but Accounts should not be the primary management surface

V1 loan types:
- `institution`
  - for banks, digital banks, and online-lending products
- `personal`
  - for friends, family, colleagues, or other informal lenders

V1 loan schema should include:
- `id`
- `userId`
- `kind`
  - `institution`
  - `personal`
- `name`
  - user-facing loan name such as `Atome Cash Loan`
- `lenderName`
  - provider or person name
- `currency`
- `principalAmount`
- `outstandingAmount`
- `disbursedAt`
- `status`
  - `active`
  - `closed`
- `destinationAccountId`
  - the bank or wallet account that received the proceeds
- `underlyingLoanAccountId`
  - internal liability account reference when used
- `cadence`
  - optional for V1
  - `weekly`
  - `bi-weekly`
  - `monthly`
- `nextDueDate`
  - optional
- `notes`
  - optional
- `metadata`
  - optional raw detail for institution-specific fields that should not reshape the whole schema yet

V1 loan flows:
- `Create loan`
  - create the loan record
  - optionally create the underlying loan liability account automatically
  - optionally create the opening `loan_disbursement` event at the same time
- `Record payment`
  - should reduce a loan from a liquid account
  - should be modeled as its own event type later, not as a generic transfer in the UI

V1 payment rules:
- payment source accounts should be liquid accounts only:
  - `Bank`
  - `Wallet`
- do not allow credit accounts as repayment sources in V1
- support recording payments from both:
  - the Loans page
  - the Transactions page

V1 Loans page guidance:
- keep it a practical workspace, not a promo surface
- prefer:
  - active loans summary
  - total outstanding
  - due soon / next due
  - lender and product clarity
  - `Add loan` and `Record payment` actions
- avoid:
  - forcing users into raw account setup
  - showing only internal ledger structure without loan context

Current implemented loans baseline (April 2026):
- data model is live with:
  - `veyra_loans`
  - `veyra_loan_installments`
- Drizzle artifacts must stay in sync:
  - migration SQL files under `drizzle/`
  - matching snapshots under `drizzle/meta/`
  - updated `drizzle/meta/_journal.json`
- routes and app wiring are active:
  - page: `src/app/(app)/loans/page.tsx`
  - router: `src/server/api/routers/loans.ts`
  - root router registration in `src/server/api/root.ts`
  - nav item in `src/components/app/app-navigation.tsx`
  - protected route in `src/proxy.ts`
- service behavior now includes:
  - optional auto-created underlying loan account
  - optional opening `loan_disbursement` event
  - repayment-plan persistence via installments
  - derived finance metrics from installments:
    - `totalPayable`
    - `financeCharge`
    - derived `nextDueDate`
- UI behavior now includes:
  - compact loans hero aligned with other pages
  - mobile summary carousel with dots and prev/next
  - repayment-plan builder in the loan modal
  - derived finance preview in-form (no manual interest input required)

Loan v2 reset decision (active, April 2026):
- current Loans v1 is now considered a temporary/legacy foundation
- `Loans` page creation/edit/payment flows are paused while Loan v2 is rebuilt
- transaction composer action for `loan_disbursement` is temporarily disabled
- existing legacy loan-disbursement events remain visible in ledger history but should be treated as read-only

Loan v2 product objective:
- support lender-accurate borrowing math instead of simplified fixed-split assumptions
- represent real-world cases where:
  - approved principal differs from net disbursed amount due to upfront fees/deductions
  - monthly installment may be mostly fixed while final installment is lower (or otherwise adjusted)
  - payment amounts do not equal principal reduction because principal/interest components differ

Loan v2 domain rules:
- track both:
  - approved principal (`approvedPrincipalAmount`)
  - net disbursed / received amount (`netDisbursedAmount`)
- compute remaining principal from cumulative principal-paid, not from raw cash paid
- payment history must be first-class:
  - expected schedule (installments)
  - actual payments (posted records)
  - explicit principal and interest per posted payment
- installment status must be derived from actual payment records, not inferred from date alone

Loan v2 schedule engine rules:
- support two generation modes:
  - explicit monthly rate
  - inferred effective rate from contract total payable
- if rate is missing but `totalPayable` is present, solve for effective rate and amortize
- generate `1..N` installments with reconciliation on final installment
- allow manual override/edit for institution-specific exceptions

Loan v2 onboarding/import rules:
- include a starting-state flow for already-running loans:
  - as-of date
  - installments already paid (or first unpaid installment)
  - optional historical payment imports
- seed payment history rows during onboarding so timeline and repayment state are correct on day one

Loan v2 implementation policy:
- keep old data model readable for migration, but do not expand legacy v1 UI paths
- prioritize service and schema correctness before re-opening Loans UI actions
- re-enable Loans page and transaction `loan_disbursement` action only after Loan v2 acceptance checks pass

## Design System Direction

Veyra uses a calm premium visual system.

### Visual Rules

- Prefer solid surfaces over decorative gradients.
- Small gradients are acceptable in hero areas only when very restrained.
- Avoid rainbow cards, glossy dashboard-template styling, or overly colorful metric boxes.
- Use typography, spacing, and composition to create quality.
- Prefer softer contrast and warm light surfaces over stark white + neon accents.

### Dark Mode Rules

Dark mode should feel:
- private
- premium
- muted
- teal-charcoal rather than flat black

Dark mode should not feel:
- like a pure inversion of light mode
- like bright white cards dropped onto a dark shell
- chalky, dusty, or over-outlined

Dark mode implementation rules:
- Use theme-aware tokens instead of hardcoded white/light surfaces.
- Shared surfaces should follow a real depth scale:
  - app background
  - shell surface
  - card surface
  - raised card surface
  - input/control surface
- Use contrast through depth and hierarchy, not by making every card bright.
- Muted text still needs to be readable; avoid washed-out gray copy.
- Borders in dark mode should be subtle and low-contrast.
- Inputs, selects, dialogs, tables, and cards must all use the same dark surface language.
- Hero sections may stay atmospheric, but content cards below them must still feel related.

When implementing or reviewing dark mode:
1. patch shared tokens in `src/app/globals.css`
2. patch shared primitives and controls
3. patch page-level feature surfaces
4. do a contrast/readability pass

### Brand Direction

- Use Veyra branding only.
- Never leak `mynt` naming into the Veyra UI.
- Use lowercase `veyra` for visual brand treatments where appropriate.
- Keep the favicon/logo treatment simple and high-contrast.

### UI Tone

Good:
- concise headings
- supportive subcopy
- calm action labels
- quiet metadata

Avoid:
- dev-commentary copy in product UI
- “next step”, “foundation”, “this layout works” style filler
- references to implementation details
- text that feels like a prototype explanation

Dashboard-specific note:
- until more core modules are implemented, the dashboard should stay intentionally light
- do not fill it with placeholder product-strategy cards or artificial widgets just to occupy space
- prefer a restrained home screen with:
  - top-level money posture
  - recent movement
  - important accounts
  - quick routes into real modules
- the dashboard should be repopulated incrementally as features become real
- when a new module becomes useful, prefer one restrained signal on the dashboard over a full duplicate workspace
- budgets may appear as:
  - one summary-strip metric
  - one compact budget posture block
- do not reproduce parent/child budget cards or the full budgets workspace on the dashboard

Current dashboard decision:
- keep the dashboard minimal for now
- wait until more key features are implemented before expanding it again
- avoid ticker-style or market-terminal energy
- prefer a calm finance briefing over a dense widget wall

## Layout Guidelines

### Sidebar

The desktop sidebar should stay sticky and feel like part of the shell, not scroll away with content.

### Header / Navbar

Global nav/search/user actions should remain stable while content scrolls.

### Mobile Workspace Patterns

Mobile workspaces should feel lighter, faster to scan, and less promotional than desktop.

General mobile rules:
- keep hero sections compact
- avoid giant dark slabs that push the real workspace below the fold
- reduce support copy before reducing utility
- prefer one strong action surface over multiple stacked decorative surfaces
- do not preserve desktop two-column hierarchy when it becomes vertical clutter on mobile

Hero guidance:
- if a page hero is already compact and useful, keep it
- if a hero becomes the tallest thing on the screen, trim it first
- mobile hero headings should usually wrap into 2-4 balanced lines, not a narrow text tower
- supporting copy should usually be one short paragraph
- hero stat blocks on mobile should be:
  - a compact 2-up row when there are only 2 important stats
  - a carousel when there are 3 or more summary cards

Carousel guidance:
- use mobile carousels for summary cards and high-level metrics, not for core data entry
- prefer native scroll-snap with dots and arrow controls before adding a library
- show one card at a time on mobile unless there is a deliberate peek treatment
- if there are only 2 small metrics, prefer a compact 2-up row over a carousel
- carousel controls must work with:
  - swipe
  - dots
  - previous / next buttons
- desktop should usually keep the normal grid while mobile gets the carousel

Filters and controls:
- on mobile, convert large filter bars into stacked controls
- prefer segmented tabs over dropdowns when the option set is small and high-frequency
- primary actions such as `Create`, `Add`, or `Record` should be full-width on mobile only when
  it improves clarity; utility pages may keep compact auto-width pills aligned with nearby copy
- for mobile global search, prefer segmented sections such as `All`, `Accounts`, `Transactions`
  over carousels; search results should remain vertically scannable and tappable

Lists and cards:
- mobile lists should prioritize one clear column and compact row actions
- avoid nested card-inside-card compositions unless the nesting adds meaning
- reduce repeated descriptions when the section title already explains the purpose
- treat categories, accounts, and similar admin-style screens as utility views, not mini dashboards

Modal and sheet behavior:
- mobile dialogs must always have a reachable close control
- use a fixed header, scrollable body, and clear footer action when forms are long
- never let a mobile modal trap the user below the fold without scroll
- for mobile footer actions, use either:
  - two equal-width side-by-side buttons for binary confirm/cancel flows, or
  - compact side-by-side auto-width actions when the flow is form-heavy and a dense footer is clearer
  - one full-width primary action when there is no competing secondary action
- mobile dialogs should account for safe areas (`env(safe-area-inset-top|bottom)`) so content
  does not collide with the dynamic island or home indicator
- guard against horizontal overflow in custom dialogs; avoid footer layouts that introduce
  negative horizontal margins
- reduce mobile modal height by hiding non-critical support copy and desktop-only explanatory cards
- when using shared dialog primitives with opinionated footer spacing, explicitly override
  those styles in feature modals if they create clipping or overflow
- desktop modal footers should keep actions inside container bounds; avoid fixed button min-width
  combinations that can push actions outside narrower desktop modal widths
- destructive dialogs should keep copy concise and practical: one short warning block, one clear
  confirmation step, and no decorative promo-style sections

UI-QA modal baseline (April 2026):
- close icon must never hug modal borders; keep explicit inset offsets on custom dialogs
- prefer modal shells that use:
  - `max-h-[calc(86dvh-env(safe-area-inset-top))]` on mobile
  - `w-[calc(100vw-1rem)]` on mobile
  - `overflow-x-hidden overflow-y-auto`
- use safe-area-aware paddings on long-form dialogs:
  - header top padding with `env(safe-area-inset-top)`
  - footer bottom padding with `env(safe-area-inset-bottom)`
- on mobile confirm/cancel flows, use a two-column footer action row
- for form dialogs using shared `DialogFooter`, explicitly override default mobile stacking when needed:
  - remove inherited negative margins if they cause clipping
  - keep actions inline with `w-auto` unless the page intentionally requires full-width CTAs
- avoid “chubby” controls:
  - use compact heights (`h-9`/`h-10`)
  - restrained radii (`rounded-lg`/`rounded-xl`)
  - tighter inner padding
- trim excessive desktop footer whitespace; avoid oversized bottom padding
- use responsive field grids with `md`/`xl` breakpoints instead of fixed narrow columns
- for transaction composer hierarchy:
  - keep `Amount` as the primary visual field
  - group required fields under `Primary details`
  - group non-critical fields under `Optional details`
  - keep grammar natural in titles (`a/an` helper for event labels)
  - allow optional description with deterministic fallback labels at submit-time

Pagination and density:
- mobile lists may use smaller page sizes than desktop when that improves scanability and reduces scroll fatigue
- current pattern:
  - transactions use 10 items per page on mobile
  - transactions use 20 items per page on desktop

Current mobile precedents in Veyra:
- dashboard summary cards use a mobile carousel
- accounts summary cards use a mobile carousel
- accounts hero stats use a compact 2-up row on mobile
- transactions hero stats use a compact 2-up row on mobile
- transactions summary cards use a mobile carousel
- budgets summary cards use a mobile carousel
- categories summary cards use a mobile carousel
- categories mobile uses segmented type filters and a tighter single-column list
- global search mobile uses segmented `All/Accounts/Transactions` sections (not a carousel)
- transactions composer modal uses compact mobile typography, restrained input radii, and non-fullscreen height
- budgets setup modal uses compact controls, overflow-safe single-column mobile grids, and inline action footers
- loans setup modal follows the same compact mobile modal spec and side-by-side footer actions
- categories setup modal follows the same compact mobile modal spec and side-by-side footer actions
- quick capture mobile dialog uses safe-area-aware sizing and overflow controls with compact footer actions
- settings destructive modal uses compact copy, two-column action footer, and explicit containment-safe spacing

Auth mobile pattern:
- mobile auth should be simpler than desktop
- avoid heavy split-screen or floating-card treatments on phones
- prefer a light single-column layout with one primary card surface
- keep copy short and avoid repeating the same headline inside and outside the auth card

### Tables and Rows

For finance tables:
- prioritize scanability
- reduce redundant metadata
- keep actions compact
- prefer icon-only row actions when text buttons crowd the layout

Do not overload account rows with:
- too many chips
- repeated currency labels
- oversized balance typography

Account row hierarchy should generally be:
- account name
- one quiet metadata line
- balance
- compact actions

## Accounts Feature Rules

Accounts currently support four user-facing types:
- Bank
- Wallet
- Credit
- Loan

Internal storage may still use:
- `cash`
- `wallet`
- `credit`
- `loan`

UI should present `Bank` instead of `Cash`.

### Currency Support

Accounts must support per-account currency.

Rules:
- never force all balances into one misleading aggregate total
- format balances in the account’s native currency
- use shared currency helpers from `src/lib/currencies.ts`

### Institution / Bank Handling

Do not overemphasize bank/provider labels in the row layout.

Use institution data when helpful for:
- creation flow
- known provider selection
- future logos / badges

But prioritize:
- account name
- account type
- currency
- balance

Institution should support:
- curated known PH banks/providers
- custom fallback entry

## Transactions Architecture

Transactions is the most important domain in Veyra.

It should not be treated as a single flat “income/expense tracker” feature.

Veyra transactions must support:
- income
- expense
- transfer
- credit payment
- loan disbursement

Over time it may also support:
- loan repayment
- scheduled transactions
- imported transactions
- rule-based categorization

### Domain Rule

In Veyra, the user performs a financial event.

That event may create one or more account effects underneath.

Examples:
- Expense
  - one account balance decreases
- Income
  - one account balance increases
- Transfer
  - source account decreases
  - destination account increases
- Credit payment
  - cash/bank account decreases
  - credit liability decreases
- Loan disbursement
  - loan liability increases
  - receiving cash/bank account increases
- Loan payment
  - liquid account decreases
  - loan liability decreases
- Credit interest
  - do not model as a standalone event for now; users typically pay the statement amount that already includes it

This means Veyra should be modeled around financial events, not just a generic transaction row with many special cases.

### Recommended Data Model

Build the transactions feature around these concepts:

- `transaction_events`
  The user-facing action or business event.
- `ledger_entries`
  The account-level effects created by the event.
- `accounts`
  The account record and current balance snapshot.

`transaction_events` should store:
- event type
- primary amount
- optional fee amount
- date
- description / payee
- notes
- category reference when relevant
- metadata for event-specific details
- user ownership

`ledger_entries` should store:
- event id
- account id
- amount delta
- currency
- entry role
- ordering / line context if needed

### Event Types

The initial event type set should be explicit:

- `income`
- `expense`
- `transfer`
- `credit_payment`
- `loan_disbursement`

Do not hide these as ambiguous combinations of fields.

The UI can stay simple, but the server model should be strict.

### Server Responsibilities

Transactions service should:
- validate event input
- generate ledger entries
- update affected account balances
- enforce account compatibility rules
- return a normalized event result

Additional rules:
- transfer fees should be modeled explicitly and deducted from the source account in addition to the transfer amount
- credit payment fees should be modeled explicitly and deducted from the payment account in addition to the amount paid
- credit limit is absolute and belongs to the account record, not to transaction events
- a credit account balance may exceed its credit limit because of fees, interest, or over-limit usage

Routers should stay thin and only call transactions services.

### Transaction Typing Rules

- treat `transactions.list` as a paginated object response, not a bare array
- when deriving item types from router outputs, use `RouterOutputs["transactions"]["list"]["items"][number]`
- when deriving event-type literals from router outputs, read them from the event item type, not from the list container
- for create and update flows, prefer `inferRouterInputs<AppRouter>` payload aliases so discriminated union event types stay narrow through mutation calls
- in services, avoid `Pick<>` over discriminated-union keys that are not shared by every variant; use a small explicit object shape instead when a helper only needs a subset such as `type`, `budgetId`, or `categoryId`

### UI Responsibilities

The UI should present clean intent-based actions:
- add income
- add expense
- transfer money
- pay credit card
- record loan disbursement

Do not force all of these through a single visually identical flow if that harms clarity.

The first version can share structure, but the user intent should stay obvious.

Quick capture guidance:
- quick capture is a global entrypoint, but it is owned by the transactions feature
- mount the trigger from the shared shell/header, not as separate per-page clones
- keep the implementation in `src/features/transactions/components/global-quick-capture.tsx`
- treat it as one-line structured capture, not a chat thread
- parse simple natural language into a transaction draft first, then ask only for missing fields
- support `expense`, `income`, and `transfer` first before expanding further
- use the existing transaction create flow; do not create a second save path or a separate transaction model
- do not present this as a fake AI assistant or support bot
- when categories are introduced, quick capture may suggest or prefill a category, but it should not silently assign one with high confidence unless the match is explicit
- category handling in quick capture should stay assistive:
  - parse likely category phrases
  - surface them as editable draft fields
  - ask only when the category is missing and useful
- quick capture currently supports category prefills for obvious `income` and `expense` matches and still keeps the category editable before save

### Transactions Folder Structure

Preferred structure:

```txt
src/features/transactions/
  components/
  lib/
  server/
    schema.ts
    service.ts
  types/
```

Potential future additions:

```txt
src/features/transactions/
  components/
    global-quick-capture.tsx
    forms/
    lists/
    calendar/
    sheets/
  hooks/
  lib/
    formatters.ts
    mappers.ts
  server/
    schema.ts
    service.ts
    balance-engine.ts
```

### Transactions v1 Scope

Transactions v1 should include:
- list events
- create event
- edit event
- delete event
- support the initial event types
- filter by account/date/type
- pagination
- mobile-safe list UX

Transactions v1 should not include:
- CSV import
- calendar view
- bulk actions
- AI overlays

Those can be added later after the domain model is stable.

### Transactions Phased Rollout

#### Phase 1: Domain Foundation

Build the core schema and service design first.

Deliverables:
- `transactions` feature folder
- event schemas
- service methods for event creation and deletion
- DB tables for event + ledger entries
- thin router
- account balance update rules in one place

#### Phase 2: Ledger Screen v1

Build the main transactions workspace.

Deliverables:
- transactions page shell
- filterable event list
- account/date/type filters
- mobile-friendly rows
- create/edit/delete flows

#### Phase 3: Money Movement Flows

Add the multi-account event types.

Deliverables:
- transfer flow
- credit payment flow
- loan disbursement flow
- transfer fee support
- credit payment fee support
- proper event-specific validation
- event detail normalization in the list UI

#### Phase 4: Insights and Productivity

Add higher-level workflows once the base model is trusted.

Deliverables:
- summaries
- recurring rules
- import
- calendar
- bulk actions

## Categories

Categories are now a dedicated feature and should stay lightweight before heavier reporting or automation is added.

Why categories matter:
- they make transactions more meaningful
- they make budgets more useful later
- they unlock future spending insights without bloating the dashboard now
- they improve quick capture without requiring an LLM

Recommended category architecture:
- route:
  - `src/server/api/routers/categories.ts`
- feature schemas and logic:
  - `src/features/categories/server/schema.ts`
  - `src/features/categories/server/service.ts`
- feature UI:
  - `src/features/categories/components/categories-workspace.tsx`
  - `src/app/(app)/categories/page.tsx`

Category rules:
- categories are user-scoped
- start with a flat model first
- use one category reference per transaction event where relevant
- prioritize `expense` first
- `income` categories may be supported, but do not overcomplicate the first slice
- transfer, credit payment, and loan disbursement should not require categories in V1

Recommended V1 category schema:
- `id`
- `userId`
- `name`
- `kind`
  - `expense`
  - `income`
- `isArchived`
- `color`
  - optional
- `icon`
  - optional
- `sortOrder`
  - optional

Category V1 scope:
- create / edit / archive categories
- category picker in transaction flows where appropriate
- category display in the transactions list and detail surfaces
- category filtering in the transactions workspace

Current implemented category scope:
- dedicated Categories page
- create / edit / delete category flows
- transaction composer dropdown for `income` and `expense`
- quick-capture category dropdown for `income` and `expense`
- category-aware transaction search and transaction row metadata

Category V1 should not include:
- nested category trees
- rules engine automation
- merchant intelligence
- budget rollups by category yet

Quick capture + categories guidance:
- quick capture should remain deterministic first
- allow it to parse obvious category phrases such as:
  - `lunch`
  - `groceries`
  - `salary`
- if there is a clear category match, prefill the draft
- if there are multiple plausible matches, surface the category as unresolved rather than guessing silently
- categories should remain editable before save

### Production Readiness Rule

Do not optimize transactions around the old Mynt UI structure.

Preserve the real-world finance coverage, but rebuild the internals around:
- explicit event types
- centralized balance rules
- feature-owned services
- clean transport boundaries

## Modal Guidelines

Forms and dialogs should feel:
- compact
- balanced
- intentional

Avoid:
- giant empty white slabs
- oversized controls
- bulky spacing with weak hierarchy
- raw error strings dropped into the form

Preferred modal structure:
- concise title
- short supporting copy if needed
- grouped form fields
- subtle note/help block
- clear footer CTA
- inline styled error state

## Copywriting Guidelines

Use copy that sounds like a finished product.

Prefer:
- “Welcome back”
- “Sign in to continue to your workspace”
- “Add and maintain the accounts that feed balances and budgets”

Avoid:
- references to old Mynt internals
- “this page is ready for…”
- “foundation”, “next step”, “rebuild”, “layout works”
- language that sounds like a prototype demo or internal note

## Migration Rules

When migrating code from legacy locations:
- move logic into the feature folder
- keep temporary re-export shims small and obvious
- do not duplicate business logic in old and new locations
- remove old source-of-truth paths once feature migration stabilizes
- if legacy files still compile for reference, do not let them drive new TypeScript errors in the active Veyra app surface
- if a legacy import path still needs to resolve temporarily, prefer a shim in `src/features/...` over widening `@/*` to include legacy directories

## Coding Guidelines

- Prefer TypeScript inference through real exported values.
- Use `z.infer` for Zod schema input types.
- Keep services small and composable.
- Keep UI state local unless multiple screens genuinely need shared client state.
- Prefer `rg` for search and `apply_patch` for manual file edits.
- When working with tRPC list procedures, confirm the exact router return shape before indexing into `inferRouterOutputs`.
- When building discriminated-union mutation payloads, keep literal `type` values narrow with typed payload aliases instead of relying on object-literal widening.

## When Adding a New Feature

1. Create `src/features/<feature>/`.
2. Add feature-owned schemas and service logic under `server/`.
3. Add a thin tRPC router under `src/server/api/routers/`.
4. Add the page in `src/app/(app)/...`.
5. Add shared UI only if it is truly reusable across features.
6. Keep the first slice simple but production-shaped.

## Immediate Priorities

The current architecture direction should continue like this:

1. Finish stabilizing the accounts feature under `src/features/accounts`.
2. Move any remaining accounts source-of-truth logic out of legacy `src/components/accounts`.
3. Apply the same feature-first pattern to transactions next.
4. Keep tightening copy and visual restraint as new screens are added.

## Final Standard

Every change should move Veyra toward:
- cleaner architecture
- thinner routers
- feature-owned logic
- calmer finance UI
- less noise
- more trust
- more polish
