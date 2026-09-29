/**
 * Takes the README's screenshots from the real app: a cited answer, a chapter handed
 * over, and a Verify reveal. Unlike the e2e tests it talks to the real Ollama (at its
 * default address, with the default models installed) and reads a real EPUB, so it takes
 * minutes and is not part of any test suite.
 *
 *   pnpm screenshots path/to/book.epub
 *
 * Starts its own dev server, uses a fresh browser profile (nothing of yours is touched),
 * and writes PNGs to docs/images/. Run it again after a UI change.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';

const BASE = 'http://127.0.0.1:5287';
const OUT = resolve('docs/images');
const MINUTE = 60_000;

const QUESTION = 'Why is Candide driven out of the castle?';
const OFF_TOPIC = 'Who won the 1998 football World Cup?';

async function waitForServer(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`The dev server did not start at ${BASE}`);
}

function startServer(): ChildProcess {
  return spawn(process.execPath, ['node_modules/vite/bin/vite.js'], {
    stdio: 'ignore',
  });
}

const heading = (page: Page, name: string) =>
  page.getByRole('heading', { level: 1, name });

/** The last conversation turn on the landing screen. */
const lastTurn = (page: Page): Locator =>
  page.locator('main .space-y-4 > div').last();

async function ask(page: Page, question: string): Promise<void> {
  await page.getByLabel('Your question').fill(question);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page
    .locator('main [aria-busy="true"]')
    .waitFor({ state: 'detached', timeout: 10 * MINUTE });
}

async function main(): Promise<void> {
  const epub = process.argv[2];
  if (!epub) throw new Error('Usage: pnpm screenshots path/to/book.epub');
  mkdirSync(OUT, { recursive: true });

  const server = startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    locale: 'en-US',
  });
  try {
    await waitForServer();

    // First run: language, setup checks, import, indexing.
    await page.goto(BASE);
    await page.getByRole('button', { name: 'Continue' }).click();
    await heading(page, 'Add a book').waitFor({ timeout: 5 * MINUTE });
    await page.locator('input[type="file"]').setInputFiles(epub);
    console.log('Indexing the book…');
    await heading(page, 'Book added').waitFor({ timeout: 20 * MINUTE });
    await page.getByRole('button', { name: 'Continue' }).click();
    await heading(page, 'BookaLLM').waitFor();

    // 1. A cited answer.
    console.log('Asking a question…');
    await ask(page, QUESTION);
    await page.screenshot({ path: `${OUT}/ask.png`, fullPage: true });

    // 2. Nothing found, then the introduction handed over after a chapter retry.
    console.log('Recovering a question that finds nothing…');
    await ask(page, OFF_TOPIC);
    const chapter = page.getByLabel('Chapter', { exact: true }).last();
    const options = await chapter.locator('option').allTextContents();
    // Prefer a chapter titled exactly "Introduction": it has real text to hand over.
    const intro =
      options.find((title) => /^\s*introduction\s*$/i.test(title)) ??
      options.find((title) => /introduction/i.test(title));
    await chapter.selectOption({ label: intro ?? options[0] });
    await page.getByRole('button', { name: 'Look in this chapter' }).click();
    await page
      .locator('main [aria-busy="true"]')
      .waitFor({ state: 'detached', timeout: 10 * MINUTE });
    // Both turns: the nothing-found reply, then the retry with the chapter handed over.
    const turns = page.locator('main .space-y-4 > div');
    const count = await turns.count();
    // Measured with the page at the top, element boxes are in page coordinates, which
    // is what a full-page clip expects.
    await page.evaluate(() => window.scrollTo(0, 0));
    const first = await turns.nth(count - 2).boundingBox();
    const last = await lastTurn(page).boundingBox();
    if (!first || !last)
      throw new Error('The recovery turns are not on screen');
    await page.screenshot({
      path: `${OUT}/recovery.png`,
      fullPage: true,
      clip: {
        x: first.x - 16,
        y: first.y - 16,
        width: first.width + 32,
        height: last.y + last.height - first.y + 32,
      },
    });

    // 3. A Verify claim, judged and revealed. A claim can fail as unverified: try again.
    console.log('Making a Verify claim…');
    await page.getByRole('tab', { name: 'Verify' }).click();
    await page.getByRole('button', { name: 'Give me a claim' }).click();
    const trueButton = page.getByRole('button', { name: 'True', exact: true });
    for (let attempt = 0; attempt < 10; attempt++) {
      const retry = page.getByRole('button', { name: 'Try again' });
      await trueButton
        .or(retry)
        .first()
        .waitFor({ timeout: 10 * MINUTE });
      if (await trueButton.isVisible()) break;
      await retry.click();
    }
    await trueButton.click();
    await page.getByRole('button', { name: 'Next claim' }).waitFor();
    await page.screenshot({ path: `${OUT}/verify.png`, fullPage: true });

    console.log(`Saved to ${OUT}`);
  } catch (error) {
    // What the app showed when it went wrong (an Ollama failure, a stuck step…).
    const failure = join(tmpdir(), 'bookallm-screenshots-failure.png');
    await page.screenshot({ path: failure, fullPage: true }).catch(() => {});
    console.error(`Stopped; the screen at that moment is in ${failure}`);
    throw error;
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
