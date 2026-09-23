/**
 * How long a chat stream may go without a new piece of text before it counts as not
 * answering. This has to cover Ollama loading the chat model into memory before the
 * first token, which was measured, twice, on the real, busy machine this was tuned on:
 * a cold `llama3.1:8b` (about 4.9 GB) took 252 and 327 seconds on two separate runs.
 * Once loaded, later answers started immediately (a few seconds). Every piece of text
 * received resets this timer, so a slow but genuinely working answer is never cut off
 * once it has started; this value only bounds the wait for the very first token.
 */
export const CHAT_STREAM_TIMEOUT_MS = 600_000;

/**
 * How many extra attempts `streamChat` makes when the connection drops before any answer
 * text has arrived, before giving up. Real measurement (`ask-mode-screen`'s real-world
 * check): on the same busy machine, a real `/api/chat` request sometimes fails with a
 * plain connection reset partway through the long wait for the first token, well under
 * `CHAT_STREAM_TIMEOUT_MS`'s own budget. Nothing has streamed yet at that point, so a
 * retry from scratch costs nothing already shown to the reader. Only this pre-first-token
 * case is retried: a failure once text has started arriving still ends the stream, since
 * that text cannot be un-shown, and a real, informative failure (a model that is not
 * installed, an explicit error line from Ollama) is never retried, since trying again
 * cannot change that answer.
 */
export const CHAT_PRE_STREAM_RETRIES = 1;

/** Pause between a dropped pre-stream connection and the next retry. */
export const CHAT_RETRY_BACKOFF_MS = 250;

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
