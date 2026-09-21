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
  'announce.indexingDone': 'Your book is ready: {title}',
  'announce.indexingFailed': 'The book could not be prepared.',

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

  'landing.mode': 'Ask mode: answers are cited, check them',
  'landing.activeBook': 'Active book',
  'landing.byAuthors': 'by {authors}',
  'landing.noBook': 'No book is selected yet. Import an EPUB to get started.',
  'landing.comingSoon':
    'Asking questions arrives in a later step. Your setup and your books are ready.',
  'landing.import': 'Import a book',

  'ollama.get.title': 'Let’s get Ollama running',
  'ollama.get.intro':
    'BookaLLM answers your questions with an AI model that runs on your own computer. Your books and everything else in BookaLLM stay on this computer and are never sent anywhere. A free program called Ollama runs that model, and BookaLLM could not find it.',
  'ollama.get.mayBeInstalled':
    'It may already be installed but not running. If so, just start it: this page will notice.',
  'ollama.step.download': 'Download Ollama from its official website.',
  'ollama.step.install':
    'Open the file you downloaded and follow the installer.',
  'ollama.step.start':
    'Make sure Ollama is running. If it is already installed, open it like any other app.',
  'ollama.step.recheck':
    'Come back here. This page checks by itself every few seconds, or you can press “Check again”.',
  'ollama.downloadButton': 'Go to the Ollama download page',
  'ollama.downloadAddress': 'Download page: {url}',
  'ollama.openFailed':
    'Your web browser could not be opened. Copy the address below into your browser instead.',
  'ollama.advanced': 'Advanced settings',
  'ollama.address.label': 'Ollama address',
  'ollama.address.help':
    'Only change this if Ollama runs somewhere other than this computer.',
  'ollama.address.invalid':
    'That does not look like a web address. It should start with http:// or https://.',
  'ollama.address.use': 'Use this address',
  'ollama.update.title': 'Ollama needs an update',
  'ollama.update.body':
    'You have Ollama {version}, but BookaLLM needs version {minimum} or newer.',
  'ollama.update.step':
    'Download the latest version from the official website and install it over the old one. Then come back here.',

  'models.title': 'Download the AI models',
  'models.intro':
    'BookaLLM needs two AI models on your computer: one to read and answer, and one to find the right passages in your books. This is a one-time step and may take a few minutes. Nothing is downloaded until you press the button.',
  'models.toDownload': 'To download',
  'models.role.chat': 'Answering model',
  'models.role.embedding': 'Search model',
  'models.item.size': '{name}: about {size}',
  'models.item.unknownSize': '{name}: size unknown',
  'models.total': 'Total: about {size}',
  'models.totalPartial': 'Total of the known sizes: about {size}',
  'models.different': 'Use different models (advanced)',
  'models.editHint':
    'Enter the name of any model Ollama offers. The list above updates when you leave the field.',
  'models.download': 'Download',
  'models.downloading': 'Downloading {name}…',
  'models.phase.preparing': 'Getting ready…',
  'models.phase.downloading': 'Downloading…',
  'models.phase.verifying':
    'Download complete. BookaLLM is now checking that it arrived intact. This can take a minute, so please keep this window open.',
  'models.phase.finishing': 'Almost there. Finishing up…',
  'models.phase.done': 'All done. Moving on…',
  'models.amount': '{done} of {total}',
  'models.progressLabel': 'Download progress',
  'models.cancelled':
    'The download was cancelled. Nothing is lost: press Continue to pick up where it stopped.',
  'models.error.unreachable':
    'Ollama seems to have stopped while downloading. Make sure it is running, then try again.',
  'models.error.notFound':
    'Ollama does not have a model called “{name}”. Check the name and try again.',
  'models.error.diskSpace':
    'There is not enough free space on your disk. Free up some space, then try again.',
  'models.error.other': 'The download did not finish.',

  'import.title': 'Add a book',
  'import.body':
    'Choose an EPUB book from your computer, or drop it here. BookaLLM only reads the file: it never changes, moves or deletes it.',
  'import.drop': 'Drop an EPUB here, or choose a file',
  'import.working': 'Getting to know this book…',
  'import.workingFile': 'Reading {filename}',
  'import.done.title': 'Book added',
  'import.done.body':
    'BookaLLM has read the book and saved it on this computer. It is now your active book.',
  'import.done.existingTitle': 'You already have this book',
  'import.done.existingBody':
    'It is already in BookaLLM, so nothing new was added. It is now your active book.',
  'import.skipped': ({ count }) =>
    count === 1
      ? 'BookaLLM adds one book at a time, so only the first file was added. The other file was left out.'
      : `BookaLLM adds one book at a time, so only the first file was added. The other ${count} files were left out.`,
  'indexing.title': 'Getting to know your book',
  'indexing.forBook': 'Preparing “{title}” so you can ask questions about it.',
  'indexing.intro':
    'This is a one-time step. It can take from a few minutes to a few hours, depending on your computer and the length of the book. You can close BookaLLM at any time: it will continue where it stopped.',
  'indexing.estimating': 'Working out how long this will take…',
  'indexing.remaining': 'About {time} left.',
  'indexing.remainingSoon': 'Less than a minute left.',
  'indexing.starting': 'Getting ready…',
  'indexing.chapter': 'Chapter {current} of {total}',
  'indexing.progressLabel': 'Preparation progress',
  'indexing.resumed': 'Continuing where it stopped.',
  'indexing.rebuild':
    'The search model was changed, so BookaLLM is getting to know this book again.',
  'indexing.error.unreachable':
    'Ollama seems to have stopped. Make sure it is running, then try again. What was already done is kept.',
  'indexing.error.notFound':
    'Ollama does not have a model called “{name}”. Check the name of the search model, then try again.',
  'indexing.error.diskSpace':
    'There is not enough room to save this book. Free up some space, then try again. What was already done is kept.',
  'indexing.error.other': 'The book could not be prepared.',
  'import.tryAnother': 'Try another file',
  'import.error.title': 'This book could not be added',
  'import.error.notEpub':
    'This file is not an EPUB book. Choose a file whose name ends in .epub.',
  'import.error.malformed':
    'This EPUB could not be read. The file may be damaged: try another copy of the book.',
  'import.error.noText':
    'This EPUB has no readable text in it, only images. BookaLLM needs the text to work with.',
  'import.error.drm':
    'This book is protected against copying (DRM). BookaLLM never removes that protection, so it cannot open this file. You need a copy of the book without protection; public-domain books usually come without it.',
  'import.duplicate.title': 'Is this a book you already have?',
  'import.duplicate.body':
    'This file has the same title or file name as a book you already added, but it is not the same file, so it may be another edition. If you add it, both books are kept and nothing is replaced.',
  'import.duplicate.new': 'The file you chose',
  'import.duplicate.existing': 'Already in BookaLLM',
  'import.duplicate.add': 'Add as a separate book',
  'import.saveFailed.title': 'The book could not be saved',
  'import.saveFailed.full':
    'There is not enough room to save this book. Free up some space, then try again.',
  'import.saveFailed.other':
    'This book could not be saved on this device. Nothing was added.',

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
  'announce.indexingDone': 'Votre livre est prêt : {title}',
  'announce.indexingFailed': 'Le livre n’a pas pu être préparé.',

  'storage.unavailable':
    'Cet appareil ne permet pas à BookaLLM d’enregistrer quoi que ce soit : vos choix et vos livres seront oubliés à la fermeture.',
  'storage.full':
    'Il n’y a pas assez de place pour enregistrer vos changements. Libérez de l’espace, puis réessayez.',

  'checking.title': 'Vérification de votre installation…',
  'checking.body': 'Un instant, BookaLLM regarde ce qui est déjà installé.',

  'languageScreen.title': 'Choisissez votre langue',
  'languageScreen.body':
    'Vous pourrez la changer à tout moment depuis le haut de la fenêtre.',

  'landing.mode': 'Mode Question : les réponses sont citées, vérifiez-les',
  'landing.activeBook': 'Livre actif',
  'landing.byAuthors': 'de {authors}',
  'landing.noBook':
    'Aucun livre n’est sélectionné pour l’instant. Importez un EPUB pour commencer.',
  'landing.comingSoon':
    'Poser des questions arrivera dans une prochaine étape. Votre installation et vos livres sont prêts.',
  'landing.import': 'Importer un livre',

  'ollama.get.title': 'Mettons Ollama en marche',
  'ollama.get.intro':
    'BookaLLM répond à vos questions grâce à un modèle d’IA qui tourne sur votre propre ordinateur. Vos livres et toutes les données de BookaLLM restent sur cet ordinateur et ne sont jamais envoyés ailleurs. Un programme gratuit appelé Ollama fait tourner ce modèle, et BookaLLM ne l’a pas trouvé.',
  'ollama.get.mayBeInstalled':
    'Il est peut-être déjà installé mais pas lancé. Dans ce cas, lancez-le simplement : cette page s’en apercevra.',
  'ollama.step.download': 'Téléchargez Ollama depuis son site officiel.',
  'ollama.step.install':
    'Ouvrez le fichier téléchargé et suivez l’installation.',
  'ollama.step.start':
    'Vérifiez qu’Ollama est lancé. S’il est déjà installé, ouvrez-le comme n’importe quelle autre application.',
  'ollama.step.recheck':
    'Revenez ici. Cette page vérifie d’elle-même toutes les quelques secondes, ou vous pouvez appuyer sur « Vérifier à nouveau ».',
  'ollama.downloadButton': 'Aller à la page de téléchargement d’Ollama',
  'ollama.downloadAddress': 'Page de téléchargement : {url}',
  'ollama.openFailed':
    'Impossible d’ouvrir votre navigateur. Copiez plutôt l’adresse ci-dessous dans votre navigateur.',
  'ollama.advanced': 'Paramètres avancés',
  'ollama.address.label': 'Adresse d’Ollama',
  'ollama.address.help':
    'Ne la changez que si Ollama tourne ailleurs que sur cet ordinateur.',
  'ollama.address.invalid':
    'Ceci ne ressemble pas à une adresse web. Elle doit commencer par http:// ou https://.',
  'ollama.address.use': 'Utiliser cette adresse',
  'ollama.update.title': 'Ollama doit être mis à jour',
  'ollama.update.body':
    'Vous avez Ollama {version}, mais BookaLLM a besoin de la version {minimum} ou plus récente.',
  'ollama.update.step':
    'Téléchargez la dernière version depuis le site officiel et installez-la par-dessus l’ancienne. Puis revenez ici.',

  'models.title': 'Télécharger les modèles d’IA',
  'models.intro':
    'BookaLLM a besoin de deux modèles d’IA sur votre ordinateur : l’un pour lire et répondre, l’autre pour trouver les bons passages dans vos livres. C’est une étape à faire une seule fois, qui peut prendre quelques minutes. Rien n’est téléchargé tant que vous n’appuyez pas sur le bouton.',
  'models.toDownload': 'À télécharger',
  'models.role.chat': 'Modèle de réponse',
  'models.role.embedding': 'Modèle de recherche',
  'models.item.size': '{name} : environ {size}',
  'models.item.unknownSize': '{name} : taille inconnue',
  'models.total': 'Total : environ {size}',
  'models.totalPartial': 'Total des tailles connues : environ {size}',
  'models.different': 'Utiliser d’autres modèles (avancé)',
  'models.editHint':
    'Saisissez le nom de n’importe quel modèle proposé par Ollama. La liste ci-dessus se met à jour quand vous quittez le champ.',
  'models.download': 'Télécharger',
  'models.downloading': 'Téléchargement de {name}…',
  'models.phase.preparing': 'Préparation…',
  'models.phase.downloading': 'Téléchargement…',
  'models.phase.verifying':
    'Téléchargement terminé. BookaLLM vérifie maintenant que tout est bien arrivé. Cela peut prendre une minute : gardez cette fenêtre ouverte.',
  'models.phase.finishing': 'Presque terminé. Finalisation…',
  'models.phase.done': 'Tout est prêt. On continue…',
  'models.amount': '{done} sur {total}',
  'models.progressLabel': 'Progression du téléchargement',
  'models.cancelled':
    'Le téléchargement a été annulé. Rien n’est perdu : appuyez sur Continuer pour reprendre là où il s’est arrêté.',
  'models.error.unreachable':
    'Ollama semble s’être arrêté pendant le téléchargement. Vérifiez qu’il est lancé, puis réessayez.',
  'models.error.notFound':
    'Ollama n’a pas de modèle appelé « {name} ». Vérifiez le nom et réessayez.',
  'models.error.diskSpace':
    'Il n’y a pas assez de place libre sur votre disque. Libérez de l’espace, puis réessayez.',
  'models.error.other': 'Le téléchargement ne s’est pas terminé.',

  'import.title': 'Ajouter un livre',
  'import.body':
    'Choisissez un livre EPUB sur votre ordinateur, ou déposez-le ici. BookaLLM ne fait que lire le fichier : il ne le modifie, ne le déplace et ne le supprime jamais.',
  'import.drop': 'Déposez un EPUB ici, ou choisissez un fichier',
  'import.working': 'BookaLLM fait connaissance avec ce livre…',
  'import.workingFile': 'Lecture de {filename}',
  'import.done.title': 'Livre ajouté',
  'import.done.body':
    'BookaLLM a lu le livre et l’a enregistré sur cet ordinateur. C’est maintenant votre livre actif.',
  'import.done.existingTitle': 'Vous avez déjà ce livre',
  'import.done.existingBody':
    'Il est déjà dans BookaLLM, donc rien de nouveau n’a été ajouté. C’est maintenant votre livre actif.',
  'import.skipped': ({ count }) =>
    count === 1
      ? 'BookaLLM n’ajoute qu’un livre à la fois : seul le premier fichier a été ajouté. L’autre fichier n’a pas été pris en compte.'
      : `BookaLLM n’ajoute qu’un livre à la fois : seul le premier fichier a été ajouté. Les ${count} autres fichiers n’ont pas été pris en compte.`,
  'indexing.title': 'BookaLLM fait connaissance avec votre livre',
  'indexing.forBook':
    'Préparation de « {title} » pour que vous puissiez poser des questions dessus.',
  'indexing.intro':
    'C’est une étape à faire une seule fois. Elle peut durer de quelques minutes à quelques heures, selon votre ordinateur et la longueur du livre. Vous pouvez fermer BookaLLM à tout moment : il reprendra là où il s’était arrêté.',
  'indexing.estimating': 'Estimation de la durée…',
  'indexing.remaining': 'Il reste environ {time}.',
  'indexing.remainingSoon': 'Il reste moins d’une minute.',
  'indexing.starting': 'Préparation…',
  'indexing.chapter': 'Chapitre {current} sur {total}',
  'indexing.progressLabel': 'Progression de la préparation',
  'indexing.resumed': 'On reprend là où l’on s’était arrêté.',
  'indexing.rebuild':
    'Le modèle de recherche a changé : BookaLLM refait connaissance avec ce livre.',
  'indexing.error.unreachable':
    'Ollama semble s’être arrêté. Vérifiez qu’il est lancé, puis réessayez. Ce qui a déjà été fait est conservé.',
  'indexing.error.notFound':
    'Ollama n’a pas de modèle appelé « {name} ». Vérifiez le nom du modèle de recherche, puis réessayez.',
  'indexing.error.diskSpace':
    'Il n’y a pas assez de place pour enregistrer ce livre. Libérez de l’espace, puis réessayez. Ce qui a déjà été fait est conservé.',
  'indexing.error.other': 'Le livre n’a pas pu être préparé.',
  'import.tryAnother': 'Essayer un autre fichier',
  'import.error.title': 'Ce livre n’a pas pu être ajouté',
  'import.error.notEpub':
    'Ce fichier n’est pas un livre EPUB. Choisissez un fichier dont le nom se termine par .epub.',
  'import.error.malformed':
    'Cet EPUB n’a pas pu être lu. Le fichier est peut-être endommagé : essayez une autre copie du livre.',
  'import.error.noText':
    'Cet EPUB ne contient aucun texte lisible, seulement des images. BookaLLM a besoin du texte pour travailler.',
  'import.error.drm':
    'Ce livre est protégé contre la copie (DRM). BookaLLM ne retire jamais cette protection, il ne peut donc pas ouvrir ce fichier. Il vous faut une copie du livre sans protection ; les livres du domaine public en sont généralement dépourvus.',
  'import.duplicate.title': 'Ce livre, vous l’avez déjà ?',
  'import.duplicate.body':
    'Ce fichier porte le même titre ou le même nom qu’un livre déjà ajouté, mais ce n’est pas le même fichier : il s’agit peut-être d’une autre édition. Si vous l’ajoutez, les deux livres sont conservés et rien n’est remplacé.',
  'import.duplicate.new': 'Le fichier que vous avez choisi',
  'import.duplicate.existing': 'Déjà dans BookaLLM',
  'import.duplicate.add': 'Ajouter comme livre séparé',
  'import.saveFailed.title': 'Le livre n’a pas pu être enregistré',
  'import.saveFailed.full':
    'Il n’y a pas assez de place pour enregistrer ce livre. Libérez de l’espace, puis réessayez.',
  'import.saveFailed.other':
    'Ce livre n’a pas pu être enregistré sur cet appareil. Rien n’a été ajouté.',

  'common.chapters': ({ count }) =>
    count === 1 ? '1 chapitre' : `${count} chapitres`,
};
