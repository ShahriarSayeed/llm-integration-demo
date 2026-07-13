# Stripe Demo · React + Supabase Auth + Edge Functions

Boilerplate for demonstrating Stripe integration via Supabase Edge Functions.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| Auth | Supabase Auth (email/password) |
| Routing | React Router v6 |
| Backend | Supabase Edge Functions (Deno) |
| Payments | Stripe (Connect · Checkout · Portal) |

---

## Quick Start

### 1. Install deps

```bash
npm install
```

### 2. Start local Supabase

```bash
supabase start
# prints API URL + anon key → copy them into .env
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from `supabase status`
```

### 4. (Optional) Disable email confirmation for local dev

In `supabase/config.toml`:

```toml
[auth.email]
enable_confirmations = false
```

Then `supabase stop && supabase start` to apply.

### 5. Run the app

```bash
npm run dev
# → http://localhost:5173
```

---

## Edge Functions

The three Stripe function stubs live in `supabase/functions/`. Replace their bodies with your real implementations — the frontend expects each one to return `{ url: string }`.

| Function | Invoked when |
|---|---|
| `stripe-connect` | User clicks **Connect Stripe Account** |
| `stripe-checkout` | User clicks **Start Checkout** |
| `stripe-portal` | User clicks **Open Billing Portal** |

### Secrets needed by edge functions

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_DEFAULT_PRICE_ID=price_...
supabase secrets set STRIPE_TEST_CUSTOMER_ID=cus_...   # for portal only
```

### Deploy / serve locally

```bash
# Serve all functions locally (hot-reload)
supabase functions serve

# Deploy to remote
supabase functions deploy stripe-connect
supabase functions deploy stripe-checkout
supabase functions deploy stripe-portal
```

---

## Project Structure

```
stripe-demo/
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── SignIn.jsx       # Email/password sign-in
│   │   │   └── SignUp.jsx       # Email/password registration
│   │   └── dashboard/
│   │       └── Dashboard.jsx    # Protected page with Stripe action cards
│   ├── lib/
│   │   └── supabase.js          # Supabase client (reads from .env)
│   ├── App.jsx                  # Route guard + auth state
│   ├── main.jsx
│   └── index.css                # All styles (CSS custom properties)
├── supabase/
│   └── functions/
│       ├── stripe-connect/      # Express account onboarding stub
│       ├── stripe-checkout/     # Checkout session stub
│       └── stripe-portal/       # Billing portal stub
├── .env.example
├── index.html
└── vite.config.js
```

---

## Auth Flow

```
/signup  →  create account  →  confirm email (or skip locally)
/signin  →  sign in         →  /dashboard
/dashboard  (protected)     →  redirects to /signin if unauthenticated
```

Auth state is managed via `supabase.auth.onAuthStateChange` in `App.jsx`.
Session is passed as a prop to `Dashboard` — no global state library needed.
