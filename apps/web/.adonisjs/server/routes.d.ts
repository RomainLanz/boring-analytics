import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'account.show': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'websites.create': { paramsTuple?: []; params?: {} }
    'websites.store': { paramsTuple?: []; params?: {} }
    'websites.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'websites.events': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'events.store': { paramsTuple?: []; params?: {} }
    'server_events.store': { paramsTuple?: []; params?: {} }
    'website_server_keys.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'website_server_keys.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'website_server_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'home': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'account.show': { paramsTuple?: []; params?: {} }
    'websites.create': { paramsTuple?: []; params?: {} }
    'websites.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'websites.events': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'website_server_keys.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'home': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'account.show': { paramsTuple?: []; params?: {} }
    'websites.create': { paramsTuple?: []; params?: {} }
    'websites.show': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'websites.events': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'website_server_keys.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'home': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'websites.store': { paramsTuple?: []; params?: {} }
    'events.store': { paramsTuple?: []; params?: {} }
    'server_events.store': { paramsTuple?: []; params?: {} }
    'website_server_keys.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'website_server_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}