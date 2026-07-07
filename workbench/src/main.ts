import '@fontsource/cardo/400.css';
import '@fontsource/cardo/400-italic.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/600.css';
import './styles/tokens.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, {
  target: document.getElementById('app')!,
});
