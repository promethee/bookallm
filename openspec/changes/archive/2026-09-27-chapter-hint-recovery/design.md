# Design

## Context

- Ask mode (`OnboardingController.runTurn`) runs `retrievePassages` over the whole book, then `generateAnswer`. A `nothing-relevant` verdict makes `generateAnswer` return the fixed `answering.nothingFound` reply without calling Ollama. The `Turn` does not keep the verdict, so the screen cannot tell a nothing-found turn from an answer.
- Each question is sent alone: no conversation history reaches the model. That is why history trimming and hint pinning (README) are out of scope; see proposal Non-goals.
- `retrievePassages` loads every chapter's vectors from the store (`loadChapter` per chapter) and ranks all chunks. Chunks carry `locator.chapterNumber`, the 1-based table-of-contents position; `Book.chapters[]` has `number`, `title` and full `text`.
- Answers have no "I don't know" signal. The system prompt asks for a citation after every claim, and `parseCitations` resolves them after the stream ends.
- Chapter titles vary widely between EPUBs: "Chapter 7", "CHAPTER VII.", "VII", "Chapitre 7 : Le bal", or no number at all. In the Gutenberg *Candide*, each chapter is two contents entries: a numeral ("II") whose text is only that heading, then the chapter's own heading ("WHAT BECAME OF CANDIDE AMONG THE BULGARIANS.") with its text. Front matter shifts the positions too.

## Goals / Non-Goals

**Goals:**

- Put the recovery flow in the same controller and component as Ask mode, tested the same way (controller tests with the shared harness, component tests, e2e against the mocked Ollama).
- Keep the retrieval and answering libraries free of conversation concepts: they gain only a chapter filter.

**Non-Goals:**

- A new prompt, or a model-written "not found" marker. The escalation signal is derived from citations (decision 3).
- Any change to the relevance cutoff or the passage count.

## Decisions

### 1. Chapter filter on `retrievePassages`, not a new function

`RetrieveOptions` gains `chapterNumber?: number`. When set, only chunks whose `locator.chapterNumber` matches are scored, and only that chapter's vector record is loaded. Everything else is unchanged: the index-complete check, embedding, ties by book order, the verdict and typed failures. An empty chapter returns `{ verdict: 'nothing-relevant', passages: [] }` before embedding, as a book without text does today.

The caller ignores the verdict for a chapter retry and calls `generateAnswer` with `verdict: 'relevant'` whenever there is at least one passage. That is how "answer from the chapter's best passages even below the cutoff" is done without changing `generateAnswer`.

Alternative: a separate `retrieveInChapter`. Rejected: it would duplicate the validation, embedding and error mapping for a one-line difference in which chunks are scored.

### 2. Reading a chapter reference: a small pure module with two functions

`src/lib/recovery/chapter-hint.ts`:

- `findChapterReference(message)` returns the referenced number or `undefined`. It matches `chapter`, `chapitre`, `chap.` or `ch.` (case-insensitive, word boundary), optional spaces, then digits or a Roman numeral (I to CCCXCIX, only well-formed numerals, since some books have over a hundred chapters). It also accepts `n°`/`no.` between the word and the number. Nothing else is parsed: no number words, no bare numbers ("7" alone could be anything).
- `matchChapterByTitle(chapters, number)` returns the chapters whose title names that number. An entry whose text is only its own title (`hasOwnText` is false) stands for the next entry with text of its own; see the real-world check below. A title names n when it contains `chapter`/`chapitre`/`chap.` followed by n (digits or Roman), or when it *starts* with n (digits or Roman) followed by `.`, `:`, `)`, `-`, `—`, whitespace or end of title. Matching uses the whole number (7 never matches 17 or VII in "VIII"). A lone Roman "I" at the start counts only when followed by `.`, `:`, `—`, `-` or end, so a title like "I Meet Him" is not chapter 1.

The controller treats one match as the chapter and zero or several as "unclear" (decision 4).

Alternative: ask the chat model to interpret the hint. Rejected: slow (minutes on a cold CPU machine), not repeatable, and it adds an AI guess to the one step that must be exact.

### 3. "Could not answer" means "no citation in the finished answer"

A chapter retry escalates when its stream finishes (not stopped, not failed) and `citations()` is empty, or when the chapter has no passages. The model's own streamed text is kept above the hand-over message: it is what the model said, and hiding it would make the turn look like it did nothing.

Why citations: the app's premise is that an uncited claim cannot be checked. An answer from a chapter that cites nothing is, for the reader, as good as none. The check is deterministic and needs no prompt change.

Alternative: a sentinel the model writes ("NOT_FOUND"). Rejected: the text streams to the screen as it arrives, so a sentinel would flash on screen or need holding back, and small models do not emit it reliably.

### 4. Turn model

`Turn` gains:

- `kind: 'question' | 'chapter-retry' | 'hint-unclear'`
- `verdict?: Verdict`: set once retrieval returns, for `question` turns.
- `chapter?: { number: number; title: string }`: for `chapter-retry` turns.
- `retryOf?: string`: the id of the nothing-found turn a `chapter-retry` or `hint-unclear` turn belongs to.
- `recovered?: boolean`: on a nothing-found turn, true once a chapter retry has started for it. This is what hides its chapter offer and enforces "once per question".
- `handedOver?: string`: the chapter text, set on a `chapter-retry` turn when it escalates.

The controller gains `retryInChapter(turnId, chapterNumber)`, which checks the target is a nothing-found `question` turn that is not `recovered` and that nothing is busy. It then marks it `recovered` and runs a new `chapter-retry` turn through the same `runTurn` pipeline, with the chapter filter and the verdict override. `askQuestion` first checks whether the last turn is an un-recovered nothing-found `question` turn (or a `hint-unclear` turn about one, so a second typed try still works) and the message has a chapter reference. If so, one match calls `retryInChapter`. Zero or several matches add a `hint-unclear` turn: it shows the reader's message, a fixed "I couldn't tell which chapter you meant" reply, and the chapter offer for the original question. Otherwise the message is a normal question.

`retryTurn` on a failed `chapter-retry` re-runs the same chapter retry in place. `recovered` is already true, and the retry does not create a new turn, so it does not count as a second retry.

Alternative: a separate recovery state object beside `turns`. Rejected: the retry and hand-over belong in the conversation's order, and every existing turn behaviour (stop, fail, retry, busy, reset on book change) should apply to them without being duplicated.

### 5. Chapter offer: a labelled `<select>` plus a button

The offer is a native `<select>` of the chapters with text (title only; the table-of-contents position is not shown because it does not match the book's numbering), then a "Look in this chapter" button. A native select handles 70-plus entries, type-ahead and the keyboard for free, and stays compact inside a turn.

Alternative: a list of buttons, one per chapter. Rejected: tall for real books (72 entries in *Candide*) and a long tab sequence.

### 6. Hand-over block: `<details open>` with a bounded, scrolling body

The chapter text goes in a `<details open>` whose `<summary>` is the chapter title. The body is `max-h-96 overflow-y-auto`, with paragraphs kept (`whitespace-pre-wrap`, since chapter text separates paragraphs with a blank line) and `tabindex="0"` so the scroll area can be reached and scrolled by keyboard. `<details>` gives collapse and expand with keyboard support and the right semantics without custom code.

### 7. Messages

New keys in both languages: `recovery.offerLabel` ("Or choose where to look:"), `recovery.lookHere` ("Look in this chapter"), `recovery.lookingIn` ("Looking in {chapter}: {question}"), `recovery.unclear` ("I couldn't tell which chapter you meant. Choose it below."), `recovery.handOver` ("I couldn't find it in this chapter. Here it is, so you can look through it yourself."), and announcements `announce.chapterShown` and `announce.chapterUnclear`. The retry's own finish and failure reuse `announce.answerDone` and `announce.answerFailed`.

## Risks / Trade-offs

- [Many EPUBs have chapter titles without numbers] → A typed hint then matches nothing and the reader gets the chapter list with a plain "couldn't tell" line: slower, never wrong.
- [Numbers listed as heading-only entries of their own, as in the Gutenberg *Candide*] → Heading-only entries are left out of the list and a typed match on one follows to the next entry with text (decision 2). A heading and a chapter title both naming the number count once. If a book put a heading-only entry *after* its chapter, the follow would land on the wrong chapter; not seen in practice, and the retry label names the chapter used.
- [A message right after a nothing-found turn that mentions a chapter but is really a new question ("what happens in chapter 3?")] → It is taken as a hint for the previous question. The retry turn's `Looking in chapter …: <original question>` label makes this visible, and the reader can simply ask again. Accepted over trying to guess intent.
- [The model answers from the chapter but forgets to cite] → That counts as "could not answer" and hands over the chapter. The reader still gets the model's text plus the source to check it against, which errs on the app's side of the positioning.
- [Chapter text can be long (tens of thousands of characters)] → Rendered once, as plain text in a bounded scroll area, only on escalation. No virtualisation needed at book-chapter sizes.
- [Loading one chapter's vectors instead of all] → Faster, and restricted to data the index-complete check has already confirmed exists.

## Real-world check (2026-09-27)

Run in the real app (`pnpm dev` in a browser) against the local Ollama on the GPU machine (RTX 3060 12 GB, `llama3.1:8b`, `bge-m3`), with *Candide* (Project Gutenberg #19942, 72 contents entries) imported and indexed. Times run from submitting the message to the turn finishing.

| # | Question | Search | Recovery | Result | Time |
| --- | --- | --- | --- | --- | --- |
| 1 | How does photosynthesis work in green plants? | Nothing found (0.7 s) | Typed "try chapter 5" | Uncited, chapter handed over (4,974 chars) | 26.8 s (cold model) |
| 2 | What was the name of Pangloss's dog? | Relevant | None offered | Model: "no mention of a dog… [None]", no citation | 1.7 s |
| 3 | Que trouve-t-on dans les rues d'Eldorado ? | Relevant | – | Cited answer | 2.2 s |
| 4 | sheep? | Relevant | – | Cited answer | 3.9 s |
| 5 | What is the best way to grow vegetables at home? | Nothing found (2.9 s) | List: THE CONCLUSION. | Cited answer ("their little plot of land produced plentiful crops") | 4.1 s |
| 6 | Who won the 1998 football World Cup? | Nothing found (0.3 s) | List: INTRODUCTION | Uncited, chapter handed over (6,370 chars) | 1.8 s |
| 7 | What is the capital of Australia? | Nothing found | Typed "try chapter 1" | "Couldn't tell which chapter", list offered | – |

- **Heading-only entries, found and fixed during the check.** 32 of the 72 entries are a numeral ("V") whose text is only that heading, with the chapter in the next entry. The first run matched "chapter 5" to "V" and handed over the single word "V". Now heading-only entries are left out of the list (72 → 40 entries) and a typed match follows to the next entry with text ("chapter 5" → "TEMPEST, SHIPWRECK, EARTHQUAKE…"). See decision 2 and the risks above.
- **Time per retry:** 1.8–4.1 s once the chat model is loaded; 26.8 s when it had to load first. The whole-book search that finds nothing takes under 3 s.
- **Answered vs handed over:** of 3 recoveries, 1 answered with citations and 2 handed the chapter over; each hand-over followed the model saying the passages did not cover it.
- **Typed hints on this edition:** "chapter 5" works through the heading-only entry; "chapter 1" does not, because chapter 1's entry is titled "CANDIDE I" (the number is at the end, not the start). The reader gets the list instead, as specified.
- **Nothing found is rare for questions about the book.** Every on-topic question (including a French one and the one-word "sheep?") cleared the relevance cutoff. Recovery is therefore reached mostly through off-topic questions.
- **On-topic but absent (question 2) bypasses recovery.** The search found passages, so the model answered "no mention of a dog" with no usable citation and no chapter offer. This is the cutoff limitation already documented in `passage-retrieval`. A follow-up could treat a whole-book answer with no citation like a nothing-found turn and offer the chapters. That would change `ask-conversation` behaviour beyond this change, so it is left for its own change.
- **Screen:** the chapter list, the "Looking in …" label, the hand-over message and the collapsible, scrolling chapter block all rendered as specified.

## Migration Plan

No stored data changes. Turns are in memory only. Rollback is reverting the change.
