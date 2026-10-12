import { lazy } from 'react';

// three.js is only downloaded when someone opens the 3D view (separate web chunk; on phones, the DOM component's own bundle).
export const Campus3DView = lazy(() => import('./Campus3DView'));
