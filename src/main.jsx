import { createRoot } from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App.jsx";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeProvider.jsx";
import { initTheme } from "./utils/theme.js";

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

createRoot(document.getElementById("root")).render(
  <ThemeProvider>{router}</ThemeProvider>
);
