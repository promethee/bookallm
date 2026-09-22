import type { Language } from '../i18n/language';
import { translate } from '../i18n/translate';
import type { OllamaClient } from '../ollama';
import type { Passage, Verdict } from '../retrieval';
import type { ChatMessage } from './chat';
import { streamChat } from './chat';
import { parseCitations } from './citations';
import { systemPrompt } from './defaults';
import type { AnswerError, Citation, OfferedPassage } from './types';

export interface GenerateAnswerOptions {
  /** Retrieval's verdict for this question. `nothing-relevant` never calls Ollama. */
  verdict: Verdict;
  question: string;
  /** The passages retrieval ranked, best first; numbered in this order for citing. */
  passages: readonly Passage[];
  /** The configured chat model. */
  model: string;
  client: OllamaClient;
  /** Used only for the fixed "nothing found" reply. */
  language: Language;
  /** Aborting this stops the stream; the generator ends quietly, with no error. */
  signal?: AbortSignal;
}

export type GenerateAnswerResult =
  /**
   * `chunks` yields the answer's text in order; iterating it can throw an `AnswerError`.
   * `citations()` reads `[]` until the stream has been drained (as far as it got).
   */
  | {
      status: 'ok';
      chunks: AsyncGenerator<string, void, undefined>;
      citations: () => Citation[];
    }
  | { status: 'aborted' }
  | { status: 'failed'; error: AnswerError };

async function* single(text: string): AsyncGenerator<string, void, undefined> {
  yield text;
}

/**
 * Streams `source`, building the complete text as it goes, and resolves citations against
 * `offered` once the stream ends (however far it got: aborted or an error still keeps
 * whatever citations the text so far contains).
 */
function citedStream(
  source: AsyncGenerator<string, void, undefined>,
  offered: readonly OfferedPassage[],
): {
  chunks: AsyncGenerator<string, void, undefined>;
  citations: () => Citation[];
} {
  let resolved: Citation[] = [];
  async function* run(): AsyncGenerator<string, void, undefined> {
    let full = '';
    try {
      for await (const chunk of source) {
        full += chunk;
        yield chunk;
      }
    } finally {
      resolved = parseCitations(full, offered);
    }
  }
  return { chunks: run(), citations: () => resolved };
}

/**
 * Generates a streamed, cited answer to a question from the passages retrieval found for
 * it, and never throws for an expected outcome.
 *
 * - `nothing-relevant` calls nothing: it returns the fixed "nothing found" reply, in the
 *   caller's language, as the one chunk of a stream, with no citations.
 * - Otherwise the passages are numbered in the order given and offered to the chat model,
 *   which is asked to answer only from them and to mark every claim with the number(s) of
 *   the passage(s) it rests on. Citations are resolved from those markers once the stream
 *   ends; a number the model writes that does not match an offered passage is dropped.
 * - Failures and abort behave exactly as `streamChat`'s: a failure before any text arrives
 *   is a typed result, a failure during the stream makes the generator throw, and an
 *   abort (before or during) ends the generator quietly, with no error.
 * - Nothing is written anywhere, and the only network request is the question and
 *   passages to the configured Ollama address.
 */
export async function generateAnswer(
  options: GenerateAnswerOptions,
): Promise<GenerateAnswerResult> {
  const { verdict, question, passages, model, client, language, signal } =
    options;
  if (signal?.aborted) return { status: 'aborted' };

  if (verdict === 'nothing-relevant') {
    return {
      status: 'ok',
      chunks: single(translate(language, 'answering.nothingFound')),
      citations: () => [],
    };
  }

  const offered: OfferedPassage[] = passages.map((passage, position) => ({
    index: position + 1,
    text: passage.text,
    locator: passage.locator,
    chunkId: passage.chunkId,
  }));
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(offered) },
    { role: 'user', content: question },
  ];

  const result = await streamChat(client, model, messages, { signal });
  if (result.status !== 'ok') return result;

  return { status: 'ok', ...citedStream(result.chunks, offered) };
}
