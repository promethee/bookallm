/**
 * How many times a changed claim is regenerated after a first attempt that verification
 * did not confirm, before giving up with a typed `unverified` failure. Provisional: no
 * real run of this pipeline has measured how often verification actually fails on the
 * first try. See design.md's real-world check for what this should become once it has.
 */
export const MUTATION_VERIFY_RETRIES = 2;

/**
 * Chapter titles of front and back matter Verify mode does not build claims from, in
 * English and French. Matched as whole words against the title lowercased with accents
 * and curly apostrophes normalised (see `select.ts`). Deliberately leaves out "prologue",
 * "epilogue" and "appendix", which are often part of the story, and matches "notes" only
 * as a whole title or with the person who wrote them, so "Notes from Underground" stays.
 */
export const FRONT_BACK_MATTER_TITLES: readonly RegExp[] = [
  /\b(introduction|preface|foreword|avant-propos|avant propos)\b/,
  /\b(contents|table des matieres|sommaire)\b/,
  /^\W*notes?\W*$/,
  /\b(transcriber|translator|editor|author|publisher)'?s? notes?\b/,
  /\bnotes? (du|de la|de l'|des) ?(traducteur|traductrice|editeur|editrice|auteur|autrice|transcripteur)/,
  /\b(footnotes|notes de bas de page|errata|typographical errors)\b/,
  /\b(acknowledge?ments|remerciements|dedication|dedicace)\b/,
  /\b(copyright|licen[cs]e|colophon)\b/,
  /\b(about the author|a propos de l'auteur)\b/,
  /\b(bibliography|bibliographie|index|glossary|glossaire)\b/,
];

/** Text that marks a chunk as Project Gutenberg's header, footer or licence. */
export const FRONT_BACK_MATTER_TEXT = /project gutenberg/i;

/**
 * Chunks shorter than this many characters are not used for claims: title pages and
 * series pages ("THE MODERN LIBRARY", "CANDIDE BY VOLTAIRE" in the baseline run) hold a
 * line or two, too little for a fair claim, and no title pattern can name them.
 */
export const MIN_CLAIM_CHUNK_LENGTH = 200;

const ATTRIBUTE_KINDS =
  'a cause, the order in which two things happened, who did or said something, or where something happened';

/** Asks the chat model for one concrete, checkable claim the passage actually supports. */
export function extractionPrompt(passageText: string): string {
  return [
    'You read one passage from a book and state one concrete, checkable claim from it.',
    `The claim must be about ${ATTRIBUTE_KINDS}. State it as one plain, factual`,
    'sentence, using only what the passage actually says. Do not add anything the',
    'passage does not support, and do not mention the passage itself.',
    '',
    'Passage:',
    passageText,
  ].join('\n');
}

/**
 * Asks for a changed version of `trueClaim` that alters exactly one of the same four
 * attribute kinds, keeping everything else accurate.
 */
export function mutationPrompt(passageText: string, trueClaim: string): string {
  return [
    'You are given a true claim about a passage from a book, and the passage itself.',
    `Write a changed version of the claim that alters exactly one of: ${ATTRIBUTE_KINDS}.`,
    'Change only that one thing; keep every other detail of the claim exactly as',
    'accurate as it was. The changed version must end up false about the passage.',
    '',
    'Answer with exactly two lines, nothing else:',
    'ATTRIBUTE: one word naming what you changed - cause, order, who, or where.',
    'CLAIM: the changed claim, as one plain sentence, with no explanation.',
    '',
    'Passage:',
    passageText,
    '',
    'True claim:',
    trueClaim,
  ].join('\n');
}

/** Asks whether `changedClaim` actually contradicts the passage, as a single word. */
export function verificationPrompt(
  passageText: string,
  changedClaim: string,
): string {
  return [
    'You are given a passage from a book and a claim about it.',
    'Decide whether the claim contradicts what the passage actually says.',
    'Answer with exactly one word: CONTRADICTS if the claim is false about the',
    'passage, or MATCHES if the claim is still true about the passage.',
    '',
    'Passage:',
    passageText,
    '',
    'Claim:',
    changedClaim,
  ].join('\n');
}

/** The fixed user-turn trigger for each of the three prompts above. */
export const TRIGGER = 'Answer now, with nothing else.';
