# Odyssey 🧭

**Turn scattered thoughts into a clear next move.**

Odyssey is an AI-assisted productivity and execution application designed to help people move from an overwhelming collection of tasks and ideas to a practical plan they can act on.

Instead of simply generating suggestions, Odyssey focuses on the steps between deciding what matters and actually getting it done.

**Capture → Understand → Plan → Execute**

Odyssey is an actively developed open-source project. Its core experience is being built and refined through iterative development.

## ✨ What Odyssey Does

- **Capture context:** Bring tasks, deadlines, available time, energy levels, and consistency goals into one planning workflow.
- **Understand tasks:** Interpret free-form input and organize it into structured work items.
- **Plan the next move:** Generate actionable plans with deadline-focused, balanced, and consistency-focused approaches.
- **Turn plans into action:** Convert priorities into concrete missions and support focused work with an execution timer.
- **Use AI when helpful:** Integrate optional Gemini-powered suggestions alongside deterministic local planning logic.
- **Keep work organized:** Use Supabase-backed authentication and persistence for supported application data.

Odyssey is still evolving. Some experiences and integrations may require configuration, and features may change as the project develops.

## Expedition progression

The Journey trail and Passport use `src/lib/progressionEngine.ts` to derive progress from existing records: **50 XP per completed task, 250 XP per completed mission and 10 XP per logged focus minute**. Replayed record IDs count once; the latest dated state wins. XP remains a lifetime projection, including completed records without completion dates. Activity-based streaks and momentum require a valid, non-future timestamp with a timezone.

Ranks unlock at 0, 250, 750, 1800 and 3500 XP, with five SVG badges and matching passport/trail accents. Rest days default to Saturday/Sunday, can be changed on the Passport, and are saved in this browser. Day boundaries use the client's IANA timezone with UTC fallback, including daylight-saving changes.

Only active days advance a streak. Rest days preserve it, and today's unfinished day is not a miss until local midnight. Every seven active days earns one shield (inventory capped at one); a shield preserves the streak across one missed non-rest day. An unprotected miss resets the active-day count and progress toward the next shield. Activity on a rest day still counts.

Momentum is a separate 0–100 score. Each active day contributes up to 50 points for 60 focus minutes, 30 points for three completed missions, and 20 points for activity. That daily contribution decays from the latest activity timestamp with a 48-hour exponential half-life, including rest days; contributions sum and cap at 100. The pure engine accepts `restDays`, `timeZone`, `now` and `halfLifeHours` options. The view refreshes elapsed time each minute and on returning to the app.

**Share Expedition Card** opens a preview and downloads a standalone SVG locally. It includes the explorer name, rank and totals, with no email, task titles, mission details, upload or public URL. Existing achievements, trail time horizons and backup/restore remain available.

### Weekly expedition retrospective

Open **Weekly retrospective** on the Mission page for the last seven local calendar days, including today. It summarizes ended focus sessions, completed work, and recurring debrief themes using the history available to the page. The local digest works without Gemini. Choosing **Generate with Gemini** sends only aggregate metrics and predefined obstacle counts through the existing `suggest-mission` Edge Function. Reflection text, task titles, and names are excluded. Deploy an updated copy of that function to enable the optional AI digest.

## 🛠 Tech Stack

| Area | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Routing | React Router |
| Styling | Tailwind CSS |
| Authentication and database | Supabase Auth, PostgreSQL, Row Level Security |
| AI integration | Google Gemini through a Supabase Edge Function |
| Code quality | Oxlint |
| Testing | Project test suite |

## 🚀 Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project for authentication and persistence
- A Gemini API key for AI-powered suggestions

### Installation

1. Clone the repository and enter the project directory.

   ```bash
   git clone https://github.com/aaliya1719/Odyssey.git
   cd Odyssey
   ```

2. Install dependencies.

   ```bash
   npm install
   ```

3. Create a local environment file.

   **Windows PowerShell:**

   ```powershell
   Copy-Item .env.example .env
   ```

   **macOS/Linux:**

   ```bash
   cp .env.example .env
   ```

4. Configure the required environment variables as described below.

5. Start the development server.

   ```bash
   npm run dev
   ```

### Environment Configuration

Configure the following client-side variables in `.env`:

```env
VITE_SUPABASE_URL=your-supabase-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
```

These values connect the application to your Supabase project. Use the publishable key intended for client-side applications, with appropriate database permissions and Row Level Security policies.

Never put a Gemini API key, Supabase service-role key, or other server-side secret in a `VITE_` variable or commit secrets to version control.

### Supabase Setup

1. Create a Supabase project.
2. Configure the environment variables listed above.
3. Apply the database schema from [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. It is self-contained (tables, row level security policies and the Pause/Complete function) and safe to run again. `supabase/migrations/` is only for upgrading a project that was set up from an older copy of the schema.
4. Deploy and configure the `suggest-mission` Edge Function using the Supabase CLI.
5. Store `GEMINI_API_KEY` as a server-side Supabase secret.
6. Verify the function's authentication and authorization behavior before exposing it to users.

Refer to the [Supabase documentation](https://supabase.com/docs) for project configuration and deployment instructions.

The interface can be explored without all integrations configured, but authentication, persistence, and AI suggestions require their respective services.

## 🧪 Development Checks

Run the checks supported by the repository:

```bash
npm run build
npm run lint
npm test
```

These commands assume the corresponding scripts are defined in `package.json`. If a script is unavailable in your checkout, check the available npm scripts before running it.

## 📁 Project Structure

```text
src/
├── components/    Shared UI components and landing-page sections
├── hooks/         Authentication, theme, reveal, and timer hooks
├── lib/           Planning logic, interpreter, and domain types
├── pages/         Route-level application screens
└── services/      Application services and Supabase integration

supabase/
├── schema.sql     Database schema
└── functions/     Edge Functions

tests/             Automated tests
```

## 🗺️ Current Development Focus

Odyssey is being developed incrementally. Areas for continued improvement include:

- Making the planning and prioritization experience clearer.
- Refining the transition from a plan to an executable mission.
- Improving navigation and interface consistency, including theme support.
- Strengthening progress tracking and persistence.
- Improving accessibility and automated test coverage.
- Evaluating AI suggestions for reliability and usefulness.

These are development directions, not a claim that every item is already implemented.

## 🤝 Contributing

Contributions to code, documentation, testing, accessibility, design, and product feedback are welcome.

Start with [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup instructions and contribution guidelines. Please also read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).

For substantial changes, open or discuss an issue before beginning implementation.

## 🔐 Security

Please report suspected vulnerabilities privately rather than posting sensitive details in a public issue. See [`SECURITY.md`](SECURITY.md) for reporting guidance.

## 📄 License

Odyssey is distributed under the [Apache License, Version 2.0](LICENSE). The license permits use, modification, and redistribution subject to its terms, including preservation of required notices.

---

Built and maintained by [Aaliya](https://github.com/aaliya1719).
