import { createRoot } from 'react-dom/client';
import App from './Main';
if (!import.meta.env.DEV) throw Error('Review entry is development-only.');
createRoot(document.getElementById('root')!).render(<App />);
