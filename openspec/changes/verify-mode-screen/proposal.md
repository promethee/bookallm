# Proposal

## Why

Verify mode's claim generation (`claim-mutation`) works as a library, but a reader has no way to reach it: the landing screen only offers Ask mode. This change gives Verify mode its own screen, reached through Ask/Verify mode tabs, so the README's v1.1 loop (see a claim, judge it true or false, then check the real passage) is usable end to end. Now is the time because a GPU machine is available for real-world checks: a claim takes about 20 minutes on this CPU-only machine and should take seconds there.

## What Changes

- Ask/Verify mode tabs on the landing screen, shown once the active book is ready, both visible and switchable at a glance. The app still opens in Ask mode.
- The one-line mode disclosure follows the current mode ("Verify mode: the claim below may be false"), and Verify mode is visually distinct from Ask mode (its own color and layout), so its planted false claims do not bleed distrust into Ask mode's sincere answers.
- A Verify mode screen: the reader asks for a claim, waits (with the same plain "getting ready can take a few minutes" note as Ask mode, and a way to stop), judges it true or false, then sees whether they were right, what was changed if it was false, and the exact source passage.
- A session-only tally of claims judged and judged correctly, per book, cleared on restart and when the active book changes. Nothing about Verify mode is saved.
- Plain-language failure messages, each with a retry, for every typed failure `claim-mutation` reports, including "could not make a fair claim this time" for an unverified change.
- Switching tabs keeps each mode's state for the session (the Ask conversation, the current claim and the tally).
- Not in this change: the top bar's book dropdown, the command palette, any difficulty toggle (the README says no toggle until adaptive mode exists), and the chapter-restricted retry/escalation flow.

## Capabilities

### New Capabilities

- `mode-tabs`: Ask/Verify tabs on the landing screen, the per-mode disclosure line, visual distinction between the modes, and keeping each mode's state when switching.
- `verify-session`: the Verify mode screen: requesting a claim, waiting and stopping, judging it, the reveal with the real citation, the session tally, failures and retry, and keyboard and screen-reader use.

### Modified Capabilities

- `first-run-flow`: the landing screen's requirement changes from "an honest Ask-mode placeholder" to a landing screen that, for a ready book, offers both modes through tabs and opens in Ask mode.

## Impact

- UI: `src/components/LandingScreen.svelte` (tabs, per-mode disclosure), a new Verify mode component, `src/lib/i18n/messages.ts` (new English and French messages).
- State: `src/lib/onboarding/controller.svelte.ts` gains the current mode, the Verify session (current claim, its state, the tally, chunks already used) and the actions to request, stop, judge and retry, calling `generateClaim` from `src/lib/mutation`.
- Tests: new Vitest component and controller tests, a new Playwright e2e spec against the mocked Ollama; existing Ask mode tests keep passing unchanged.
- No new dependency, no change to stored data, no change to `claim-mutation` itself.
