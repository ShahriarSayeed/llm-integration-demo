# Stripe Demo Project — Build Summary

A complete walkthrough of every decision, file, and pattern used to build this project.

---

## Project Goal

Build a minimal but production-structured demo application that proves a **React + Supabase Auth + Stripe Edge Function** stack works end-to-end. The app has signup and signin pages, a protected dashboard, and buttons that invoke Supabase Edge Functions to trigger Stripe API actions — all running fully locally via the Supabase CLI.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React 18 + Vite | Fast HMR, ESM-native, no CRA bloat |
| Styling | Tailwind CSS v3 | Utility-first, pairs perfectly with Shadcn |
| Component library | Shadcn UI (hand-rolled) | Copied the component API without needing the CLI — gives full ownership of each file |
| Auth | Supabase Auth | Email+password out of the box, JWT sessions, built-in trigger support |
| Database | PostgreSQL via Supabase | Local Docker stack, migrations, RLS |
| Edge Functions | Supabase Functions (Deno) | Co-located with the DB, JWT verification in one line, no separate server |
| Payments | Stripe API | Called server-side from Edge Functions only — secret key never touches the browser |
| Local dev | Supabase CLI + Docker | Full stack offline: Postgres, Auth, Studio, Inbucket, Edge Runtime |

---

## What Was Built

### 1. Frontend Application

#### State-based routing (no react-router)
Rather than adding `react-router-dom` as a dependency, routing is handled with a simple `authPage` string in state inside `AppRouter`. The logic is:

- If Supabase session exists → render `<Dashboard />`
- If `authPage === 'signup'` → render `<SignUp />`
- Otherwise → render `<SignIn />`

This keeps the bundle lean and is entirely sufficient for a two-page auth demo.

#### `AuthContext` (`src/contexts/AuthContext.jsx`)
A React Context that wraps the entire app and exposes:

```js
{ user, session, loading, signUp, signIn, signOut }
```

On mount it calls `supabase.auth.getSession()` to restore an existing session from `localStorage`, then subscribes to `onAuthStateChange` so any auth event (login, logout, token refresh) automatically updates state everywhere. The subscription is cleaned up on unmount.

#### Sign In page (`src/pages/SignIn.jsx`)
- Dark background with a subtle dot-grid pattern and a Stripe-purple radial glow
- Email and password fields with inline icons from `lucide-react`
- Error banner shown inline (Supabase error message, not a generic string)
- Loading state disables the button and shows a spinner
- Link to flip to the Sign Up page — no navigation, just sets `authPage` state in the parent

#### Sign Up page (`src/pages/SignUp.jsx`)
- Same visual design as Sign In
- Adds a confirm-password field with client-side mismatch check before calling the API
- After successful signup shows a "Check your email" success screen with the submitted address
- Email confirmations are **disabled** in local config so you can sign in immediately — re-enable in `config.toml` for production

#### Dashboard page (`src/pages/Dashboard.jsx`)
The main protected screen. Built around a reusable `useEdgeAction(fnName)` hook and an `ActionCard` component.

**`useEdgeAction(fnName)`** — custom hook that:
1. Calls `supabase.functions.invoke(fnName, { headers: { Authorization: Bearer <jwt> } })`
2. Manages `status`: `idle → loading → success | error`
3. Extracts a redirect URL from the response (`url`, `checkout_url`, or `portal_url`)
4. Exposes `reset()` to return to idle

**`ActionCard`** — a self-contained card that accepts an action object from `useEdgeAction` and renders:
- An icon, title, and description
- A coloured top-edge accent line that animates during loading and changes colour on success/error
- An inline result message with appropriate icon
- An **Open** button (only when the Edge Function returns a URL)
- A **Reset** button to retry
- A **Run** button that calls the Edge Function

Three cards are wired up on the dashboard:

| Card | Edge Function slug | Stripe action |
|---|---|---|
| Stripe Connect | `stripe-connect` | OAuth URL for linking a Stripe account |
| Create Checkout | `create-checkout-session` | Hosted Checkout session (subscription mode) |
| Customer Portal | `create-portal-session` | Billing portal for managing subscription |

The dashboard also includes a **Session details** `<details>` element that shows the current user's `id`, `email`, `role`, and `aud` fields — useful for debugging.

---

### 2. Shadcn UI Components

All components were written by hand to match the Shadcn API exactly. They use:

- `class-variance-authority` (CVA) for variant-based class generation
- `tailwind-merge` + `clsx` combined in a `cn()` helper
- `@radix-ui/react-slot` for the `asChild` prop pattern on `Button`
- `@radix-ui/react-label` for accessible form labels

| File | What it provides |
|---|---|
| `button.jsx` | `variant` (default, outline, ghost, secondary, destructive, link) + `size` (sm, default, lg, icon) |
| `card.jsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` |
| `input.jsx` | Styled `<input>` with ring focus, placeholder colour, disabled state |
| `label.jsx` | Radix `Label.Root` wrapper with peer-disabled handling |
| `badge.jsx` | `variant` (default, secondary, destructive, success, warning, muted) |
| `separator.jsx` | Horizontal or vertical `<div>` divider |

---

### 3. Styling System

#### Tailwind config (`tailwind.config.js`)
Uses the Shadcn CSS-variable convention so every colour token references a CSS custom property:

```js
colors: {
  primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
  // background, foreground, card, border, muted, accent, destructive ...
}
```

#### CSS variables (`src/index.css`)
All variables are set in `:root` as a dark theme by default — no `.dark` class toggle needed. The primary colour is **Stripe purple** (`#635BFF` → `hsl(243 100% 68%)`).

Custom utilities defined in the CSS:

- `.bg-grid` — subtle 40px dot-grid background pattern on auth pages
- `.glow-primary` — `box-shadow` ring glow in Stripe purple for the logo icon
- `.stripe-btn-gradient` — animated 3-colour gradient (purple → violet → cyan) used as the Connect button accent
- Scrollbar styling — thin, themed, consistent across platforms

---

### 4. Supabase Local Setup

#### `supabase/config.toml`
Full local stack configuration covering:

- **`[api]`** — port `54321`, `public` schema exposed
- **`[db]`** — PostgreSQL 15, port `54322`
- **`[studio]`** — Studio UI on port `54323`
- **`[inbucket]`** — local email capture on port `54324` (all auth emails are viewable here instead of actually sent)
- **`[auth]`** — site URL set to `http://127.0.0.1:5173` (Vite dev server), redirect URLs whitelisted, `enable_confirmations = false` for frictionless local testing
- **`[edge_runtime]`** — enabled with `oneshot` policy

#### Migration: `create_profiles`
A single migration file creates the `public.profiles` table:

```sql
create table public.profiles (
  id                  uuid  primary key references auth.users(id) on delete cascade,
  email               text,
  display_name        text,
  avatar_url          text,
  stripe_customer_id  text  unique,   -- written by Edge Functions
  stripe_account_id   text  unique,   -- written by Edge Functions
  subscription_status text  default 'inactive',
  created_at          timestamptz,
  updated_at          timestamptz
);
```

Key decisions:

- `on delete cascade` — deleting an auth user also deletes their profile
- `stripe_customer_id` and `stripe_account_id` are `unique` — prevents duplicate Stripe entities
- `subscription_status` has a `CHECK` constraint to enforce a fixed enum
- **RLS is enabled** — users can only `SELECT` and `UPDATE` their own row
- An `updated_at` trigger automatically stamps the timestamp on every update

#### `handle_new_user()` trigger
A `SECURITY DEFINER` function fires `AFTER INSERT ON auth.users` and inserts a matching row into `public.profiles`. This means a profile is guaranteed to exist as soon as signup succeeds — no client-side profile creation needed.

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

---

### 5. Supabase Edge Functions (Deno TypeScript)

All functions share a common structure and three shared utility modules.

#### Shared utilities (`supabase/functions/_shared/`)

**`cors.ts`**
Exports a `corsHeaders` object and a `handleCors(req)` helper that returns a `200 ok` response immediately for `OPTIONS` preflight requests. Every function calls this first.

**`supabase.ts`**
- `createServiceClient()` — creates a Supabase client with the service-role key. This client bypasses RLS and is safe to use only server-side.
- `getAuthUser(req)` — extracts the `Authorization: Bearer <token>` header, calls `supabase.auth.getUser(token)`, and throws `'Unauthorized'` if the token is invalid. Every function calls this to verify the caller.
- `getProfile(supabase, userId)` — reads the caller's profile row from `public.profiles`.

**`stripe.ts`**
Initialises the Stripe SDK for Deno using `https://esm.sh/stripe@14?target=deno`. Uses `Stripe.createFetchHttpClient()` so Stripe uses Deno's native `fetch` instead of Node's `http` module.

#### `stripe-connect/index.ts`
Builds a Stripe Connect OAuth URL using the platform's `STRIPE_CLIENT_ID`. Pre-fills the user's email in the Connect form via `stripe_user[email]`. Generates a `state` UUID for CSRF protection (the caller should persist and verify this on the OAuth callback). Returns `{ url }`.

#### `create-checkout-session/index.ts`
1. Verifies the JWT and loads the caller's profile
2. Checks `profile.stripe_customer_id` — if missing, creates a new Stripe customer and writes the ID back to `public.profiles`
3. Creates a `subscription` mode Checkout session with the price from `STRIPE_DEFAULT_PRICE_ID` (or a `price_id` from the request body)
4. Returns `{ url }` pointing to the hosted Checkout page

This is the correct pattern: the Stripe customer is created lazily on first checkout, and the ID is persisted so it is reused on all future calls.

#### `create-portal-session/index.ts`
1. Verifies the JWT and loads the caller's profile
2. Requires `stripe_customer_id` to be present (throws a clear error if not — directing the user to complete a checkout first)
3. Creates a Billing Portal session with a `return_url` back to the app
4. Returns `{ url }`

---

### 6. Environment & Configuration

#### `.env.local` (frontend, Vite)
Pre-filled with the standard local Supabase anon key and `http://127.0.0.1:54321`. Vite loads `.env.local` automatically. This file is in `.gitignore` — it is safe to commit because these credentials only work with a locally running Docker stack, but left out of the repo by convention.

#### `supabase/functions/.env.example` (Edge Functions)
Template for the Stripe secrets needed by Edge Functions:

```
STRIPE_SECRET_KEY
STRIPE_CLIENT_ID
STRIPE_CONNECT_REDIRECT_URI
STRIPE_DEFAULT_PRICE_ID
APP_URL
```

Copied to `supabase/functions/.env` for local use (picked up automatically by `supabase functions serve --env-file`). Set on the remote project with `supabase secrets set` for production.

#### `.gitignore`
Excludes `node_modules/`, `dist/`, `.env`, `.env.local`, `supabase/functions/.env`, and `supabase/.temp/`.

---

## Complete File Map

```
stripe-demo/
│
│   # Config & tooling
├── package.json                         npm deps + scripts (dev, build, preview)
├── vite.config.js                       Vite + React plugin, @/ path alias
├── tailwind.config.js                   Shadcn CSS-variable colour tokens + animations
├── postcss.config.js                    Tailwind + Autoprefixer
├── index.html                           HTML entry point, Inter font import
├── .env.example                         Local + remote env var template
├── .env.local                           Pre-filled local Supabase keys (gitignored)
├── .gitignore
│
│   # React application
├── src/
│   ├── main.jsx                         ReactDOM.createRoot entry
│   ├── App.jsx                          AuthProvider + state-based router
│   ├── index.css                        Tailwind directives + CSS custom properties
│   │
│   ├── lib/
│   │   ├── supabase.js                  Supabase client singleton (reads VITE_ env vars)
│   │   └── utils.js                     cn() = clsx + tailwind-merge
│   │
│   ├── contexts/
│   │   └── AuthContext.jsx              Session state, signIn, signUp, signOut
│   │
│   ├── components/ui/
│   │   ├── button.jsx                   CVA variants: default/outline/ghost/secondary/…
│   │   ├── card.jsx                     Card, CardHeader, CardTitle, CardDescription, …
│   │   ├── input.jsx                    Styled <input> with focus ring
│   │   ├── label.jsx                    Radix Label.Root wrapper
│   │   ├── badge.jsx                    CVA variants: success/warning/muted/…
│   │   └── separator.jsx               Horizontal/vertical <div> divider
│   │
│   └── pages/
│       ├── SignIn.jsx                   Email+password signin form
│       ├── SignUp.jsx                   Signup form + email confirmation screen
│       └── Dashboard.jsx               useEdgeAction hook + 3 Stripe ActionCards
│
│   # Supabase local stack
└── supabase/
    ├── config.toml                      Local stack: ports, auth settings, redirect URLs
    ├── seed.sql                         Instructions for creating local test users
    │
    ├── migrations/
    │   └── 20240101000000_create_profiles.sql
    │                                    profiles table, RLS policies,
    │                                    updated_at trigger, handle_new_user() trigger
    │
    └── functions/
        ├── .env.example                 Stripe secrets template for Edge Functions
        │
        ├── _shared/
        │   ├── cors.ts                  corsHeaders + handleCors() preflight helper
        │   ├── supabase.ts              createServiceClient(), getAuthUser(), getProfile()
        │   └── stripe.ts               Stripe Deno client from esm.sh
        │
        ├── stripe-connect/
        │   └── index.ts                Builds Stripe Connect OAuth URL → { url }
        │
        ├── create-checkout-session/
        │   └── index.ts                Lazy customer creation + Checkout session → { url }
        │
        └── create-portal-session/
            └── index.ts                Billing Portal session → { url }
```

---

## Key Design Decisions

**No react-router.** State-based routing is enough for two auth screens and one dashboard. Keeps the bundle smaller and the logic easier to follow.

**No Shadcn CLI.** Components were written by hand. This means no PostCSS plugin surprises, no CLI version mismatches, and every component is fully readable and modifiable in the repo.

**JWT forwarded manually.** `supabase.functions.invoke()` does not automatically attach the auth token in all SDK versions. Every call explicitly sets `Authorization: Bearer <access_token>` to guarantee Edge Functions always receive it.

**Lazy Stripe customer creation.** The `stripe_customer_id` is only created when the user first hits the checkout endpoint. This avoids creating orphaned Stripe customers for users who sign up but never pay.

**`SECURITY DEFINER` on the trigger.** The `handle_new_user()` function runs with the permissions of its creator (superuser), not the inserting role. This is required because the trigger inserts into `public.profiles` from an `auth.users` insert, which happens outside the normal RLS context.

**`enable_confirmations = false` locally.** Removes the email round-trip during development. Inbucket still captures all emails at `http://127.0.0.1:54324` so you can verify templates without it being a blocker.

---

## How to Run

```bash
# Install
npm install

# Start local Supabase (requires Docker)
npx supabase start

# Apply migrations + seed
npx supabase db reset

# Copy and fill in Stripe secrets
cp supabase/functions/.env.example supabase/functions/.env

# (Optional) Serve Edge Functions locally
npx supabase functions serve --env-file supabase/functions/.env

# Start the frontend
npm run dev
# → http://localhost:5173
```

**Useful local URLs after `supabase start`:**

| Service | URL |
|---|---|
| API / Edge Functions | http://127.0.0.1:54321 |
| Studio (DB UI) | http://127.0.0.1:54323 |
| Inbucket (email viewer) | http://127.0.0.1:54324 |
| PostgreSQL | postgresql://postgres:postgres@127.0.0.1:54322/postgres |

---

## Deployment Checklist

```bash
# Link to hosted Supabase project
npx supabase link --project-ref <ref>

# Push migrations to production DB
npx supabase db push

# Deploy Edge Functions
npx supabase functions deploy stripe-connect
npx supabase functions deploy create-checkout-session
npx supabase functions deploy create-portal-session

# Set production secrets
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
npx supabase secrets set STRIPE_CLIENT_ID=ca_...
npx supabase secrets set STRIPE_CONNECT_REDIRECT_URI=https://yourdomain.com/stripe/callback
npx supabase secrets set STRIPE_DEFAULT_PRICE_ID=price_...
npx supabase secrets set APP_URL=https://yourdomain.com

# Build and ship frontend (Vercel / Netlify / etc.)
npm run build
```

In the Supabase dashboard, update **Authentication → URL Configuration**:
- Site URL → your production domain
- Redirect URLs → same domain

Also re-enable email confirmations in a **separate production `config.toml`** or by toggling it in the dashboard.
