import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import {
  AES_ALGORITHM,
  encryptionXml,
} from '../lib/ingest/testing/epub-builder';
import { CONTROLLER_KEY } from '../lib/onboarding/context';
import type { OnboardingController } from '../lib/onboarding/controller.svelte';
import {
  bookOf,
  epub,
  file,
  harness,
  READY,
} from '../lib/onboarding/testing/harness';
import {
  MemoryLibrary,
  StorageFullError,
  type BookLibrary,
} from '../lib/storage';
import ImportScreen from './ImportScreen.svelte';

const withController = (controller: OnboardingController) => ({
  context: new Map([[CONTROLLER_KEY, controller]]),
});

const DROP = 'Drop an EPUB here, or choose a file';

const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;
const chooseFile = (...files: File[]) =>
  fireEvent.change(fileInput(), { target: { files } });

async function ready(options: Parameters<typeof harness>[1] = {}) {
  const context = await harness(READY, { language: 'en', ...options });
  await context.controller.start();
  return context;
}

describe('ImportScreen: choosing a book', () => {
  it('offers a picker and a drop area, and says the file is only read', async () => {
    const { controller } = await ready();

    render(ImportScreen, withController(controller));

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add a book' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /only reads the file: it never changes, moves or deletes it/,
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: DROP })).toBeTruthy();
    expect(fileInput().accept).toContain('.epub');
    controller.destroy();
  });

  it('opens the file picker when the drop area is activated, so the keyboard works too', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));
    const click = vi
      .spyOn(fileInput(), 'click')
      .mockImplementation(() => undefined);

    await fireEvent.click(screen.getByRole('button', { name: DROP }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: DROP }).tagName).toBe('BUTTON');
    controller.destroy();
  });

  it('imports a book chosen with the picker', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await chooseFile(file(epub('Candide'), 'candide.epub'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Book added' }),
    ).toBeTruthy();
    expect(screen.getByText('Candide')).toBeTruthy();
    controller.destroy();
  });

  it('imports a book dropped on the drop area', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await fireEvent.drop(screen.getByRole('button', { name: DROP }), {
      dataTransfer: { files: [file(epub('Candide'), 'candide.epub')] },
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Book added' }),
    ).toBeTruthy();
    controller.destroy();
  });

  it('imports the first of several dropped files and says the others were skipped', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await fireEvent.drop(screen.getByRole('button', { name: DROP }), {
      dataTransfer: {
        files: [
          file(epub('One', 'First.'), 'one.epub'),
          file(epub('Two', 'Second.'), 'two.epub'),
          file(epub('Three', 'Third.'), 'three.epub'),
        ],
      },
    });

    expect(
      await screen.findByText(
        'BookaLLM adds one book at a time, so only the first file was added. The other 2 files were left out.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('One')).toBeTruthy();
    expect(controller.books).toHaveLength(1);
    controller.destroy();
  });

  it('says one other file was skipped in the singular', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await chooseFile(
      file(epub('One', 'First.'), 'one.epub'),
      file(epub('Two', 'Second.'), 'two.epub'),
    );

    expect(
      await screen.findByText(
        'BookaLLM adds one book at a time, so only the first file was added. The other file was left out.',
      ),
    ).toBeTruthy();
    controller.destroy();
  });

  it('lets the reader postpone the first import, and go back later', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(controller.screen).toBe('landing');
    controller.destroy();
  });

  it('goes back to the landing screen when a book already exists', async () => {
    const { controller } = await ready({ books: [await bookOf('Candide')] });
    controller.requestImport();
    render(ImportScreen, withController(controller));

    await fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(controller.screen).toBe('landing');
    controller.destroy();
  });
});

describe('ImportScreen: waiting and the result', () => {
  it('shows the plain wait message with the file name before any result', async () => {
    let seen = '';
    const { controller } = await ready({
      nextFrame: async () => {
        await tick();
        seen = document.body.textContent ?? '';
      },
    });
    render(ImportScreen, withController(controller));

    await chooseFile(file(epub('Candide'), 'candide.epub'));
    await screen.findByRole('heading', { level: 1, name: 'Book added' });

    expect(seen).toContain('Getting to know this book…');
    expect(seen).toContain('Reading candide.epub');
    expect(seen).not.toContain('Book added');
    controller.destroy();
  });

  it('shows the title, authors and chapter count of the new book, saves it, and continues to the landing screen', async () => {
    const { controller, library } = await ready();
    render(ImportScreen, withController(controller));

    await chooseFile(file(epub('Candide'), 'candide.epub'));

    expect(await screen.findByText('Candide')).toBeTruthy();
    expect(screen.getByText('by Someone')).toBeTruthy();
    expect(screen.getByText('1 chapter')).toBeTruthy();
    expect(screen.getByText(/It is now your active book/)).toBeTruthy();
    expect(await library.registry.list()).toHaveLength(1);
    expect(controller.activeBook?.title).toBe('Candide');

    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(controller.screen).toBe('landing');
    controller.destroy();
  });

  it('shows the file name when the book has no title', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await chooseFile(
      file(epub('x', 'Words.', { title: null }), 'mystery.epub'),
    );

    expect(await screen.findByText('mystery.epub')).toBeTruthy();
    controller.destroy();
  });

  it('says the book was already imported and does not add it again', async () => {
    const bytes = epub('Candide');
    const { controller } = await ready();
    render(ImportScreen, withController(controller));
    await chooseFile(file(bytes, 'candide.epub'));
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Continue' }),
    );
    controller.requestImport();
    await tick();

    await chooseFile(file(bytes, 'candide-again.epub'));

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'You already have this book',
      }),
    ).toBeTruthy();
    expect(controller.books).toHaveLength(1);
    controller.destroy();
  });

  it('is in French', async () => {
    const { controller } = await ready({ language: 'fr' });
    render(ImportScreen, withController(controller));

    expect(
      screen.getByRole('button', {
        name: 'Déposez un EPUB ici, ou choisissez un fichier',
      }),
    ).toBeTruthy();
    await chooseFile(file(epub('Candide'), 'candide.epub'));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Livre ajouté' }),
    ).toBeTruthy();
    expect(screen.getByText('de Someone')).toBeTruthy();
    controller.destroy();
  });
});

describe('ImportScreen: every failure is explained in plain language', () => {
  const cases = [
    [
      'a file that is not an EPUB',
      () => new TextEncoder().encode('hello'),
      /is not an EPUB book/,
    ],
    [
      'a damaged EPUB',
      () => epub('D', 'x', { files: { 'OEBPS/content.opf': null } }),
      /could not be read\. The file may be damaged/,
    ],
    [
      'an image-only EPUB',
      () =>
        epub('I', '', {
          documents: [{ href: 'a.xhtml', body: '<img src="x.png" alt=""/>' }],
        }),
      /no readable text in it, only images/,
    ],
    [
      'a protected book',
      () =>
        epub('P', 'Text.', { files: { 'META-INF/rights.xml': '<rights/>' } }),
      /protected against copying \(DRM\)\. BookaLLM never removes that protection.*copy of the book without protection/,
    ],
    [
      'a book with encrypted content',
      () =>
        epub('P', 'Text.', {
          files: { 'META-INF/encryption.xml': encryptionXml([AES_ALGORITHM]) },
        }),
      /never removes that protection/,
    ],
  ] as const;

  it.each(cases)(
    'explains %s and offers another file',
    async (_name, make, message) => {
      const { controller } = await ready();
      render(ImportScreen, withController(controller));

      await chooseFile(file(make()));

      expect((await screen.findByRole('alert')).textContent).toMatch(message);
      expect(
        screen.getByRole('heading', {
          level: 1,
          name: 'This book could not be added',
        }),
      ).toBeTruthy();

      await fireEvent.click(
        screen.getByRole('button', { name: 'Try another file' }),
      );
      expect(screen.getByRole('button', { name: DROP })).toBeTruthy();
      expect(controller.books).toHaveLength(0);
      controller.destroy();
    },
  );

  it('explains a protected book in French', async () => {
    const { controller } = await ready({ language: 'fr' });
    render(ImportScreen, withController(controller));

    await chooseFile(
      file(
        epub('P', 'Text.', { files: { 'META-INF/rights.xml': '<rights/>' } }),
      ),
    );

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /ne retire jamais cette protection/,
    );
    expect(
      screen.getByRole('button', { name: 'Essayer un autre fichier' }),
    ).toBeTruthy();
    controller.destroy();
  });
});

describe('ImportScreen: a possible duplicate is a question, not a replacement', () => {
  async function withOneBook() {
    const context = await ready();
    render(ImportScreen, withController(context.controller));
    await chooseFile(file(epub('Candide', 'Edition one.'), 'candide.epub'));
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Continue' }),
    );
    context.controller.requestImport();
    await tick();
    return context;
  }

  it('shows both books side by side and offers exactly two actions', async () => {
    const { controller } = await withOneBook();

    await chooseFile(
      file(epub('Candide', 'A different edition.'), 'candide-2.epub'),
    );

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Is this a book you already have?',
      }),
    ).toBeTruthy();
    expect(screen.getByText('The file you chose')).toBeTruthy();
    expect(screen.getByText('Already in BookaLLM')).toBeTruthy();
    expect(screen.getAllByText('Candide')).toHaveLength(2);
    const actions = screen
      .getAllByRole('button')
      .map((button) => button.textContent?.trim());
    expect(actions).toEqual(['Add as a separate book', 'Cancel']);
    expect(controller.books).toHaveLength(1);
    controller.destroy();
  });

  it('keeps both books when the reader adds it separately, leaving the original unchanged', async () => {
    const { controller } = await withOneBook();
    const original = controller.books[0];
    await chooseFile(
      file(epub('Candide', 'A different edition.'), 'candide-2.epub'),
    );

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Add as a separate book' }),
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Book added' }),
    ).toBeTruthy();
    expect(controller.books).toHaveLength(2);
    expect(controller.books[0]).toEqual(original);
    controller.destroy();
  });

  it('saves nothing when the reader cancels', async () => {
    const { controller } = await withOneBook();
    const original = controller.books[0];
    await chooseFile(
      file(epub('Candide', 'A different edition.'), 'candide-2.epub'),
    );

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    expect(controller.books).toEqual([original]);
    expect(screen.getByRole('button', { name: DROP })).toBeTruthy();
    controller.destroy();
  });
});

describe('ImportScreen: a failed save leaves nothing half-saved', () => {
  function failingLibrary(error: Error): {
    library: BookLibrary;
    memory: MemoryLibrary;
  } {
    const memory = new MemoryLibrary();
    return {
      memory,
      library: {
        registry: memory.registry,
        saveBook: () => Promise.reject(error),
        getBook: (hash) => memory.getBook(hash),
        close: () => undefined,
      },
    };
  }

  it('says there is no room and shows no new book', async () => {
    const { library, memory } = failingLibrary(new StorageFullError());
    const { controller } = await ready({ library });
    render(ImportScreen, withController(controller));

    await chooseFile(file(epub('Candide'), 'candide.epub'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'not enough room to save this book',
    );
    expect(controller.books).toHaveLength(0);
    expect(await memory.registry.list()).toEqual([]);
    controller.destroy();
  });

  it('says the book could not be saved for any other reason', async () => {
    const { library } = failingLibrary(new Error('boom'));
    const { controller } = await ready({ library });
    render(ImportScreen, withController(controller));

    await chooseFile(file(epub('Candide'), 'candide.epub'));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'could not be saved on this device',
    );
    controller.destroy();
  });
});

describe('ImportScreen: the reader’s file is only ever read', () => {
  it('touches nothing on the file except its name and its contents', async () => {
    const real = file(epub('Candide'), 'candide.epub');
    const before = {
      size: real.size,
      lastModified: real.lastModified,
      name: real.name,
    };
    const touched = new Set<string>();
    const spy = new Proxy(real, {
      get(target, property) {
        touched.add(String(property));
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const { controller } = await ready();

    await controller.importFiles([spy]);

    expect([...touched].sort()).toEqual(['arrayBuffer', 'name']);
    expect({
      size: real.size,
      lastModified: real.lastModified,
      name: real.name,
    }).toEqual(before);
    expect(controller.importState.kind).toBe('imported');
    controller.destroy();
  });

  it('never offers to remove, delete or overwrite anything, in any state', async () => {
    const forbidden =
      /remove|delete|overwrite|replace|supprimer|effacer|remplacer/i;
    const buttonNames = () =>
      screen.queryAllByRole('button').map((button) => button.textContent ?? '');

    const { controller } = await ready();
    render(ImportScreen, withController(controller));
    expect(buttonNames().filter((name) => forbidden.test(name))).toEqual([]);

    await chooseFile(file(new TextEncoder().encode('hello')));
    await screen.findByRole('alert');
    expect(buttonNames().filter((name) => forbidden.test(name))).toEqual([]);
    await fireEvent.click(
      screen.getByRole('button', { name: 'Try another file' }),
    );

    await chooseFile(file(epub('Candide', 'One.'), 'candide.epub'));
    await screen.findByRole('heading', { level: 1, name: 'Book added' });
    expect(buttonNames().filter((name) => forbidden.test(name))).toEqual([]);
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    controller.requestImport();
    await tick();

    await chooseFile(file(epub('Candide', 'Two.'), 'candide-2.epub'));
    await screen.findByRole('heading', {
      level: 1,
      name: 'Is this a book you already have?',
    });
    expect(buttonNames().filter((name) => forbidden.test(name))).toEqual([]);
    controller.destroy();
  });

  it('waits for the work to finish before showing a result', async () => {
    const { controller } = await ready();
    render(ImportScreen, withController(controller));

    await chooseFile(file(epub('Candide'), 'candide.epub'));

    await waitFor(() => expect(controller.importState.kind).toBe('imported'));
    controller.destroy();
  });
});
