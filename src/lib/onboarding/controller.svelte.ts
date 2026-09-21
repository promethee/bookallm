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
import { decideScreen, type Screen } from './screens';
import type { Services } from './services';

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

  private timer: ReturnType<typeof setInterval> | undefined;
  private pullAbort: AbortController | undefined;
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

  /** Stops the timer. Call when the app is torn down. */
  destroy(): void {
    this.destroyed = true;
    this.stopPolling();
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
      if (!this.destroyed) this.readiness = readiness;
    } finally {
      this.checking = false;
      this.syncPolling();
    }
  }

  /** Re-checks by hand, for the "check again" button. */
  checkAgain(): Promise<void> {
    return this.runCheck();
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
        this.importState = {
          kind: 'imported',
          book: summaryOfEntry(result.entry),
          existing: true,
        };
        this.announce('announce.importDone', {
          title: result.entry.title || file.name,
        });
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
        this.importState = {
          kind: 'imported',
          book: summaryOf(book),
          existing: true,
        };
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
    this.importState = {
      kind: 'imported',
      book: summaryOf(book),
      existing: false,
    };
    this.announce('announce.importDone', {
      title: book.title || book.sourceFilename || '',
    });
  }

  // ---- helpers ----------------------------------------------------------------------

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
