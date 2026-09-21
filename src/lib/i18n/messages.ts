export type Params = Record<string, string | number>;

/** Text with `{name}` slots, or a function when the wording needs logic (plurals). */
export type Message = string | ((params: Params) => string);

/**
 * English is the source table. Screens add their messages here, and French must then
 * add the same keys (checked by the compiler through `Record<MessageKey, Message>`).
 */
export const en = {
  'app.name': 'BookaLLM',

  'language.label': 'Language',
  'language.name.en': 'English',
  'language.name.fr': 'Français',

  'common.cancel': 'Cancel',
  'common.continue': 'Continue',
  'common.tryAgain': 'Try again',
  'common.details': 'Details',
  'common.checkAgain': 'Check again',
  'common.notNow': 'Not now',

  'announce.modelsReady': 'The models are installed.',
  'announce.downloadCancelled':
    'Download cancelled. You can continue where it stopped.',
  'announce.downloadFailed': 'The download did not finish.',
  'announce.importDone': 'Imported: {title}',
  'announce.importFailed': 'The book could not be imported.',

  'common.chapters': ({ count }) =>
    count === 1 ? '1 chapter' : `${count} chapters`,
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;

export const fr: Record<MessageKey, Message> = {
  'app.name': 'BookaLLM',

  'language.label': 'Langue',
  'language.name.en': 'English',
  'language.name.fr': 'Français',

  'common.cancel': 'Annuler',
  'common.continue': 'Continuer',
  'common.tryAgain': 'Réessayer',
  'common.details': 'Détails',
  'common.checkAgain': 'Vérifier à nouveau',
  'common.notNow': 'Pas maintenant',

  'announce.modelsReady': 'Les modèles sont installés.',
  'announce.downloadCancelled':
    'Téléchargement annulé. Vous pouvez reprendre là où il s’est arrêté.',
  'announce.downloadFailed': 'Le téléchargement ne s’est pas terminé.',
  'announce.importDone': 'Importé : {title}',
  'announce.importFailed': 'Le livre n’a pas pu être importé.',

  'common.chapters': ({ count }) =>
    count === 1 ? '1 chapitre' : `${count} chapitres`,
};
