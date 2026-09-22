/**
 * How long a chat stream may go without a new piece of text before it counts as not
 * answering. Chat answers are typically much shorter than a batch of chunks to embed, so
 * this is deliberately its own constant rather than reusing the embedding timeout.
 */
export const CHAT_STREAM_TIMEOUT_MS = 120_000;

/** Matches one citation marker: `[2]` or `[1, 3]`, one or more comma-separated numbers. */
export const CITATION_PATTERN = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/**
 * The system prompt asking the model to answer only from the numbered passages and to
 * mark every claim with the number(s) of the passage(s) it rests on.
 */
export function systemPrompt(
  passages: readonly { index: number; text: string }[],
): string {
  const listed = passages
    .map((passage) => `[${passage.index}] ${passage.text}`)
    .join('\n\n');
  return [
    'You answer questions about a book using only the numbered passages below.',
    'Answer only from these passages: never state a fact that is not in them.',
    'Mark every claim with the number of the passage it rests on, in brackets right',
    'after the claim, like this[1]. If a claim rests on more than one passage, cite',
    'all of them, like this[1, 3]. Be concise.',
    '',
    'Passages:',
    listed,
  ].join('\n');
}
