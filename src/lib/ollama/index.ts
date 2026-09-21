export { createOllamaClient, type OllamaClient } from './client';
export {
  APPROX_MODEL_BYTES,
  DEFAULT_BASE_URL,
  DEFAULT_MODELS,
  MINIMUM_OLLAMA_VERSION,
} from './defaults';
export { detectOllama } from './detect';
export { installGuidance } from './guidance';
export { checkModels, normalizeModelName, planDownloads } from './models';
export { pullModel, type PullOptions } from './pull';
export {
  checkSetup,
  pullMissingModels,
  type PullMissingOptions,
} from './setup';
export type {
  DownloadPlan,
  DownloadPlanItem,
  InstallGuidance,
  InstallStep,
  ModelCheckResult,
  ModelPullProgress,
  ModelReport,
  ModelRole,
  ModelStatus,
  OllamaClientOptions,
  OllamaStatus,
  Platform,
  PullError,
  PullErrorCode,
  PullMissingResult,
  PullPhase,
  PullProgress,
  PullResult,
  RequiredModels,
  SetupReadiness,
} from './types';
