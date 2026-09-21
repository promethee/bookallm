import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { createServices } from './lib/onboarding/services';

// index.html shows a splash until the app is ready, so a slow start never looks like a
// blank window.
const splash = document.getElementById('splash');

async function start() {
  const services = await createServices();
  const app = mount(App, {
    target: document.getElementById('app')!,
    props: { services },
  });
  splash?.remove();
  return app;
}

const app = await start().catch((error: unknown) => {
  console.error(error);
  if (splash) {
    splash.dataset.failed = '';
    const text = splash.querySelector('#splash-text');
    if (text) text.textContent = splash.dataset.failure ?? null;
  }
  return undefined;
});

export default app;
