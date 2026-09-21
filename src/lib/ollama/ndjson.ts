/**
 * Reads a newline-delimited JSON stream and yields each parsed line.
 *
 * Lines can arrive split across chunks (even in the middle of a multi-byte character),
 * the last line may have no trailing newline, and blank or unparseable lines are
 * skipped. Stopping early (a `break`, `return` or error in the consumer) cancels the
 * underlying stream, which ends the request.
 */
export async function* readNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (line: string): { value: unknown } | undefined => {
    const trimmed = line.trim();
    if (trimmed === '') return undefined;
    try {
      return { value: JSON.parse(trimmed) };
    } catch {
      return undefined;
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const parsed = parse(line);
        if (parsed) yield parsed.value;
      }
    }
    buffer += decoder.decode();
    const last = parse(buffer);
    if (last) yield last.value;
  } finally {
    // Releases the connection if the consumer stopped early; harmless once the stream is done.
    await reader.cancel().catch(() => undefined);
  }
}
