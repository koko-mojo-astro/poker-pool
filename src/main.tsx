import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast';
import { AlertProvider } from './components/AlertContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <AlertProvider>
        <App />
      </AlertProvider>
    </ToastProvider>
  </StrictMode>,
)
