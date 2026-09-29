# BookaLLM

**Ask your book questions, and check every answer against the page it
came from.**

BookaLLM is a study companion for EPUB books that runs entirely on your
own computer. Ask "why does Candide leave the castle?" and you get a
short answer in which every claim points to the exact passage it rests
on, so you can read it and judge for yourself. It is made for readers
who have read, or are studying, a book and want to test their
understanding against the text, not for skipping the reading.

AI can misstate what a text says. BookaLLM makes checking part of the
experience: answers are cited, and a second mode deliberately shows you
claims that may be false, so that you get used to going back to the
source.

![A question about Candide answered with citations to the exact passages](docs/images/ask.png)

## What it does

- **Ask mode.** Ask a question in English or French; the answer cites
  the exact passages it uses, and each citation shows the passage
  itself and its chapter. When nothing relevant is found it says so and
  asks where to look. It never claims that the book does not contain
  something.
- **Verify mode.** BookaLLM picks a real passage and states a claim
  about it: sometimes true, sometimes with who did something, or where,
  quietly changed. You decide whether it is true, then see what the book
  says and exactly which words were changed. A session tally keeps
  score.
- **When the search comes up empty.** Point to a chapter, from a list
  or by typing "chapter 7" or "chapitre VII", and BookaLLM looks again in
  that chapter only. If it still cannot answer with a citation, it hands
  you the chapter to read yourself rather than guessing.
- **Everything stays on your computer.** The book, your questions and
  the answers never leave it: the AI runs locally through
  [Ollama](https://ollama.com). BookaLLM never changes, moves or deletes
  your EPUB file.

![A Verify claim revealed, with what the book says and the words that were changed](docs/images/verify.png)

![A question with nothing found, recovered by looking in one chapter, which is then handed over to read](docs/images/recovery.png)

## Requirements

- **Windows.** The desktop app is built and tested on Windows; macOS and
  Linux are not tested yet.
- **[Ollama](https://ollama.com/download)**, version 0.3.4 or later.
  BookaLLM explains how to install it if it is missing.
- **Two AI models**, which BookaLLM offers to download on first start
  (nothing is downloaded without your OK): `llama3.1:8b` (about 4.9 GB)
  to answer, and `bge-m3` (about 1.2 GB) to find passages. Both names
  can be changed.
- **A graphics card is strongly recommended.** Measured on the same
  book: with a GPU, an answer or a claim takes a few seconds; on a
  CPU-only machine it can take several minutes. BookaLLM warns you if
  Ollama is not using a GPU.
- About 8 GB of memory free for the answering model.

## Getting started

Release downloads come with the release pipeline (see the
[roadmap](INTENT.md#roadmap)). For now, BookaLLM runs from source:

1. Install [Ollama](https://ollama.com/download) and start it.
2. Install [Node.js](https://nodejs.org) 22 or later, then enable pnpm:
   `corepack enable`.
3. For the desktop app, install [Rust](https://rustup.rs) and Microsoft
   C++ Build Tools (see [Tauri's prerequisites](https://tauri.app/start/prerequisites/)).
4. Get the code and its dependencies:

   ```bash
   git clone https://github.com/promethee/bookallm.git
   cd bookallm
   pnpm install
   ```

5. Start it:
   - as a desktop app: `pnpm tauri dev`;
   - or in your browser: `pnpm dev`, then open <http://127.0.0.1:5287>.

On first start BookaLLM asks for your language, checks Ollama, offers
the models, and asks for a book. Indexing a book takes a few minutes
the first time (about two minutes for _Candide_ on a GPU) and is kept
for next time.

## Where to find free EPUBs

BookaLLM needs DRM-free EPUB files. It recognises protected books and
explains why it cannot open them. These sites offer public-domain books
as free, DRM-free EPUBs:

### In English

- [Project Gutenberg](https://www.gutenberg.org): tens of thousands of
  public-domain books, each with EPUB downloads.
- [Standard Ebooks](https://standardebooks.org/ebooks): public-domain
  books carefully proofread and formatted.

### En français

- [Ebooks libres et gratuits](https://www.ebooksgratuits.com): plus de
  3 000 livres du domaine public, en ePub notamment.
- [Bibebook](https://www.bibebook.com): plus de 1 700 livres
  électroniques libres et gratuits, en EPUB.
- [Wikisource](https://fr.wikisource.org): chaque œuvre peut être
  téléchargée en EPUB (« Télécharger en EPUB »).

## What works today

- **First start, in English or French:** Ollama detection with
  plain-language guidance, model download after your OK, a warning when
  the AI would run without a GPU, EPUB import with DRM and duplicate
  detection, and indexing with live progress and a time estimate, which
  resumes where it stopped.
- **Ask mode:** streamed, cited answers with the exact passages, a note
  when the first answer is slow, stop and retry, and recovery by chapter
  when nothing is found or an answer cites nothing.
- **Verify mode:** true or changed claims from the story (not the
  introduction or licence pages), the reveal with the changed words, and
  a session tally.
- **Books:** deleting the active book removes BookaLLM's copy and index,
  never your file.
- **Resources:** models are unloaded after an idle time you choose
  (10 minutes by default); the desktop app stays in the system tray
  when closed, unless you turn that off.

Each question is answered on its own for now. What is left for v1 and
planned for v2 is in the [roadmap](INTENT.md#roadmap); why things are
the way they are is in [INTENT.md](INTENT.md).

## Development

| Command                      | What it does                             |
| ---------------------------- | ---------------------------------------- |
| `pnpm dev`                   | Interface in the browser, port 5287      |
| `pnpm tauri dev`             | Desktop app                              |
| `pnpm test`                  | Unit and component tests (Vitest)        |
| `pnpm test:e2e`              | End-to-end tests (Playwright, mocked AI) |
| `pnpm lint`, `pnpm format`   | ESLint and Prettier                      |
| `pnpm typecheck`             | Svelte and TypeScript checks             |
| `pnpm check`                 | Everything above in one go               |
| `pnpm screenshots book.epub` | Retake this page's screenshots (real AI) |

- The automated tests never need Ollama. What only a person can check,
  such as the system tray, is in [MANUAL_TESTS.md](MANUAL_TESTS.md).
- Git hooks run lint and formatting before each commit and the full test
  suite before each push; CI runs them again on every push.
- Every feature is planned and recorded with
  [OpenSpec](https://github.com/Fission-AI/OpenSpec) in
  [openspec/](openspec/): the specs of what the app does, and one
  archived change per feature with its design and real-world checks.
- [INTENT.md](INTENT.md) is the source of truth for the project's
  positioning, scope and decisions.

## License

[MIT](LICENSE).

## How this was built

BookaLLM was built with [Claude Code](https://claude.com/claude-code),
working with Claude Opus 5.5, between 2026-09-20 and 2026-09-29: 185
commits and 17 OpenSpec changes, each planned, reviewed and checked in
the real app by the author before being archived.

- **Model:** Claude Opus 5.5 (`claude-opus-5-5`), through Claude Code.
- **Tokens:** not recorded across all sessions and machines. The
  longest single session reached about 714,000 tokens of context.
- **Time:** ten calendar days, from the first commit to this README.
- **Memory:** not measured for the building sessions. At run time, the
  app's two models use about 5.5 GB (`llama3.1:8b`) and 1.2 GB
  (`bge-m3`) of GPU memory while loaded.

## AI disclaimer

- **The answers come from an AI and can be wrong.** BookaLLM runs a
  local language model that can misread a passage, leave something out
  or state something the book does not say. That is why every answer
  cites its passages: read them before you rely on an answer.
- **Verify mode shows false claims on purpose.** A claim in Verify mode
  may have been changed; only the book decides.
- **Not a substitute for reading.** BookaLLM helps you check your
  understanding of a book you are reading; it does not replace it.
- **This project was built with AI.** The code and documentation were
  written with Claude (Anthropic) through Claude Code, and reviewed,
  tested and approved by the author.
