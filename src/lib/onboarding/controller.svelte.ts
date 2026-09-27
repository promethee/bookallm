import {
  detectLanguage,
  getLanguage,
  setLanguage,
  type Language,
} from '../i18n';
import type { MessageKey, Params } from '../i18n';
import { DuplicateHashError } from '../ingest/registry';
import type {
  Book,
  IngestErrorCode,
  DrmScheme,
  RegistryEntry,
} from '../ingest';
import {
  estimateRemainingMs,
  indexBook,
  indexStatus,
  updatePace,
  type Pace,
  type IndexError,
  type IndexProgress,
  type IndexStatus,
} from '../indexing';
import {
  checkSetup,
  installGuidance,
  type InstallGuidance,
  pullMissingModels,
  type ModelPullProgress,
  type PullError,
  type RequiredModels,
  type SetupReadiness,
} from '../ollama';
import {
  isValidOllamaUrl,
  StorageFullError,
  storageProblem,
  type Settings,
  type StorageProblem,
} from '../storage';
import {
  retrievePassages,
  type RetrievalError,
  type Verdict,
} from '../retrieval';
import {
  findChapterReference,
  hasOwnText,
  matchChapterByTitle,
} from '../recovery';
import { generateAnswer, type AnswerError, type Citation } from '../answering';
import { checkAcceleration } from '../hardware';
import {
  generateClaim,
  type MutationClaim,
  type MutationError,
} from '../mutation';
import {
  decideScreen,
  type HardwareCheck,
  type IndexNeed,
  type Screen,
} from './screens';
import type { Services } from './services';

/** One question and its answer, kept only for this session. */
/** A citation with the cited passage's own text, so the reader can check it without opening the book. */
export interface AskCitation extends Citation {
  text: string;
}

/** A chapter the reader can point a recoverable question to (see `canRecover`). */
export interface ChapterChoice {
  /** 1-based table-of-contents position, as in a chunk's locator. */
  number: number;
  title: string;
}

export interface Turn {
  id: string;
  /**
   * `question`: an ordinary question over the whole book. `chapter-retry`: a recoverable
   * question asked again in one chapter. `hint-unclear`: a typed chapter hint that did not
   * name exactly one chapter; it carries no answer, only the chapter offer again.
   */
  kind: 'question' | 'chapter-retry' | 'hint-unclear';
  /** The reader's message; for a chapter retry, the original question it retries. */
  question: string;
  /** `waiting`: no text yet. `streaming`: at least one piece arrived. */
  state: 'waiting' | 'streaming' | 'done' | 'failed';
  /** True once nothing more will be added to this turn, however it ended. */
  stopped: boolean;
  text: string;
  citations: AskCitation[];
  error?: RetrievalError | AnswerError;
  /** Retrieval's verdict, once known, for a `question` turn. */
  verdict?: Verdict;
  /** The chapter a `chapter-retry` turn looks in. */
  chapter?: ChapterChoice;
  /** The recoverable turn a `chapter-retry` or `hint-unclear` turn belongs to. */
  retryOf?: string;
  /** On a recoverable turn: a chapter retry has started for it, so none is offered. */
  recovered?: boolean;
  /** On a `chapter-retry` turn that could not answer: the chapter's full text. */
  handedOver?: string;
}

const newTurnId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export type Mode = 'ask' | 'verify';

/**
 * Verify mode's current claim. `generating`: waiting for a claim. `ready`: shown, not
 * judged yet. `revealed`: judged, with `guess` set and the answer shown.
 */
export interface VerifyState {
  state: 'idle' | 'generating' | 'ready' | 'revealed' | 'failed';
  claim?: MutationClaim;
  guess?: boolean;
  error?: MutationError;
}

export interface VerifyTally {
  judged: number;
  correct: number;
}

/** A short note for screen readers, as a message key so it follows the language. */
export interface Announcement {
  key: MessageKey;
  params?: Params;
}

export interface BookSummary {
  hash: string;
  title: string;
  authors: string[];
  chapters: number;
  filename?: string;
}

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'working'; filename: string }
  | { kind: 'imported'; book: BookSummary; existing: boolean }
  | { kind: 'error'; code: IngestErrorCode; scheme?: DrmScheme }
  /** The new book is held in memory; nothing is saved until the reader adds it. */
  | { kind: 'duplicate'; book: Book; candidates: RegistryEntry[] }
  | { kind: 'save-failed'; reason: 'full' | 'other' };

export type PullState =
  | { status: 'idle' }
  | { status: 'running'; progress?: ModelPullProgress }
  | { status: 'cancelled'; progress?: ModelPullProgress }
  | { status: 'failed'; error: PullError; model?: string };

export type IndexRunState =
  | { kind: 'idle' }
  | {
      kind: 'running';
      /** Undefined until the first numbers arrive. */
      progress?: IndexProgress;
      /** Some chapters were already saved, so this continues where it stopped. */
      resumed: boolean;
      /** The index is being rebuilt because the embedding model changed. */
      rebuild: boolean;
      /** Milliseconds left at this run's measured pace; undefined until it can be said. */
      remainingMs?: number;
    }
  | { kind: 'failed'; error: IndexError };

const summaryOf = (book: Book): BookSummary => ({
  hash: book.hash,
  title: book.title,
  authors: book.authors,
  chapters: book.chapters.length,
  filename: book.sourceFilename,
});

const summaryOfEntry = (entry: RegistryEntry): BookSummary => ({
  hash: entry.hash,
  title: entry.title,
  authors: entry.authors,
  chapters: entry.chapterCount,
  filename: entry.sourceFilename,
});

/**
 * Owns the first-run state and actions. Screens read it and call its methods; they never
 * talk to Ollama or storage themselves. All state is replaced, never mutated in place.
 */
export class OnboardingController {
  settings = $state.raw<Settings>({
    chatModel: '',
    embeddingModel: '',
    ollamaUrl: '',
  });
  /** Undefined while the real state is being determined. */
  readiness = $state.raw<SetupReadiness | undefined>(undefined);
  books = $state.raw<RegistryEntry[]>([]);
  /** True while a check is running, so buttons can show they are busy. */
  checking = $state(false);
  importPostponed = $state(false);
  importRequested = $state(false);
  importState = $state.raw<ImportState>({ kind: 'idle' });
  /** How many extra files were ignored because one book is imported at a time. */
  skippedFiles = $state(0);
  pull = $state.raw<PullState>({ status: 'idle' });
  /** Whether the active book needs indexing for the configured embedding model. */
  index = $state<IndexNeed>('unknown');
  /** Whether Ollama can accelerate answers on this machine. */
  hardwareCheck = $state<HardwareCheck>('unknown');
  /** What is saved for the active book, as of the last time it was worked out. */
  indexInfo = $state.raw<IndexStatus | undefined>(undefined);
  indexState = $state.raw<IndexRunState>({ kind: 'idle' });
  /** The model names being edited on the confirmation screen. */
  modelDraft = $state.raw<RequiredModels>({ chat: '', embedding: '' });
  /** True when the last address the reader typed was not a valid web address. */
  addressError = $state(false);
  announcement = $state.raw<Announcement | undefined>(undefined);
  problem = $state<StorageProblem | undefined>(undefined);
  /** The language preselected on the first-launch screen. */
  suggestedLanguage = $state<Language>('en');

  screen: Screen = $derived.by(() =>
    decideScreen({
      language: this.settings.language,
      readiness: this.readiness,
      bookCount: this.books.length,
      index: this.index,
      hardwareCheck: this.hardwareCheck,
      importPostponed: this.importPostponed,
      importRequested: this.importRequested,
    }),
  );

  /** The saved active book if it still exists, else the most recently imported one. */
  activeBook: RegistryEntry | undefined = $derived.by(
    () =>
      this.books.find((book) => book.hash === this.settings.activeBook) ??
      this.books.at(-1),
  );

  turns = $state.raw<Turn[]>([]);
  /**
   * The active book's chapters that have text, in book order, for pointing a recoverable
   * question to a chapter. Filled when a whole-book question's search returns.
   */
  chapterChoices = $state.raw<ChapterChoice[]>([]);
  /** True while a question is being answered, so only one turn runs at a time. */
  askBusy = $derived(
    this.turns.at(-1)?.state === 'waiting' ||
      this.turns.at(-1)?.state === 'streaming',
  );

  /** The mode shown on the landing screen. Always Ask when the app starts. */
  mode = $state<Mode>('ask');
  verify = $state.raw<VerifyState>({ state: 'idle' });
  /** Claims judged this session for the active book, and how many were judged right. */
  verifyTally = $state.raw<VerifyTally>({ judged: 0, correct: 0 });
  /** True while a claim is being generated, so only one is generated at a time. */
  verifyBusy = $derived(this.verify.state === 'generating');

  private timer: ReturnType<typeof setInterval> | undefined;
  private pullAbort: AbortController | undefined;
  private indexAbort: AbortController | undefined;
  private askAbort: AbortController | undefined;
  private verifyAbort: AbortController | undefined;
  /** Chunks already used for a claim this session, so the same passage is not repeated. */
  private usedChunkIds: string[] = [];
  /** True from the moment an index run starts until it ends, so it is never started twice. */
  private indexing = false;
  /** Which book and model `index` was worked out for, so unchanged answers are reused. */
  private indexKey: string | undefined;
  private lastProgress: ModelPullProgress | undefined;
  private destroyed = false;

  constructor(private readonly services: Services) {}

  /** Loads what was saved and, if a language was chosen, checks the real state. */
  async start(): Promise<void> {
    const { settings, library } = this.services.storage;
    this.settings = settings.load();
    this.modelDraft = {
      chat: this.settings.chatModel,
      embedding: this.settings.embeddingModel,
    };
    this.suggestedLanguage = detectLanguage(this.services.systemLanguages);
    setLanguage(this.settings.language ?? this.suggestedLanguage);
    this.books = await library.registry.list();
    this.refreshProblem();
    if (this.settings.language) await this.runCheck();
  }

  /** Stops the timer and any running index. Call when the app is torn down. */
  destroy(): void {
    this.destroyed = true;
    this.stopPolling();
    this.indexAbort?.abort();
    this.askAbort?.abort();
    this.verifyAbort?.abort();
  }

  // ---- language -----------------------------------------------------------------

  /**
   * Changes the language at once. Before the first choice it only previews the language;
   * it is remembered when the reader confirms it (`confirmLanguage`).
   */
  changeLanguage(language: Language): void {
    setLanguage(language);
    if (this.settings.language) this.save({ language });
  }

  /** Remembers the language currently shown and moves on to checking the real state. */
  async confirmLanguage(): Promise<void> {
    this.save({ language: getLanguage() });
    await this.runCheck();
  }

  // ---- checking Ollama ------------------------------------------------------------

  private models(): RequiredModels {
    return {
      chat: this.modelDraft.chat.trim(),
      embedding: this.modelDraft.embedding.trim(),
    };
  }

  /** Checks the real state. Overlapping checks are skipped, not queued. */
  async runCheck(): Promise<void> {
    if (this.checking || this.destroyed) return;
    this.checking = true;
    try {
      const client = this.services.createClient(this.settings.ollamaUrl);
      const readiness = await checkSetup(client, this.models());
      if (!this.destroyed) {
        this.readiness = readiness;
        if (readiness.step === 'ready') {
          await this.ensureHardwareCheck();
          await this.ensureIndexNeed();
        }
      }
    } finally {
      this.checking = false;
      this.syncPolling();
    }
    await this.syncIndexing();
  }

  /** Re-checks by hand, for the "check again" button. */
  checkAgain(): Promise<void> {
    return this.runCheck();
  }

  // ---- the hardware warning -------------------------------------------------------

  /**
   * Works out whether Ollama can accelerate answers on this machine, unless that is
   * already resolved (accelerated, or the warning already acknowledged), in which case
   * it is skipped without a request.
   */
  private async ensureHardwareCheck(): Promise<void> {
    if (this.settings.hardwareCheckResolved) {
      this.hardwareCheck = 'skip';
      return;
    }
    const client = this.services.createClient(this.settings.ollamaUrl);
    const result = await checkAcceleration(
      client,
      this.settings.embeddingModel,
    );
    if (this.destroyed) return;
    this.hardwareCheck = result.status;
    if (result.status === 'accelerated')
      this.save({ hardwareCheckResolved: true });
  }

  /** "Continue anyway" on the hardware warning screen. */
  acknowledgeHardwareWarning(): void {
    this.save({ hardwareCheckResolved: true });
    this.hardwareCheck = 'skip';
  }

  /** The waiting screens re-check on their own; every other screen only reads once. */
  private syncPolling(): void {
    const waiting =
      this.screen === 'get-ollama' || this.screen === 'update-ollama';
    if (waiting && !this.timer && !this.destroyed) {
      this.timer = setInterval(
        () => void this.runCheck(),
        this.services.pollIntervalMs,
      );
    } else if (!waiting) {
      this.stopPolling();
    }
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** The install steps and the official download page for this platform. */
  get guidance(): InstallGuidance {
    return installGuidance(this.services.platform);
  }

  /** Opens the official download page for this platform. Returns whether it opened. */
  openDownloadPage(): Promise<boolean> {
    return this.services.openExternal(this.guidance.downloadUrl);
  }

  /** Saves a new Ollama address if it is a web address, otherwise reports the error. */
  async setOllamaUrl(text: string): Promise<void> {
    if (!isValidOllamaUrl(text)) {
      this.addressError = true;
      return;
    }
    this.addressError = false;
    this.save({ ollamaUrl: text.trim() });
    await this.runCheck();
  }

  // ---- models ---------------------------------------------------------------------

  /**
   * Remembers the edited names and refreshes the plan, without downloading anything.
   * They are saved as soon as they change: a reader who swaps to models that are
   * already installed never presses Download, and must not be asked again next launch.
   * An empty name goes back to the default.
   */
  async editModels(draft: RequiredModels): Promise<void> {
    this.save({ chatModel: draft.chat, embeddingModel: draft.embedding });
    this.modelDraft = {
      chat: this.settings.chatModel,
      embedding: this.settings.embeddingModel,
    };
    await this.runCheck();
  }

  /** Remembers the chosen names and downloads every missing model. Also resumes one. */
  async startDownload(): Promise<void> {
    if (this.pull.status === 'running') return;
    const models = this.models();
    this.save({ chatModel: models.chat, embeddingModel: models.embedding });

    const abort = new AbortController();
    this.pullAbort = abort;
    this.lastProgress = undefined;
    this.pull = { status: 'running' };

    const client = this.services.createClient(this.settings.ollamaUrl);
    const result = await pullMissingModels(client, models, {
      signal: abort.signal,
      onProgress: (progress) => {
        this.lastProgress = progress;
        this.pull = { status: 'running', progress };
      },
    });
    this.pullAbort = undefined;

    if (result.status === 'success') {
      this.announce('announce.modelsReady');
      // Keep showing "all done" until the check has finished, so the screen never falls
      // back to the confirmation for a moment and looks as if nothing happened.
      await this.runCheck();
      this.pull = { status: 'idle' };
    } else if (result.status === 'cancelled') {
      this.pull = { status: 'cancelled', progress: this.lastProgress };
      this.announce('announce.downloadCancelled');
    } else {
      this.pull = {
        status: 'failed',
        error: result.error,
        model: result.model,
      };
      this.announce('announce.downloadFailed');
    }
  }

  cancelDownload(): void {
    this.pullAbort?.abort();
  }

  /**
   * Retries after a failure: the state is checked first, so if Ollama stopped the flow
   * goes back to the get-Ollama screen instead of failing again.
   */
  async retryDownload(): Promise<void> {
    this.pull = { status: 'idle' };
    await this.runCheck();
    if (this.readiness?.step === 'pull-models') await this.startDownload();
  }

  // ---- importing a book -------------------------------------------------------------

  /** Asks for the import screen from the landing screen. */
  requestImport(): void {
    this.importState = { kind: 'idle' };
    this.skippedFiles = 0;
    this.importRequested = true;
  }

  /** "Not now": go to the landing screen for the rest of this session. */
  postponeImport(): void {
    this.importPostponed = true;
    this.importRequested = false;
    this.importState = { kind: 'idle' };
  }

  /** Back from the import screen once the reader is done with its result. */
  finishImport(): void {
    this.importRequested = false;
    this.importState = { kind: 'idle' };
    this.skippedFiles = 0;
  }

  /** Clears an error or a cancelled duplicate so another file can be chosen. */
  tryAnotherFile(): void {
    this.importState = { kind: 'idle' };
    this.skippedFiles = 0;
  }

  /** Imports the first file; any others are counted as skipped. The file is only read. */
  async importFiles(files: readonly File[]): Promise<void> {
    if (this.importState.kind === 'working' || files.length === 0) return;
    const file = files[0];
    this.skippedFiles = files.length - 1;
    this.importRequested = true;
    this.importState = { kind: 'working', filename: file.name };
    await this.services.nextFrame();

    let result;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      result = await this.services.ingest(bytes, {
        filename: file.name,
        registry: this.services.storage.library.registry,
      });
    } catch {
      this.importState = { kind: 'error', code: 'malformed-epub' };
      this.announce('announce.importFailed');
      return;
    }

    switch (result.status) {
      case 'existing':
        this.save({ activeBook: result.entry.hash });
        this.resetBookSession();
        this.importState = {
          kind: 'imported',
          book: summaryOfEntry(result.entry),
          existing: true,
        };
        this.announce('announce.importDone', {
          title: result.entry.title || file.name,
        });
        await this.ensureIndexNeed();
        await this.syncIndexing();
        return;
      case 'new':
        await this.saveAndActivate(result.book);
        return;
      case 'possible-duplicate':
        this.importState = {
          kind: 'duplicate',
          book: result.book,
          candidates: result.candidates,
        };
        return;
      case 'error':
        this.importState = {
          kind: 'error',
          code: result.error.code,
          scheme: result.error.scheme,
        };
        this.announce('announce.importFailed');
        return;
    }
  }

  /** Answers the possible-duplicate question: add it as its own book, or cancel. */
  async answerDuplicate(answer: 'add' | 'cancel'): Promise<void> {
    const state = this.importState;
    if (state.kind !== 'duplicate') return;
    if (answer === 'cancel') {
      this.importState = { kind: 'idle' };
      return;
    }
    await this.saveAndActivate(state.book);
  }

  private async saveAndActivate(book: Book): Promise<void> {
    const { library } = this.services.storage;
    try {
      await library.saveBook(book);
    } catch (error) {
      if (error instanceof DuplicateHashError) {
        // Saved by an earlier attempt: treat it as already imported.
        this.save({ activeBook: book.hash });
        this.resetBookSession();
        this.importState = {
          kind: 'imported',
          book: summaryOf(book),
          existing: true,
        };
        await this.ensureIndexNeed();
        await this.syncIndexing();
        return;
      }
      this.importState = {
        kind: 'save-failed',
        reason: error instanceof StorageFullError ? 'full' : 'other',
      };
      this.announce('announce.importFailed');
      return;
    }
    this.books = await library.registry.list();
    this.save({ activeBook: book.hash });
    this.resetBookSession();
    this.importState = {
      kind: 'imported',
      book: summaryOf(book),
      existing: false,
    };
    this.announce('announce.importDone', {
      title: book.title || book.sourceFilename || '',
    });
    await this.ensureIndexNeed();
    await this.syncIndexing();
  }

  // ---- indexing the active book -------------------------------------------------------

  /**
   * Works out whether the active book has vectors for the configured embedding model.
   * The answer is reused until the book or the model changes, or `force` is set, so the
   * waiting screens' repeated checks do not reread the book every few seconds.
   */
  private async ensureIndexNeed(force = false): Promise<void> {
    const entry = this.activeBook;
    const model = this.models().embedding;
    const key = `${entry?.hash ?? ''}|${model}`;
    if (!force && this.index !== 'unknown' && key === this.indexKey) return;

    const { library } = this.services.storage;
    try {
      const book = entry ? await library.getBook(entry.hash) : undefined;
      if (!book) {
        this.indexInfo = undefined;
        this.index = 'ready';
      } else {
        const info = await indexStatus(book, model, library.vectors);
        this.indexInfo = info;
        this.index = info.state === 'complete' ? 'ready' : 'needed';
      }
      this.indexKey = key;
    } catch {
      // Saved vectors could not be read: let indexing run and report what is wrong.
      this.indexInfo = undefined;
      this.index = 'needed';
      this.indexKey = key;
    }
  }

  /**
   * Indexes the active book when the indexing screen is showing and nothing is running.
   * It starts by itself: the reader already chose this book, it downloads nothing, and it
   * changes only the app's own index. After a failure it waits for `retryIndexing`.
   */
  private async syncIndexing(): Promise<void> {
    if (this.destroyed || this.indexing) return;
    if (this.screen !== 'index-book' || this.indexState.kind === 'failed')
      return;
    await this.runIndexing();
  }

  private async runIndexing(): Promise<void> {
    this.indexing = true;
    const abort = new AbortController();
    this.indexAbort = abort;
    try {
      await this.ensureIndexNeed(true);
      const entry = this.activeBook;
      const info = this.indexInfo;
      if (this.index !== 'needed' || !entry || !info) return;

      const { library } = this.services.storage;
      const book = await library.getBook(entry.hash);
      if (!book) return;

      this.indexState = {
        kind: 'running',
        resumed: info.chapterDone > 0,
        rebuild: info.rebuild,
      };
      let pace: Pace | undefined;
      const result = await indexBook({
        book,
        model: this.models().embedding,
        client: this.services.createClient(this.settings.ollamaUrl),
        store: library.vectors,
        signal: abort.signal,
        onProgress: (progress) => {
          const current = this.indexState;
          if (current.kind !== 'running') return;
          const now = this.services.now();
          pace = updatePace(pace, progress.chunksDone, now);
          // Only new work changes the estimate; a report that repeats the count keeps it.
          const estimate =
            progress.chunksDone !== current.progress?.chunksDone
              ? estimateRemainingMs(
                  pace,
                  progress.chunksDone,
                  progress.chunksTotal,
                  now,
                )
              : undefined;
          this.indexState = {
            ...current,
            progress,
            remainingMs: estimate ?? current.remainingMs,
          };
        },
      });

      if (result.status === 'complete') {
        this.indexState = { kind: 'idle' };
        await this.ensureIndexNeed(true);
        this.announce('announce.indexingDone', {
          title: entry.title || entry.sourceFilename || '',
        });
      } else if (result.status === 'aborted') {
        this.indexState = { kind: 'idle' };
      } else {
        this.indexState = { kind: 'failed', error: result.error };
        this.announce('announce.indexingFailed');
      }
    } finally {
      this.indexAbort = undefined;
      this.indexing = false;
    }
  }

  /**
   * Tries again after a failure. The real state is checked first, so if Ollama stopped
   * the flow goes back to the get-Ollama screen, and indexing resumes by itself once the
   * state allows.
   */
  async retryIndexing(): Promise<void> {
    this.indexState = { kind: 'idle' };
    await this.runCheck();
  }

  // ---- the Ask mode conversation ------------------------------------------------------

  /** Replaces a turn by id, or appends it if the id is not present. */
  private setTurn(turn: Turn): void {
    const index = this.turns.findIndex((existing) => existing.id === turn.id);
    this.turns =
      index === -1
        ? [...this.turns, turn]
        : this.turns.map((existing, position) =>
            position === index ? turn : existing,
          );
  }

  /**
   * Asks a question about the active book. Does nothing if a question is already being
   * answered, or the question is empty. Retrieval runs first, then generation; both are
   * against the models and address saved in settings.
   */
  async askQuestion(question: string): Promise<void> {
    if (this.askBusy || question.trim() === '') return;

    // Right after a recoverable turn (or a "which chapter?" turn about it), a message
    // naming a chapter points that turn's question to a chapter instead of starting a
    // new search.
    let last = this.turns.at(-1);
    if (last?.kind === 'hint-unclear')
      last = this.turns.find((turn) => turn.id === last?.retryOf);
    const number = findChapterReference(question);
    if (last && this.canRecover(last) && number !== undefined) {
      // Matched against every chapter, including heading-only ones such as "II":
      // they carry the numbers, and stand for the chapter after them.
      const matches = matchChapterByTitle(
        await this.activeBookChapters(),
        number,
      );
      if (matches.length === 1) {
        await this.retryInChapter(last.id, matches[0].number);
        return;
      }
      this.setTurn({
        id: newTurnId(),
        kind: 'hint-unclear',
        question,
        state: 'done',
        stopped: false,
        text: '',
        citations: [],
        retryOf: last.id,
      });
      this.announce('announce.chapterUnclear');
      return;
    }

    await this.runTurn({
      id: newTurnId(),
      kind: 'question',
      question,
      state: 'waiting',
      stopped: false,
      text: '',
      citations: [],
    });
  }

  /**
   * Whether a whole-book question can still be retried in a chapter: it finished (not
   * stopped, not failed) with no resolved citation, and no chapter retry has started for
   * it. That covers a search that found nothing relevant (whose fixed reply never cites)
   * and an answer that cites no passage, which the reader cannot check either.
   */
  canRecover(turn: Turn): boolean {
    return (
      turn.kind === 'question' &&
      turn.state === 'done' &&
      !turn.stopped &&
      !turn.recovered &&
      turn.citations.length === 0
    );
  }

  /**
   * Asks a recoverable turn's question again, in one chapter only. Does nothing if the
   * turn cannot be recovered (see `canRecover`), the chapter is not one with text, or a
   * question is being answered. Only one chapter retry is ever made per question.
   */
  async retryInChapter(turnId: string, chapterNumber: number): Promise<void> {
    const target = this.turns.find((turn) => turn.id === turnId);
    if (!target || !this.canRecover(target) || this.askBusy) return;
    const chapter = (await this.activeChapters()).find(
      (choice) => choice.number === chapterNumber,
    );
    if (!chapter || this.askBusy) return;

    this.setTurn({ ...target, recovered: true });
    await this.runTurn({
      id: newTurnId(),
      kind: 'chapter-retry',
      question: target.question,
      state: 'waiting',
      stopped: false,
      text: '',
      citations: [],
      chapter: { number: chapter.number, title: chapter.title },
      retryOf: target.id,
    });
  }

  /** Stops the turn in progress, if any. What arrived so far is kept. */
  stopAnswer(): void {
    this.askAbort?.abort();
  }

  /** Re-asks a failed turn's own question, in its own place in the conversation. */
  async retryTurn(id: string): Promise<void> {
    const turn = this.turns.find((existing) => existing.id === id);
    if (!turn || turn.state !== 'failed' || this.askBusy) return;
    await this.runTurn({
      ...turn,
      state: 'waiting',
      stopped: false,
      text: '',
      citations: [],
      error: undefined,
      verdict: undefined,
      handedOver: undefined,
    });
  }

  private async runTurn(start: Turn): Promise<void> {
    this.setTurn(start);
    const abort = new AbortController();
    this.askAbort = abort;
    const entry = this.activeBook;
    try {
      const { library } = this.services.storage;
      const book = entry ? await library.getBook(entry.hash) : undefined;
      if (!book) return;

      const retrieved = await retrievePassages({
        book,
        question: start.question,
        model: this.settings.embeddingModel,
        client: this.services.createClient(this.settings.ollamaUrl),
        store: library.vectors,
        chapterNumber: start.chapter?.number,
        signal: abort.signal,
      });
      if (retrieved.status === 'aborted') {
        this.setTurn({ ...start, state: 'done', stopped: true });
        return;
      }
      if (retrieved.status === 'failed') {
        this.setTurn({ ...start, state: 'failed', error: retrieved.error });
        this.announce('announce.answerFailed');
        return;
      }

      const retry = start.kind === 'chapter-retry';
      // The chapter's own text, handed over when a chapter retry cannot answer.
      const chapterText = retry
        ? (book.chapters.find(
            (chapter) => chapter.number === start.chapter?.number,
          )?.text ?? '')
        : '';
      if (!retry) {
        start = { ...start, verdict: retrieved.verdict };
        // Offered if the turn ends recoverable: nothing found, or an uncited answer.
        this.chapterChoices = choicesOf(book.chapters);
      } else if (retrieved.passages.length === 0) {
        this.setTurn({ ...start, state: 'done', handedOver: chapterText });
        this.announce('announce.chapterShown');
        return;
      }

      const generated = await generateAnswer({
        // A chapter retry answers from the chapter's best passages even below the cutoff.
        verdict: retry ? 'relevant' : retrieved.verdict,
        question: start.question,
        passages: retrieved.passages,
        model: this.settings.chatModel,
        client: this.services.createClient(this.settings.ollamaUrl),
        language: getLanguage(),
        signal: abort.signal,
      });
      if (generated.status === 'aborted') {
        this.setTurn({ ...start, state: 'done', stopped: true });
        return;
      }
      if (generated.status === 'failed') {
        this.setTurn({ ...start, state: 'failed', error: generated.error });
        this.announce('announce.answerFailed');
        return;
      }

      // A citation carries only the chunk id and locator; the passage's own text, so the
      // reader can check the claim without opening the book, comes from what was retrieved.
      const withText = (): AskCitation[] =>
        generated.citations().map((citation) => ({
          ...citation,
          text:
            retrieved.passages.find((p) => p.chunkId === citation.chunkId)
              ?.text ?? '',
        }));

      let text = '';
      try {
        for await (const piece of generated.chunks) {
          text += piece;
          this.setTurn({
            ...start,
            state: 'streaming',
            text,
            citations: [],
          });
        }
      } catch (error) {
        this.setTurn({
          ...start,
          state: 'failed',
          text,
          citations: withText(),
          error: error as AnswerError,
        });
        this.announce('announce.answerFailed');
        return;
      }
      const citations = withText();
      // A chapter retry whose finished answer cites nothing could not answer: stop
      // asking and hand over the chapter itself.
      const handOver = retry && !abort.signal.aborted && citations.length === 0;
      this.setTurn({
        ...start,
        state: 'done',
        stopped: abort.signal.aborted,
        text,
        citations,
        ...(handOver ? { handedOver: chapterText } : {}),
      });
      this.announce(handOver ? 'announce.chapterShown' : 'announce.answerDone');
    } finally {
      this.askAbort = undefined;
    }
  }

  // ---- Verify mode ------------------------------------------------------------------

  /** Switches between Ask and Verify mode. Nothing running in either mode is stopped. */
  setMode(mode: Mode): void {
    this.mode = mode;
  }

  /**
   * Generates one claim about the active book, true or changed, from a passage not used
   * yet this session. Does nothing while a claim is already being generated.
   */
  async requestClaim(): Promise<void> {
    if (this.verifyBusy) return;
    this.verify = { state: 'generating' };
    const abort = new AbortController();
    this.verifyAbort = abort;
    const current = () => this.verifyAbort === abort;
    try {
      const entry = this.activeBook;
      const book = entry
        ? await this.services.storage.library.getBook(entry.hash)
        : undefined;
      if (!current()) return;
      if (!book) {
        this.verify = { state: 'idle' };
        return;
      }

      const generate = () =>
        generateClaim({
          book,
          model: this.settings.chatModel,
          client: this.services.createClient(this.settings.ollamaUrl),
          excludeChunkIds: this.usedChunkIds,
          random: this.services.random,
          signal: abort.signal,
        });
      let result = await generate();
      // Every passage has been used this session: start over rather than stop the reader.
      if (
        current() &&
        result.status === 'failed' &&
        result.error.code === 'no-chunks-available' &&
        this.usedChunkIds.length > 0
      ) {
        this.usedChunkIds = [];
        result = await generate();
      }
      if (!current()) return;

      if (result.status === 'aborted') {
        this.verify = { state: 'idle' };
      } else if (result.status === 'failed') {
        this.verify = { state: 'failed', error: result.error };
        this.announce('announce.claimFailed');
      } else {
        this.usedChunkIds = [
          ...this.usedChunkIds,
          result.claim.citation.chunkId,
        ];
        this.verify = { state: 'ready', claim: result.claim };
        this.announce('announce.claimReady');
      }
    } finally {
      if (current()) this.verifyAbort = undefined;
    }
  }

  /** Stops the claim being generated, if any. Nothing is shown and nothing is counted. */
  stopClaim(): void {
    this.verifyAbort?.abort();
  }

  /** Requests a new claim after a failure. */
  retryClaim(): Promise<void> {
    return this.requestClaim();
  }

  /** Records the reader's judgment of the current claim and reveals the answer, once. */
  judgeClaim(guess: boolean): void {
    if (this.verify.state !== 'ready' || !this.verify.claim) return;
    const right = guess === this.verify.claim.isTrue;
    this.verify = { state: 'revealed', claim: this.verify.claim, guess };
    this.verifyTally = {
      judged: this.verifyTally.judged + 1,
      correct: this.verifyTally.correct + (right ? 1 : 0),
    };
    this.announce(right ? 'announce.judgedRight' : 'announce.judgedWrong');
  }

  /** Clears everything kept for this session about the active book, in both modes. */
  private resetBookSession(): void {
    this.turns = [];
    this.chapterChoices = [];
    this.verifyAbort?.abort();
    this.verifyAbort = undefined;
    this.verify = { state: 'idle' };
    this.verifyTally = { judged: 0, correct: 0 };
    this.usedChunkIds = [];
  }

  // ---- helpers ----------------------------------------------------------------------

  /** The active book's chapters with text, loading the book when none are known yet. */
  private async activeChapters(): Promise<ChapterChoice[]> {
    if (this.chapterChoices.length > 0) return this.chapterChoices;
    const chapters = await this.activeBookChapters();
    if (chapters.length > 0) this.chapterChoices = choicesOf(chapters);
    return this.chapterChoices;
  }

  /** Every chapter of the active book, with its text; empty when there is no book. */
  private async activeBookChapters(): Promise<Book['chapters']> {
    const entry = this.activeBook;
    const book = entry
      ? await this.services.storage.library.getBook(entry.hash)
      : undefined;
    return book?.chapters ?? [];
  }

  private save(patch: Partial<Settings>): void {
    this.services.storage.settings.save(patch);
    this.settings = this.services.storage.settings.load();
    this.refreshProblem();
  }

  private refreshProblem(): void {
    this.problem = storageProblem(this.services.storage);
  }

  private announce(key: MessageKey, params?: Params): void {
    this.announcement = { key, params };
  }
}

/**
 * A book's chapters that have text of their own, in book order, as choices for a chapter
 * retry. Empty and heading-only entries (see `hasOwnText`) have nothing to look in.
 */
function choicesOf(chapters: Book['chapters']): ChapterChoice[] {
  return chapters
    .filter(hasOwnText)
    .map(({ number, title }) => ({ number, title }));
}
