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

/**
 * The context window requested for `/api/chat`, in tokens. Without this, Ollama uses the
 * model's own default, which for `llama3.1:8b` is 131072 (confirmed via a real `/api/ps`
 * during `ask-mode-screen`'s real-world check) — far more than this app's prompts ever
 * need, and llama.cpp allocates its KV cache for the full requested context regardless of
 * how much of it a prompt actually uses, so a needlessly large one costs real memory and
 * load time on a CPU-only, memory-constrained machine (the same constraint already
 * documented in `answer-generation`'s and `passage-retrieval`'s real-world checks).
 *
 * Sized generously for this app's own hard caps: at most `DEFAULT_PASSAGE_COUNT` (5)
 * passages of at most `DEFAULT_MAX_SIZE` (1600) characters each from the retrieval
 * library, plus a question of at most `MAX_QUESTION_LENGTH` (2000) characters, plus the
 * fixed system prompt wording, comes to well under 4000 tokens even by a pessimistic
 * chars-per-token estimate; `CHAT_MAX_ANSWER_TOKENS` bounds the rest. 8192 leaves ample
 * headroom without keeping anywhere near the model's full 128K window resident.
 */
export const CHAT_CONTEXT_LENGTH = 8192;

/**
 * The most tokens a single answer may generate (`num_predict`). Bounds the context budget
 * above together with the prompt, and keeps a slow machine's worst case bounded: the
 * README's own Ask mode style is "concise, dense, often Socratic", not a long essay, so a
 * generous cap here does not clip a normal answer.
 */
export const CHAT_MAX_ANSWER_TOKENS = 500;

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
