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
- protected app routes must be protected in `src/middleware.ts`
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

Next budget step:
- modify transaction create/edit flows to support `budgetId` directly in the form
- expense events should be assignable to a budget at capture time
- once a transaction is budget-linked, budget spend should update through the existing derived budget logic
- do not create a separate manual "spent" editing flow for budgets

Architectural rule:
- the user creates one event
- the service generates the corresponding ledger entries
- account balances are updated centrally in service logic

This is intentionally better-structured than legacy Mynt behavior, where too much of the finance
logic was implicitly carried by UI assumptions.

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

### UI Responsibilities

The UI should present clean intent-based actions:
- add income
- add expense
- transfer money
- pay credit card
- record loan disbursement

Do not force all of these through a single visually identical flow if that harms clarity.

The first version can share structure, but the user intent should stay obvious.

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

## Coding Guidelines

- Prefer TypeScript inference through real exported values.
- Use `z.infer` for Zod schema input types.
- Keep services small and composable.
- Keep UI state local unless multiple screens genuinely need shared client state.
- Prefer `rg` for search and `apply_patch` for manual file edits.

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
