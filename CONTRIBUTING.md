# Contributing to BookaLLM

What BookaLLM is meant to be, and why, is in [INTENT.md](INTENT.md): the
source of truth for the project's positioning, scope and decisions.

## Run from source

Install [Ollama](https://ollama.com/download),
[Node.js](https://nodejs.org) 22 or later (then `corepack enable` for
pnpm) and, for the desktop app, [Rust](https://rustup.rs) with
[Tauri's prerequisites](https://tauri.app/start/prerequisites/). Then:

```bash
git clone https://github.com/promethee/bookallm.git
cd bookallm
pnpm install
pnpm tauri dev
```

## Commands

| Command                      | What it does                              |
| ---------------------------- | ----------------------------------------- |
| `pnpm dev`                   | Interface in the browser, port 5287       |
| `pnpm tauri dev`             | Desktop app                               |
| `pnpm test`                  | Unit and component tests (Vitest)         |
| `pnpm test:e2e`              | End-to-end tests (Playwright, mocked AI)  |
| `pnpm lint`, `pnpm format`   | ESLint and Prettier                       |
| `pnpm typecheck`             | Svelte and TypeScript checks              |
| `pnpm check`                 | Everything above in one go                |
| `pnpm screenshots book.epub` | Retake the README's screenshots (real AI) |

## How the project works

- The automated tests never need Ollama. What only a person can check,
  such as the system tray, is in [MANUAL_TESTS.md](MANUAL_TESTS.md).
- Git hooks run lint and formatting before each commit and the full test
  suite before each push; CI runs them again on every push.
- Every feature is planned and recorded with
  [OpenSpec](https://github.com/Fission-AI/OpenSpec) in
  [openspec/](openspec/): the specs of what the app does, and one
  archived change per feature with its design and real-world checks.
