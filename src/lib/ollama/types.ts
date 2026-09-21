/** Availability of the Ollama service (see `detectOllama`). */
export type OllamaStatus =
  | { status: 'ready'; version: string }
  | { status: 'outdated'; version: string; minimumVersion: string }
  /** No answer, or an answer that is not Ollama. Also covers "installed but not running". */
  | { status: 'unreachable' };

/** The two models the app needs: one to chat, one to embed text. */
export interface RequiredModels {
  chat: string;
  embedding: string;
}

export type ModelRole = keyof RequiredModels;

/** Whether one required model is installed. `model` is the name as configured. */
export interface ModelStatus {
  role: ModelRole;
  model: string;
  installed: boolean;
}

export type ModelReport = ModelStatus[];

/** Result of reading the installed models; a failed read is never "nothing installed". */
export type ModelCheckResult =
  | { ok: true; models: ModelReport }
  | { ok: false; error: { code: 'unreachable' } };

export interface DownloadPlanItem {
  role: ModelRole;
  model: string;
  /** Approximate download size in bytes; undefined when not known. */
  approxBytes?: number;
}

/** What a pull would download. Building a plan never downloads anything. */
export interface DownloadPlan {
  /** Missing required models only. */
  items: DownloadPlanItem[];
  /** Sum of the known sizes; models with an unknown size are left out of it. */
  totalKnownBytes: number;
}

export type PullPhase =
  'preparing' | 'downloading' | 'verifying' | 'finishing' | 'done';

export interface PullProgress {
  phase: PullPhase;
  /** Bytes completed, summed across every part of the model. */
  completedBytes: number;
  /** Total bytes, summed across the parts announced so far. It can grow as parts appear. */
  totalBytes: number;
  /** `completedBytes / totalBytes`, or undefined while the total is unknown. */
  fraction?: number;
}

export type PullErrorCode =
  'unreachable' | 'model-not-found' | 'insufficient-disk-space' | 'pull-failed';

export interface PullError {
  code: PullErrorCode;
  /** Ollama's own message, kept for diagnostics. */
  detail?: string;
}

export type PullResult =
  | { status: 'success' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: PullError };

/** The next thing the reader has to do (see `checkSetup`). */
export type SetupReadiness =
  /** Ollama is missing or not running. */
  | { step: 'get-ollama' }
  | { step: 'update-ollama'; version: string; minimumVersion: string }
  | {
      step: 'pull-models';
      version: string;
      models: ModelReport;
      plan: DownloadPlan;
    }
  | { step: 'ready'; version: string; models: ModelReport };

export type Platform = 'windows' | 'macos' | 'linux' | 'unknown';

/** Ordered, wording-free steps for getting Ollama running; the interface supplies the text. */
export type InstallStep = 'download' | 'install' | 'start' | 'recheck';

export interface InstallGuidance {
  downloadUrl: string;
  steps: InstallStep[];
}

export interface OllamaClientOptions {
  /** Where Ollama listens. Defaults to the standard local address. */
  baseUrl?: string;
  /** Replaceable so tests can stand in for the network. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Time limit for detection, in milliseconds. */
  timeoutMs?: number;
}

/** Progress update from pulling several models in sequence. */
export interface ModelPullProgress extends PullProgress {
  model: string;
}

/** Outcome of pulling every missing required model, one after another. */
export type PullMissingResult =
  /** Every missing model was downloaded (`pulled` may be empty if none were missing). */
  | { status: 'success'; pulled: string[] }
  /** The caller cancelled while `model` was downloading. */
  | { status: 'cancelled'; pulled: string[]; model: string }
  /** `model` failed to download; undefined when Ollama could not be reached to start. */
  | { status: 'failed'; pulled: string[]; model?: string; error: PullError };
