import type { ChangedAttribute, RejectReason } from './types';

/**
 * How many times a changed claim is regenerated after a first attempt that was rejected
 * or not confirmed, before trying a fresh passage. Measured (design.md, Real-world check,
 * "After, two kinds"): of 37 confirmed changes, 29 were confirmed on the first attempt,
 * 7 on the second and 1 on the third, so a third round adds under 10 % while costing
 * two more model calls per failing passage (minutes on a CPU-only machine).
 */
export const MUTATION_VERIFY_RETRIES = 1;

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

/**
 * How many times the whole attempt is repeated on a different chunk, after the first
 * chunk yields no claim or no confirmed change, before reporting `unverified`.
 */
export const MUTATION_FRESH_PASSAGE_ATTEMPTS = 1;

/**
 * A changed claim may differ from the true one in at most this many separate runs of
 * words. Two, not one: swapping the order of two events can touch two places. Provisional,
 * checked against the real-world trace.
 */
export const MUTATION_MAX_CHANGED_RUNS = 2;

/**
 * A changed claim may change at most this share of the true claim's words (with a floor of
 * `MUTATION_MIN_CHANGED_WORDS`, so a short claim can still swap a two-word name).
 * Provisional, checked against the real-world trace.
 */
export const MUTATION_MAX_CHANGED_SHARE = 0.5;
export const MUTATION_MIN_CHANGED_WORDS = 3;

/**
 * The kinds of detail a claim is about, and the one its changed version alters. Only
 * `who` and `where` in v1.1: in the real-world check, a changed cause or order came back
 * as a rewrite of the whole sentence far more often than as one checkable change (see
 * design.md), so those two kinds wait for a later version that builds claims from
 * extracted parts instead of free rewriting. Their prompt wording and interface text
 * stay, ready for it.
 */
export const CLAIM_KINDS: readonly ChangedAttribute[] = ['who', 'where'];

/**
 * A true claim shorter than this many words is too vague to judge ("He said.") and is
 * treated like a passage with no claim of that kind.
 */
export const MIN_CLAIM_WORDS = 5;

/** What a claim of each kind states, for the extraction prompt. */
const KIND_CLAIM: Record<ChangedAttribute, string> = {
  cause: 'why something happened: an event and its cause',
  order:
    'the order of two events: name both events and say which happened first',
  who: 'who did or said something',
  where: 'where something happened',
};

/** What changing each kind means, for the mutation prompt. */
const KIND_CHANGE: Record<ChangedAttribute, string> = {
  cause: 'the cause: say it happened for a different reason',
  order: 'the order of the two events: say they happened the other way round',
  who: 'who did or said it: replace that person with a different person',
  where: 'where it happened: replace that place with a different place',
};

/** Why an earlier changed version was rejected, as told to the model on a retry. */
const REJECT_REASON: Record<RejectReason, string> = {
  'still-true': 'it is still true according to the passage',
  'nothing-changed': 'it says the same as the true claim',
  'changed-too-much': 'it changes more than that one detail',
  unreadable: 'it was not a single plain claim',
};

/** A changed version already rejected for this chunk, with the reason. */
export interface RejectedChange {
  claim: string;
  reason: RejectReason;
}

/** The word the extraction prompt asks for when the passage has no claim of the kind. */
export const NO_CLAIM_WORD = 'NONE';

/** The word the verification prompt asks for when the claim is false about the passage. */
export const CONTRADICTION_WORD = 'FALSE';

/**
 * Asks the chat model for one concrete, checkable claim of `kind` that the passage
 * actually supports, or `NO_CLAIM_WORD` when it has none.
 */
export function extractionPrompt(
  passageText: string,
  kind: ChangedAttribute,
): string {
  return [
    'You read one passage from a book and state one concrete, checkable claim from it.',
    `The claim must be about ${KIND_CLAIM[kind]}. State it as one plain, factual`,
    'sentence, using only what the passage actually says. Do not add anything the',
    'passage does not support, and do not mention the passage itself.',
    `If the passage says nothing of that kind, answer with exactly one word: ${NO_CLAIM_WORD}.`,
    '',
    'Passage:',
    passageText,
  ].join('\n');
}

/**
 * Asks for a false version of `trueClaim` that changes only its `kind` detail, choosing a
 * change that matters to the story, and lists the versions already rejected for this
 * chunk so a retry does not repeat them.
 */
export function mutationPrompt(
  passageText: string,
  trueClaim: string,
  kind: ChangedAttribute,
  rejected: readonly RejectedChange[] = [],
): string {
  const lines = [
    'You are given a true claim about a passage from a book, and the passage itself.',
    `Write a false version of the claim by changing only ${KIND_CHANGE[kind]}.`,
    'Choose a change that matters to what happens in the story, not a word choice,',
    'a synonym or a minor detail. Keep every other word of the claim exactly as it is.',
    'The changed version must contradict the passage, not just add something the',
    'passage does not mention.',
    'Answer with the changed claim only, as one plain sentence, with no label and no',
    'explanation.',
  ];
  if (rejected.length > 0) {
    lines.push('', 'These versions were rejected; do not repeat them:');
    for (const { claim, reason } of rejected)
      lines.push(`- "${claim}" (${REJECT_REASON[reason]})`);
  }
  lines.push('', 'Passage:', passageText, '', 'True claim:', trueClaim);
  return lines.join('\n');
}

/**
 * Asks whether `changedClaim` is true or false according to the passage, as a single
 * word. Worded as true/false rather than "contradicts/matches": in the baseline run
 * `llama3.1:8b` answered MATCHES to plain swaps of a person or a place.
 */
export function verificationPrompt(
  passageText: string,
  changedClaim: string,
): string {
  return [
    'You are given a passage from a book and a claim about it.',
    'Decide whether the claim is true or false according to the passage.',
    `Answer ${CONTRADICTION_WORD} if the passage says something different from the claim:`,
    'a different person, place, cause or order of events.',
    'Answer TRUE only if the passage supports the claim.',
    `Answer with exactly one word: TRUE or ${CONTRADICTION_WORD}.`,
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
