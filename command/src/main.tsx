import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './theme.css';

import { cssVariables } from '@evacuai/design';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';

import { makeQueryClient } from './realtime';
import { routes } from './routes';

document.documentElement.style.cssText = cssVariables('dark'); // the Signage tokens as --evac-* variables

const router = createBrowserRouter(routes, { basename: '/command' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={makeQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
