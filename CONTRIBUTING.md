# Contributing to Odyssey

Thanks for helping improve Odyssey. Contributions of code, documentation, testing, design, and product feedback are welcome.

## Before You Start

1. Read the [README](README.md) and [Code of Conduct](CODE_OF_CONDUCT.md).
2. Search existing issues before opening a new one.
3. For significant changes, open an issue first so the direction can be discussed.

## Development

Requirements: Node.js 20 or newer and npm.

```bash
npm install
Copy-Item .env.example .env
npm run build
npm run lint
npm test
```

The app can run without Supabase credentials for UI work, but authentication, persistence, and AI suggestions require a configured Supabase project. Never commit `.env`, service-role keys, Gemini keys, or personal data.

## Pull Requests

- Keep changes focused and explain the user-facing effect.
- Add or update tests for behavior changes.
- Update documentation when setup or configuration changes.
- Make sure build, lint, and tests pass locally.
- Do not include generated output, credentials, or unrelated formatting changes.

The project is maintained by Aaliya. Maintainers may request changes, close stale issues, or decline changes that do not fit the project direction.
