import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeProvider';
import { initTheme } from './utils/theme';

initTheme();

const isElectron = !!window.api;

const router = isElectron ? (
  <HashRouter>
    <App />
  </HashRouter>
) : (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <ThemeProvider>{router}</ThemeProvider>
);