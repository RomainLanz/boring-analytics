import '@adonisjs/inertia/types'

import type React from 'react'
import type { Prettify } from '@adonisjs/core/types/common'

type ExtractProps<T> =
  T extends React.FC<infer Props>
    ? Prettify<Omit<Props, 'children'>>
    : T extends React.Component<infer Props>
      ? Prettify<Omit<Props, 'children'>>
      : never

declare module '@adonisjs/inertia/types' {
  export interface InertiaPages {
    'account/show': ExtractProps<(typeof import('../../inertia/pages/account/show.tsx'))['default']>
    'auth/login': ExtractProps<(typeof import('../../inertia/pages/auth/login.tsx'))['default']>
    'auth/signup': ExtractProps<(typeof import('../../inertia/pages/auth/signup.tsx'))['default']>
    'errors/not_found': ExtractProps<(typeof import('../../inertia/pages/errors/not_found.tsx'))['default']>
    'errors/server_error': ExtractProps<(typeof import('../../inertia/pages/errors/server_error.tsx'))['default']>
    'funnels/create': ExtractProps<(typeof import('../../inertia/pages/funnels/create.tsx'))['default']>
    'funnels/edit': ExtractProps<(typeof import('../../inertia/pages/funnels/edit.tsx'))['default']>
    'funnels/index': ExtractProps<(typeof import('../../inertia/pages/funnels/index.tsx'))['default']>
    'funnels/show': ExtractProps<(typeof import('../../inertia/pages/funnels/show.tsx'))['default']>
    'home': ExtractProps<(typeof import('../../inertia/pages/home.tsx'))['default']>
    'websites/create': ExtractProps<(typeof import('../../inertia/pages/websites/create.tsx'))['default']>
    'websites/events': ExtractProps<(typeof import('../../inertia/pages/websites/events.tsx'))['default']>
    'websites/settings': ExtractProps<(typeof import('../../inertia/pages/websites/settings.tsx'))['default']>
    'websites/show': ExtractProps<(typeof import('../../inertia/pages/websites/show.tsx'))['default']>
  }
}
