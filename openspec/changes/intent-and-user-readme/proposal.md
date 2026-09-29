# Proposal

## Why

`README.md` is the project's design spec: positioning, scope, architecture, decisions and the v1/v2 split. It is the right document to check drift against, but it is the wrong first page for someone who lands on the GitHub repository and wants to know what BookaLLM is, whether it is for them and how to run it. The original spec also promised that "the project's GitHub page lists French and English sites where public-domain EPUBs can be downloaded", and that list does not exist yet. The user added "the GitHub page and the user-facing pitch" to v1.

## What Changes

- `README.md` moves to `INTENT.md` with `git mv`, keeping its history. It stays the source of truth for positioning, scope, architecture and decisions. Its Status section becomes a short Roadmap (what is left in v1, what is v2); what already works moves to the new README.
- A new, user-facing `README.md`: a pitch, what the app does (Ask mode, Verify mode, recovery, local and private), screenshots, requirements, how to run it, where to find free EPUBs in French and English, current status, how to develop and test, the license, and how the project was built (model, and the usage figures the project's `AGENTS.md` asks for).
- Screenshots taken from the real app with a real book and the local Ollama, by a small script that can be run again (`pnpm screenshots`), saved under `docs/images/`.
- `openspec/config.yaml` names `INTENT.md` as the source of truth instead of `README.md`.
- A future GitHub Pages site is out of scope; the README is written so its sections can be reused there.

### Non-goals

- The GitHub Pages site itself.
- Any change to the app's behaviour.
- Rewriting past OpenSpec changes that say "README": they are history.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

(none: documentation and tooling only; `.openspec.yaml` sets `skip_specs: true`.)

## Impact

- `README.md` → `INTENT.md`; a new `README.md`; `docs/images/*.png`.
- A screenshot script under `scripts/` and a `screenshots` entry in `package.json` (uses the Playwright already installed; no new dependency).
- `openspec/config.yaml` (source of truth), the project memory notes that mention the README.
