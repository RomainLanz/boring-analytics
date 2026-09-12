/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'new_account.create': {
    methods: ["GET","HEAD"],
    pattern: '/signup',
    tokens: [{"old":"/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['new_account.create']['types'],
  },
  'new_account.store': {
    methods: ["POST"],
    pattern: '/signup',
    tokens: [{"old":"/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['new_account.store']['types'],
  },
  'session.create': {
    methods: ["GET","HEAD"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['session.create']['types'],
  },
  'session.store': {
    methods: ["POST"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['session.store']['types'],
  },
  'account.show': {
    methods: ["GET","HEAD"],
    pattern: '/account',
    tokens: [{"old":"/account","type":0,"val":"account","end":""}],
    types: placeholder as Registry['account.show']['types'],
  },
  'session.destroy': {
    methods: ["POST"],
    pattern: '/logout',
    tokens: [{"old":"/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['session.destroy']['types'],
  },
  'websites.create': {
    methods: ["GET","HEAD"],
    pattern: '/websites/new',
    tokens: [{"old":"/websites/new","type":0,"val":"websites","end":""},{"old":"/websites/new","type":0,"val":"new","end":""}],
    types: placeholder as Registry['websites.create']['types'],
  },
  'websites.store': {
    methods: ["POST"],
    pattern: '/websites',
    tokens: [{"old":"/websites","type":0,"val":"websites","end":""}],
    types: placeholder as Registry['websites.store']['types'],
  },
  'websites.show': {
    methods: ["GET","HEAD"],
    pattern: '/websites/:id',
    tokens: [{"old":"/websites/:id","type":0,"val":"websites","end":""},{"old":"/websites/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['websites.show']['types'],
  },
  'websites.events': {
    methods: ["GET","HEAD"],
    pattern: '/websites/:id/events',
    tokens: [{"old":"/websites/:id/events","type":0,"val":"websites","end":""},{"old":"/websites/:id/events","type":1,"val":"id","end":""},{"old":"/websites/:id/events","type":0,"val":"events","end":""}],
    types: placeholder as Registry['websites.events']['types'],
  },
  'events.store': {
    methods: ["POST"],
    pattern: '/api/events',
    tokens: [{"old":"/api/events","type":0,"val":"api","end":""},{"old":"/api/events","type":0,"val":"events","end":""}],
    types: placeholder as Registry['events.store']['types'],
  },
  'server_events.store': {
    methods: ["POST"],
    pattern: '/api/server/events',
    tokens: [{"old":"/api/server/events","type":0,"val":"api","end":""},{"old":"/api/server/events","type":0,"val":"server","end":""},{"old":"/api/server/events","type":0,"val":"events","end":""}],
    types: placeholder as Registry['server_events.store']['types'],
  },
  'website_server_keys.index': {
    methods: ["GET","HEAD"],
    pattern: '/websites/:id/settings',
    tokens: [{"old":"/websites/:id/settings","type":0,"val":"websites","end":""},{"old":"/websites/:id/settings","type":1,"val":"id","end":""},{"old":"/websites/:id/settings","type":0,"val":"settings","end":""}],
    types: placeholder as Registry['website_server_keys.index']['types'],
  },
  'website_server_keys.store': {
    methods: ["POST"],
    pattern: '/websites/:id/server-key',
    tokens: [{"old":"/websites/:id/server-key","type":0,"val":"websites","end":""},{"old":"/websites/:id/server-key","type":1,"val":"id","end":""},{"old":"/websites/:id/server-key","type":0,"val":"server-key","end":""}],
    types: placeholder as Registry['website_server_keys.store']['types'],
  },
  'website_server_keys.destroy': {
    methods: ["DELETE"],
    pattern: '/websites/:id/server-key',
    tokens: [{"old":"/websites/:id/server-key","type":0,"val":"websites","end":""},{"old":"/websites/:id/server-key","type":1,"val":"id","end":""},{"old":"/websites/:id/server-key","type":0,"val":"server-key","end":""}],
    types: placeholder as Registry['website_server_keys.destroy']['types'],
  },
  'home': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['home']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
