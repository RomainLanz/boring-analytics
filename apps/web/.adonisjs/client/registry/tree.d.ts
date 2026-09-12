/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    destroy: typeof routes['session.destroy']
  }
  account: {
    show: typeof routes['account.show']
  }
  websites: {
    create: typeof routes['websites.create']
    store: typeof routes['websites.store']
    show: typeof routes['websites.show']
    events: typeof routes['websites.events']
  }
  events: {
    store: typeof routes['events.store']
  }
  home: typeof routes['home']
}
