import type { RouteObject } from 'react-router';

import { RequireOfficer } from './auth';
import { Alerts } from './screens/Alerts';
import { Feedback } from './screens/Feedback';
import { LiveOps } from './screens/LiveOps';
import { Paths } from './screens/Paths';
import { Replay } from './screens/Replay';
import { Reports } from './screens/Reports';
import { Safety } from './screens/Safety';
import { SignIn } from './screens/SignIn';
import { Sos } from './screens/Sos';
import { Shell } from './Shell';

export const routes: RouteObject[] = [
  { path: '/sign-in', element: <SignIn /> },
  {
    path: '/',
    element: <RequireOfficer><Shell /></RequireOfficer>,
    children: [
      { index: true, element: <LiveOps /> },
      { path: 'alerts', element: <Alerts /> },
      { path: 'reports', element: <Reports /> },
      { path: 'paths', element: <Paths /> },
      { path: 'sos', element: <Sos /> },
      { path: 'sos/:id', element: <Sos /> },
      { path: 'safety', element: <Safety /> },
      { path: 'replay', element: <Replay /> },
      { path: 'feedback', element: <Feedback /> },
    ],
  },
  { path: '*', element: <SignIn /> },
];
