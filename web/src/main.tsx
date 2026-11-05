import { createRoot } from 'react-dom/client';
import { App } from './app/app.tsx';
import { TooltipProvider } from './components/tooltip.tsx';
import '@fontsource-variable/geist';
import './styles.css';
createRoot(document.getElementById('root')!).render(
  <TooltipProvider delayDuration={350} skipDelayDuration={150}>
    <App />
  </TooltipProvider>,
);
