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

## Design System Direction

Veyra uses a calm premium visual system.

### Visual Rules

- Prefer solid surfaces over decorative gradients.
- Small gradients are acceptable in hero areas only when very restrained.
- Avoid rainbow cards, glossy dashboard-template styling, or overly colorful metric boxes.
- Use typography, spacing, and composition to create quality.
- Prefer softer contrast and warm light surfaces over stark white + neon accents.

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
