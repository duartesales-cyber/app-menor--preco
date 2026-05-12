import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element. Ensure index.html has an element with id "root".');
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);