import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'funnels.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.create': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.show': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
    'funnels.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
    'funnels.update': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
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
    'funnels.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.create': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.show': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
    'funnels.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
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
    'funnels.index': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.create': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'funnels.show': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
    'funnels.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
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
    'funnels.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
    'websites.store': { paramsTuple?: []; params?: {} }
    'events.store': { paramsTuple?: []; params?: {} }
    'server_events.store': { paramsTuple?: []; params?: {} }
    'website_server_keys.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  PUT: {
    'funnels.update': { paramsTuple: [ParamValue,ParamValue]; params: {'id': ParamValue,'funnelId': ParamValue} }
  }
  DELETE: {
    'website_server_keys.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}