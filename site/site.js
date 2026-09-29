// The site's texts in both languages, the language toggle, and the download button.
import { detectSystem, pickAssets } from './download.js';

const RELEASE_API =
  'https://api.github.com/repos/promethee/bookallm/releases/latest';

/** Every text on the page. The site summarises the README and never says more. */
const TEXTS = {
  en: {
    title: 'BookaLLM: AI makes mistakes. Use them to learn.',
    pitch: 'AI makes mistakes. Use them to learn.',
    sub: 'Ask your book questions, and check every answer against the page it came from.',
    free: 'BookaLLM is free: no price, no account, no subscription, and open source. It is made mainly for people studying a book, who want to test their understanding against the text, not to skip the reading.',
    downloadLatest: 'Download the latest version',
    downloadFor: (label, version) =>
      `Download for ${label}${version ? ` (${version})` : ''}`,
    windows: 'Windows',
    macArm: 'Mac with an Apple chip (M1 or later)',
    macIntel: 'Mac with an Intel chip',
    linuxAppImage: 'Linux (AppImage)',
    linuxDeb: 'Linux (.deb)',
    otherSystems: 'Other systems',
    allReleases: 'All installers on GitHub',
    unsigned:
      'The installers are not signed yet. Windows may say "Windows protected your PC": choose "More info", then "Run anyway". On a Mac, the first time, right-click BookaLLM, choose Open, then Open again. BookaLLM is tested on Windows; macOS and Linux are not tested yet.',
    noInstaller:
      'BookaLLM runs on Windows, macOS and Linux computers. Choose your system below.',
    askAlt:
      'A question about Candide answered with citations to the exact passages',
    askTitle: 'Ask mode: check your understanding',
    why: 'Why:',
    how: 'How:',
    askWhy: 'to get answers you can verify, not answers you have to trust.',
    askHow:
      'ask a question about your book. Each claim in the answer points to the exact passage and its chapter: read it and judge for yourself. If nothing is found, point to a chapter and BookaLLM looks there; if it still cannot answer, it shows you the chapter to read.',
    recoveryAlt:
      'A question with nothing found, looked for again in one chapter, which is then shown to read',
    verifyTitle: 'Verify mode: train your eye',
    verifyWhy:
      'AI can misstate a book with confidence. Verify mode shows you claims that may be false on purpose, so that checking becomes a habit.',
    verifyHow:
      'ask for a claim, read it, and answer True or False. BookaLLM then shows whether you were right, what the book really says and which words were changed, and keeps score for the session.',
    verifyAlt:
      'A claim revealed as false, with what the book says and the words that were changed',
    privateTitle: 'Everything stays on your computer',
    privateText:
      'The book, your questions and the answers never leave it: the AI runs on your computer, through Ollama, which BookaLLM helps you install. It never changes, moves or deletes your EPUB file. A graphics card is strongly recommended: answers take a few seconds with one, several minutes without.',
    booksTitle: 'Where to find free EPUBs',
    booksText:
      'BookaLLM reads DRM-free EPUB files. These sites offer public-domain books as free EPUBs:',
    disclaimerTitle: 'AI disclaimer',
    disclaimer1:
      'The answers come from an AI and can be wrong: read the cited passages before you rely on an answer.',
    disclaimer2:
      'Verify mode shows false claims on purpose; only the book decides.',
    disclaimer3:
      'BookaLLM helps you check your understanding of a book; it does not replace reading it.',
    disclaimer4:
      'Designed by a human, built with AI: the idea, design and decisions are the author’s; the code was written with Claude (Anthropic) and reviewed, tested and approved by the author.',
    license: 'Free and open source under the MIT license.',
    source: 'Source code on GitHub',
  },
  fr: {
    title: 'BookaLLM : l’IA fait des erreurs. Servez-vous-en pour apprendre.',
    pitch: 'L’IA fait des erreurs. Servez-vous-en pour apprendre.',
    sub: 'Posez vos questions sur votre livre, et vérifiez chaque réponse sur la page d’où elle vient.',
    free: 'BookaLLM est gratuit : sans prix, sans compte, sans abonnement, et libre. Il est fait avant tout pour les personnes qui étudient un livre et veulent confronter leur compréhension au texte, pas pour éviter de le lire.',
    downloadLatest: 'Télécharger la dernière version',
    downloadFor: (label, version) =>
      `Télécharger pour ${label}${version ? ` (${version})` : ''}`,
    windows: 'Windows',
    macArm: 'Mac Apple Silicon (M1 ou plus récent)',
    macIntel: 'Mac cpu Intel',
    linuxAppImage: 'Linux (AppImage)',
    linuxDeb: 'Linux (.deb)',
    otherSystems: 'Autres systèmes',
    allReleases: 'Tous les installateurs sur GitHub',
    unsigned:
      'Les installateurs ne sont pas encore signés. Windows peut afficher « Windows a protégé votre ordinateur » : choisir « Informations complémentaires », puis « Exécuter quand même ». Sur Mac, la première fois : clic droit sur BookaLLM, Ouvrir, puis Ouvrir à nouveau. BookaLLM est testé sous Windows ; macOS et Linux ne le sont pas encore.',
    noInstaller:
      'BookaLLM fonctionne sur les ordinateurs Windows, macOS et Linux. Choisissez votre système ci-dessous.',
    askAlt:
      'Une question sur Candide, avec une réponse qui cite les passages exacts',
    askTitle: 'Mode Question : vérifier votre compréhension',
    why: 'Pourquoi :',
    how: 'Comment :',
    askWhy:
      'pour obtenir des réponses que vous pouvez vérifier, et non des réponses à croire sur parole.',
    askHow:
      'posez une question sur votre livre. Chaque affirmation de la réponse renvoie au passage exact et à son chapitre : lisez-le et jugez par vous-même. Si rien n’est trouvé, indiquez un chapitre et BookaLLM y cherche ; s’il ne trouve toujours pas, il vous montre le chapitre à lire.',
    recoveryAlt:
      'Une question sans résultat, cherchée à nouveau dans un chapitre, puis ce chapitre affiché pour le lire',
    verifyTitle: 'Mode Vérification : exercer votre regard',
    verifyWhy:
      'Une IA peut se tromper sur un livre avec assurance. Le mode Vérification vous montre des affirmations peut-être fausses, exprès, pour que la vérification devienne un réflexe.',
    verifyHow:
      'demandez une affirmation, lisez-la, et répondez Vrai ou Faux. BookaLLM montre alors si vous aviez raison, ce que dit vraiment le livre et quels mots ont été changés, et compte les points de la session.',
    verifyAlt:
      'Une affirmation révélée fausse, avec ce que dit le livre et les mots modifiés',
    privateTitle: 'Tout reste sur votre ordinateur',
    privateText:
      'Le livre, vos questions et les réponses n’en sortent jamais : l’IA tourne sur votre ordinateur, grâce à Ollama, que BookaLLM vous aide à installer. Votre fichier EPUB n’est jamais modifié, déplacé ni supprimé. Une carte graphique est vivement recommandée : les réponses prennent quelques secondes avec, plusieurs minutes sans.',
    booksTitle: 'Où trouver des EPUB gratuits',
    booksText:
      'BookaLLM lit les fichiers EPUB sans DRM. Ces sites proposent des livres du domaine public en EPUB gratuits :',
    disclaimerTitle: 'Avertissement sur l’IA',
    disclaimer1:
      'Les réponses viennent d’une IA et peuvent être fausses : lisez les passages cités avant de vous fier à une réponse.',
    disclaimer2:
      'Le mode Vérification montre des affirmations fausses exprès ; seul le livre fait foi.',
    disclaimer3:
      'BookaLLM aide à vérifier votre compréhension d’un livre ; il ne remplace pas sa lecture.',
    disclaimer4:
      'Conçu par un humain, réalisé avec l’IA : l’idée, la conception et les décisions sont celles de l’auteur ; le code a été écrit avec Claude (Anthropic), puis relu, testé et approuvé par l’auteur.',
    license: 'Gratuit et libre, sous licence MIT.',
    source: 'Code source sur GitHub',
  },
};

const STORAGE_KEY = 'bookallm-site-language';

function savedLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveLanguage(language) {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage blocked: the choice simply is not remembered.
  }
}

function initialLanguage() {
  const saved = savedLanguage();
  if (saved === 'en' || saved === 'fr') return saved;
  return (navigator.language || '').toLowerCase().startsWith('fr')
    ? 'fr'
    : 'en';
}

let language = initialLanguage();
let release = null;

function renderTexts() {
  const texts = TEXTS[language];
  document.documentElement.lang = language;
  document.title = texts.title;
  for (const element of document.querySelectorAll('[data-i18n]'))
    element.textContent = texts[element.dataset.i18n];
  for (const element of document.querySelectorAll('[data-i18n-alt]'))
    element.alt = texts[element.dataset.i18nAlt];
  for (const button of document.querySelectorAll('[data-lang]'))
    button.setAttribute(
      'aria-pressed',
      String(button.dataset.lang === language),
    );
}

function link(href, text, className) {
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.textContent = text;
  if (className) anchor.className = className;
  return anchor;
}

/** The button(s) for this visitor's system, and every installer under "Other systems". */
function renderDownloads() {
  if (!release) return;
  const texts = TEXTS[language];
  const system = detectSystem(
    navigator.userAgent,
    navigator.userAgentData?.platform ?? navigator.platform,
  );
  const version = release.tag_name;

  const buttons = document.getElementById('download-buttons');
  const mine = pickAssets(release, system);
  if (mine.length > 0) {
    buttons.replaceChildren(
      ...mine.map((installer, index) =>
        link(
          installer.url,
          texts.downloadFor(texts[installer.label], version),
          index === 0 ? 'button primary' : 'button',
        ),
      ),
    );
  } else {
    // A phone, or a system that cannot be told: send the reader to the full list.
    const note = document.createElement('p');
    note.textContent = texts.noInstaller;
    buttons.replaceChildren(note);
    document.querySelector('details.others').open = true;
  }

  const item = (anchor) => {
    const li = document.createElement('li');
    li.append(anchor);
    return li;
  };
  document
    .getElementById('all-downloads')
    .replaceChildren(
      ...pickAssets(release, 'all').map((installer) =>
        item(
          link(installer.url, `${texts[installer.label]}: ${installer.name}`),
        ),
      ),
      item(link(release.html_url, texts.allReleases)),
    );
}

function setLanguage(next) {
  language = next;
  saveLanguage(next);
  renderTexts();
  renderDownloads();
}

for (const button of document.querySelectorAll('[data-lang]'))
  button.addEventListener('click', () => setLanguage(button.dataset.lang));

renderTexts();

// If GitHub cannot be reached, the button keeps linking to the releases page.
fetch(RELEASE_API)
  .then((response) => (response.ok ? response.json() : null))
  .then((latest) => {
    release = latest;
    renderDownloads();
  })
  .catch(() => {});
