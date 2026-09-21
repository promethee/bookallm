// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readNdjson } from './ndjson';
import { readChunks, streamResponse } from './testing/fake-fetch';
import { sendChunks, startTestServer } from './testing/test-server';

async function collect(body: ReadableStream<Uint8Array>): Promise<unknown[]> {
  const values: unknown[] = [];
  for await (const value of readNdjson(body)) values.push(value);
  return values;
}

const bodyOf = (...chunks: string[]) => streamResponse(chunks).body!;

describe('readNdjson', () => {
  it('reads one object per line', async () => {
    expect(await collect(bodyOf('{"a":1}\n{"b":2}\n'))).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('reassembles a line split across chunks', async () => {
    const chunks = [
      '{"status":"pulling',
      ' manifest"}\n{"sta',
      'tus":"success"}\n',
    ];

    expect(await collect(bodyOf(...chunks))).toEqual([
      { status: 'pulling manifest' },
      { status: 'success' },
    ]);
  });

  it('reads a last line that has no trailing newline', async () => {
    expect(await collect(bodyOf('{"a":1}\n{"b":2}'))).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('skips blank lines and lines that are not JSON', async () => {
    expect(await collect(bodyOf('\n{"a":1}\n\nnot json\n{"b":2}\n'))).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('accepts Windows line endings', async () => {
    expect(await collect(bodyOf('{"a":1}\r\n{"b":2}\r\n'))).toEqual([
      { a: 1 },
      { b: 2 },
    ]);
  });

  it('reads nothing from an empty stream', async () => {
    expect(await collect(bodyOf())).toEqual([]);
  });

  it('decodes a multi-byte character split across two chunks', async () => {
    const bytes = new TextEncoder().encode('{"m":"café"}\n');
    const split = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, split));
        controller.enqueue(bytes.slice(split));
        controller.close();
      },
    });

    expect(await collect(body)).toEqual([{ m: 'café' }]);
  });

  it('cancels the underlying stream when the consumer stops early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":1}\n{"b":2}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const value of readNdjson(body)) {
      expect(value).toEqual({ a: 1 });
      break;
    }

    expect(cancelled).toBe(true);
  });

  it('propagates a stream error to the consumer', async () => {
    const response = streamResponse(['{"a":1}\n'], {
      failWith: new TypeError('terminated'),
    });

    await expect(collect(response.body!)).rejects.toThrow('terminated');
  });
});

describe('readNdjson against a real HTTP server', () => {
  it('reads lines that the server split across chunks', async () => {
    const server = await startTestServer((_request, response) =>
      sendChunks(response, [
        '{"status":"pulling',
        ' manifest"}\n{"status":"pulling abc","total":10,',
        '"completed":5}\n{"status":"succ',
        'ess"}',
      ]),
    );
    try {
      const response = await fetch(`${server.url}/api/pull`);

      expect(await collect(response.body!)).toEqual([
        { status: 'pulling manifest' },
        { status: 'pulling abc', total: 10, completed: 5 },
        { status: 'success' },
      ]);
    } finally {
      await server.close();
    }
  });

  it('really splits the text into several chunks on the wire (the test is meaningful)', async () => {
    const server = await startTestServer((_request, response) =>
      sendChunks(response, ['{"a":', '1}\n'], { delayMs: 30 }),
    );
    try {
      const response = await fetch(`${server.url}/`);

      expect((await readChunks(response)).length).toBeGreaterThan(1);
    } finally {
      await server.close();
    }
  });
});
