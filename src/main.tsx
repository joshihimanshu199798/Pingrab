import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError() {
      // Service worker registration skipped if blocked by sandbox headers
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);
