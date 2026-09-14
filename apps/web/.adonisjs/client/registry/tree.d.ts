/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  funnels: {
    index: typeof routes['funnels.index']
    create: typeof routes['funnels.create']
    store: typeof routes['funnels.store']
    show: typeof routes['funnels.show']
    edit: typeof routes['funnels.edit']
    update: typeof routes['funnels.update']
  }
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
    export: typeof routes['account.export']
  }
  health: {
    live: typeof routes['health.live']
    ready: typeof routes['health.ready']
  }
  websites: {
    create: typeof routes['websites.create']
    store: typeof routes['websites.store']
    show: typeof routes['websites.show']
    events: typeof routes['websites.events']
  }
  websiteServerKeys: {
    index: typeof routes['website_server_keys.index']
    store: typeof routes['website_server_keys.store']
    destroy: typeof routes['website_server_keys.destroy']
  }
  websiteAllowedDomains: {
    store: typeof routes['website_allowed_domains.store']
    destroy: typeof routes['website_allowed_domains.destroy']
  }
  websiteCollectionKeys: {
    store: typeof routes['website_collection_keys.store']
    destroy: typeof routes['website_collection_keys.destroy']
  }
  events: {
    store: typeof routes['events.store']
  }
  serverEvents: {
    store: typeof routes['server_events.store']
  }
  websiteIdentityMode: {
    update: typeof routes['website_identity_mode.update']
  }
  websiteRetention: {
    update: typeof routes['website_retention.update']
  }
  home: typeof routes['home']
}
