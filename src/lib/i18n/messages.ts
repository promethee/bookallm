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

  'storage.unavailable':
    'This device is not letting BookaLLM save anything, so your choices and books will be forgotten when you close it.',
  'storage.full':
    'There is not enough room to save your changes. Free up some space, then try again.',

  'checking.title': 'Checking your setup…',
  'checking.body':
    'One moment while BookaLLM looks at what is already installed.',

  'languageScreen.title': 'Choose your language',
  'languageScreen.body':
    'You can change it at any time from the top of the window.',

  'landing.mode': 'Ask mode — answers are cited, check them',
  'landing.activeBook': 'Active book',
  'landing.byAuthors': 'by {authors}',
  'landing.noBook': 'No book is selected yet. Import an EPUB to get started.',
  'landing.comingSoon':
    'Asking questions arrives in a later step. Your setup and your books are ready.',
  'landing.import': 'Import a book',

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

  'storage.unavailable':
    'Cet appareil ne permet pas à BookaLLM d’enregistrer quoi que ce soit : vos choix et vos livres seront oubliés à la fermeture.',
  'storage.full':
    'Il n’y a pas assez de place pour enregistrer vos changements. Libérez de l’espace, puis réessayez.',

  'checking.title': 'Vérification de votre installation…',
  'checking.body': 'Un instant, BookaLLM regarde ce qui est déjà installé.',

  'languageScreen.title': 'Choisissez votre langue',
  'languageScreen.body':
    'Vous pourrez la changer à tout moment depuis le haut de la fenêtre.',

  'landing.mode': 'Mode Question — les réponses sont citées, vérifiez-les',
  'landing.activeBook': 'Livre actif',
  'landing.byAuthors': 'de {authors}',
  'landing.noBook':
    'Aucun livre n’est sélectionné pour l’instant. Importez un EPUB pour commencer.',
  'landing.comingSoon':
    'Poser des questions arrivera dans une prochaine étape. Votre installation et vos livres sont prêts.',
  'landing.import': 'Importer un livre',

  'common.chapters': ({ count }) =>
    count === 1 ? '1 chapitre' : `${count} chapitres`,
};
