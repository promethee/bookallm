/**
 * How many times a changed claim is regenerated after a first attempt that verification
 * did not confirm, before giving up with a typed `unverified` failure. Provisional: no
 * real run of this pipeline has measured how often verification actually fails on the
 * first try. See design.md's real-world check for what this should become once it has.
 */
export const MUTATION_VERIFY_RETRIES = 2;

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
    'State it as one plain sentence, with no explanation and no mention of what changed.',
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
