# Design

## Context

- Ask mode (`OnboardingController.runTurn`) runs `retrievePassages` over the whole book, then `generateAnswer`. A `nothing-relevant` verdict makes `generateAnswer` return the fixed `answering.nothingFound` reply without calling Ollama. The `Turn` does not keep the verdict, so the screen cannot tell a nothing-found turn from an answer.
- Each question is sent alone: no conversation history reaches the model. That is why history trimming and hint pinning (README) are out of scope; see proposal Non-goals.
- `retrievePassages` loads every chapter's vectors from the store (`loadChapter` per chapter) and ranks all chunks. Chunks carry `locator.chapterNumber`, the 1-based table-of-contents position; `Book.chapters[]` has `number`, `title` and full `text`.
- Answers have no "I don't know" signal. The system prompt asks for a citation after every claim, and `parseCitations` resolves them after the stream ends.
- Chapter titles vary widely between EPUBs: "Chapter 7", "CHAPTER VII.", "VII", "Chapitre 7 : Le bal", or no number at all. In the Gutenberg *Candide* used for the verify-mode check, titles are headings only ("ADVENTURES OF THE TWO TRAVELLERS…"), and the table-of-contents position is shifted by the introduction.

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
- `matchChapterByTitle(chapters, number)` returns the chapters with text whose title names that number. A title names n when it contains `chapter`/`chapitre`/`chap.` followed by n (digits or Roman), or when it *starts* with n (digits or Roman) followed by `.`, `:`, `)`, `-`, `—`, whitespace or end of title. Matching uses the whole number (7 never matches 17 or VII in "VIII"). A lone Roman "I" at the start counts only when followed by `.`, `:`, `—`, `-` or end, so a title like "I Meet Him" is not chapter 1.

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

- [Many EPUBs have chapter titles without numbers, *Candide* on Gutenberg among them] → A typed hint then matches nothing and the reader gets the chapter list with a plain "couldn't tell" line: slower, never wrong. The real-world check records how the book at hand behaves.
- [A message right after a nothing-found turn that mentions a chapter but is really a new question ("what happens in chapter 3?")] → It is taken as a hint for the previous question. The retry turn's "Looking in chapter …: <original question>" label makes this visible, and the reader can simply ask again. Accepted over trying to guess intent.
- [The model answers from the chapter but forgets to cite] → That counts as "could not answer" and hands over the chapter. The reader still gets the model's text plus the source to check it against, which errs on the app's side of the positioning.
- [Chapter text can be long (tens of thousands of characters)] → Rendered once, as plain text in a bounded scroll area, only on escalation. No virtualisation needed at book-chapter sizes.
- [Loading one chapter's vectors instead of all] → Faster, and restricted to data the index-complete check has already confirmed exists.

## Migration Plan

No stored data changes. Turns are in memory only. Rollback is reverting the change.
