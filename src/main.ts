import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { createServices } from './lib/onboarding/services';

const services = await createServices();
const app = mount(App, {
  target: document.getElementById('app')!,
  props: { services },
});

export default app;
