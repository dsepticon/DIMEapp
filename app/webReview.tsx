// Development-only entry; excluded from production build inputs.
import { createRoot } from 'react-dom/client';
import Main from './original/Main';
if (!import.meta.env.DEV) throw Error('Review entry is development-only.');
createRoot(document.getElementById('root')!).render(<Main webReview />);
