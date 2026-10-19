import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

try {
  if (localStorage.getItem('sf-erp-theme') === 'light') document.documentElement.dataset.theme = 'light';
} catch {
  // 讀不到瀏覽器儲存時用預設深色
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
