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
3. Apply the database schema from [`supabase/schema.sql`](supabase/schema.sql).
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
