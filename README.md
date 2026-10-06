# Odyssey

Odyssey is a context-aware planning and focus app that turns a brain dump into a practical next action. It guides a person through **Capture -> Understand -> Plan -> Execute**, combining deterministic local planning with optional Gemini-powered suggestions.

## What It Does

- Captures tasks, deadlines, available time, energy, and consistency goals.
- Interprets free-form input into structured work items.
- Offers deadline-focused, balanced, and consistency-focused plans.
- Derives a concrete mission and runs a focused timer.
- Persists authenticated users, tasks, missions, and focus sessions through Supabase.
- Falls back to local deterministic logic when AI is unavailable.

Odyssey is an early-stage open-source project. Interfaces and database schemas may change while the project is being developed.

## Stack

- React 19, TypeScript, and Vite
- React Router
- Supabase Auth, Postgres, Row Level Security, and Edge Functions
- Google Gemini through a server-side Supabase Edge Function
- Tailwind CSS and Oxlint

## Local Development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
Copy-Item .env.example .env
npm run dev
```

On macOS or Linux, use `cp .env.example .env` instead. The app starts without configured services for UI work, but authentication, persistence, and AI suggestions require Supabase configuration.

Available checks:

```bash
npm run build
npm run lint
npm test
```

## Supabase Setup

1. Create a Supabase project.
2. Copy the project URL and publishable key into `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor.
4. Deploy the AI function:

   ```bash
   supabase functions deploy suggest-mission --no-verify-jwt
   supabase secrets set GEMINI_API_KEY=your-gemini-api-key
   ```

The Gemini key must remain a Supabase secret. Never expose it through a `VITE_` variable or commit it to the repository. The browser only receives the Supabase publishable/anon key.

The optional integration smoke test uses the same variables:

```bash
node test-both.mjs
```

It requires a deployed function and makes live requests, so it is not part of the default unit-test suite.

## Repository Layout

```text
src/components/   Shared UI and landing-page sections
src/hooks/        Auth, theme, reveal, and timer hooks
src/lib/          Deterministic interpreter, planner, and domain types
src/pages/        Route-level application screens
src/services/     Supabase-backed application services
supabase/         Database schema and Edge Functions
tests/            Automated unit tests
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development expectations and pull-request guidance. Please review the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md) before participating.

## License

Odyssey is released under the [Apache License 2.0](LICENSE).
