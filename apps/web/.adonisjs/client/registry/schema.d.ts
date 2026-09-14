/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'funnels.index': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id/funnels'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/funnels/controllers/website_funnels_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/funnels/controllers/website_funnels_controller').default['render']>>>
    }
  }
  'funnels.create': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id/funnels/new'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/funnels/controllers/create_funnel_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/funnels/controllers/create_funnel_controller').default['render']>>>
    }
  }
  'funnels.store': {
    methods: ["POST"]
    pattern: '/websites/:id/funnels'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/funnels/validators/funnel_validator').funnelValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/funnels/validators/funnel_validator').funnelValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/funnels/controllers/create_funnel_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/funnels/controllers/create_funnel_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'funnels.show': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id/funnels/:funnelId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; funnelId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/funnels/controllers/funnel_report_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/funnels/controllers/funnel_report_controller').default['render']>>>
    }
  }
  'funnels.edit': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id/funnels/:funnelId/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; funnelId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/funnels/controllers/edit_funnel_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/funnels/controllers/edit_funnel_controller').default['render']>>>
    }
  }
  'funnels.update': {
    methods: ["PUT"]
    pattern: '/websites/:id/funnels/:funnelId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/funnels/validators/funnel_validator').funnelValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; funnelId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/funnels/validators/funnel_validator').funnelValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/funnels/controllers/edit_funnel_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/funnels/controllers/edit_funnel_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'new_account.create': {
    methods: ["GET","HEAD"]
    pattern: '/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/register_user_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/register_user_controller').default['render']>>>
    }
  }
  'new_account.store': {
    methods: ["POST"]
    pattern: '/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/identity/controllers/register_user_controller').default)['validator']>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/identity/controllers/register_user_controller').default)['validator']>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/register_user_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/register_user_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'session.create': {
    methods: ["GET","HEAD"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/login_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/login_controller').default['render']>>>
    }
  }
  'session.store': {
    methods: ["POST"]
    pattern: '/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/identity/controllers/login_controller').default)['validator']>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/identity/controllers/login_controller').default)['validator']>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/login_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/login_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'account.show': {
    methods: ["GET","HEAD"]
    pattern: '/account'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/account_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/account_controller').default['render']>>>
    }
  }
  'account.export': {
    methods: ["GET","HEAD"]
    pattern: '/account/export'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/owner_data_export_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/owner_data_export_controller').default['execute']>>>
    }
  }
  'session.destroy': {
    methods: ["POST"]
    pattern: '/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/identity/controllers/logout_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/identity/controllers/logout_controller').default['execute']>>>
    }
  }
  'health.live': {
    methods: ["GET","HEAD"]
    pattern: '/health/live'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/shared/controllers/liveness_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/shared/controllers/liveness_controller').default['execute']>>>
    }
  }
  'health.ready': {
    methods: ["GET","HEAD"]
    pattern: '/health/ready'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/shared/controllers/readiness_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/shared/controllers/readiness_controller').default['execute']>>>
    }
  }
  'websites.create': {
    methods: ["GET","HEAD"]
    pattern: '/websites/new'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/create_website_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/create_website_controller').default['render']>>>
    }
  }
  'websites.store': {
    methods: ["POST"]
    pattern: '/websites'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/websites/controllers/create_website_controller').default)['validator']>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#app/websites/controllers/create_website_controller').default)['validator']>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/create_website_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/create_website_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'websites.show': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/website_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/website_controller').default['render']>>>
    }
  }
  'websites.events': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id/events'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/website_events_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/website_events_controller').default['render']>>>
    }
  }
  'website_server_keys.index': {
    methods: ["GET","HEAD"]
    pattern: '/websites/:id/settings'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/website_settings_controller').default['render']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/website_settings_controller').default['render']>>>
    }
  }
  'website_allowed_domains.store': {
    methods: ["POST"]
    pattern: '/websites/:id/allowed-domains'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/websites/controllers/add_allowed_domain_controller').default)['validator']>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/websites/controllers/add_allowed_domain_controller').default)['validator']>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/add_allowed_domain_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/add_allowed_domain_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'website_allowed_domains.destroy': {
    methods: ["DELETE"]
    pattern: '/websites/:id/allowed-domains/:domainId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; domainId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/remove_allowed_domain_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/remove_allowed_domain_controller').default['execute']>>>
    }
  }
  'website_collection_keys.store': {
    methods: ["POST"]
    pattern: '/websites/:id/collection-keys'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/create_collection_key_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/create_collection_key_controller').default['execute']>>>
    }
  }
  'website_collection_keys.destroy': {
    methods: ["DELETE"]
    pattern: '/websites/:id/collection-keys/:keyId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { id: ParamValue; keyId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/revoke_collection_key_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/revoke_collection_key_controller').default['execute']>>>
    }
  }
  'events.store': {
    methods: ["POST"]
    pattern: '/api/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/collection/controllers/record_browser_event_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/collection/controllers/record_browser_event_controller').default['execute']>>>
    }
  }
  'server_events.store': {
    methods: ["POST"]
    pattern: '/api/server/events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/collection/controllers/record_server_event_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/collection/controllers/record_server_event_controller').default['execute']>>>
    }
  }
  'website_identity_mode.update': {
    methods: ["PATCH"]
    pattern: '/websites/:id/identity-mode'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/websites/controllers/update_website_identity_mode_controller').default)['validator']>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/websites/controllers/update_website_identity_mode_controller').default)['validator']>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/update_website_identity_mode_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/update_website_identity_mode_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'website_retention.update': {
    methods: ["PATCH"]
    pattern: '/websites/:id/retention'
    types: {
      body: ExtractBody<InferInput<(typeof import('#app/websites/controllers/update_website_retention_controller').default)['validator']>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#app/websites/controllers/update_website_retention_controller').default)['validator']>>
      response: ExtractResponse<Awaited<ReturnType<import('#app/websites/controllers/update_website_retention_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/websites/controllers/update_website_retention_controller').default['execute']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'website_server_keys.store': {
    methods: ["POST"]
    pattern: '/websites/:id/server-key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/collection/controllers/create_server_key_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/collection/controllers/create_server_key_controller').default['execute']>>>
    }
  }
  'website_server_keys.destroy': {
    methods: ["DELETE"]
    pattern: '/websites/:id/server-key'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#app/collection/controllers/revoke_server_key_controller').default['execute']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#app/collection/controllers/revoke_server_key_controller').default['execute']>>>
    }
  }
  'home': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
}
