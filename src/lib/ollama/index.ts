export { createOllamaClient, type OllamaClient } from './client';
export {
  APPROX_MODEL_BYTES,
  DEFAULT_BASE_URL,
  DEFAULT_MODELS,
  IDLE_UNLOAD_CHOICES,
  IDLE_UNLOAD_DEFAULT,
  isIdleUnload,
  keepAliveFor,
  MINIMUM_OLLAMA_VERSION,
  type IdleUnload,
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
