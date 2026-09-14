import router from '@adonisjs/core/services/router';
import { controllers } from '#generated/controllers';
import { middleware, webMiddleware } from '#start/kernel';

router
	.group(() => {
		router.get('/websites/new', [controllers.websites.CreateWebsite, 'render']).as('websites.create');
		router.post('/websites', [controllers.websites.CreateWebsite, 'execute']).as('websites.store');
		router
			.get('/websites/:id', [controllers.websites.Website, 'render'])
			.where('id', router.matchers.uuid())
			.as('websites.show');
		router
			.get('/websites/:id/events', [controllers.websites.WebsiteEvents, 'render'])
			.where('id', router.matchers.uuid())
			.as('websites.events');
		router
			.get('/websites/:id/settings', [controllers.websites.WebsiteSettings, 'render'])
			.where('id', router.matchers.uuid())
			.as('website_server_keys.index');
		router
			.post('/websites/:id/allowed-domains', [controllers.websites.AddAllowedDomain, 'execute'])
			.where('id', router.matchers.uuid())
			.as('website_allowed_domains.store');
		router
			.delete('/websites/:id/allowed-domains/:domainId', [controllers.websites.RemoveAllowedDomain, 'execute'])
			.where('id', router.matchers.uuid())
			.where('domainId', router.matchers.uuid())
			.as('website_allowed_domains.destroy');
		router
			.post('/websites/:id/collection-keys', [controllers.websites.CreateCollectionKey, 'execute'])
			.where('id', router.matchers.uuid())
			.as('website_collection_keys.store');
		router
			.delete('/websites/:id/collection-keys/:keyId', [controllers.websites.RevokeCollectionKey, 'execute'])
			.where('id', router.matchers.uuid())
			.where('keyId', router.matchers.uuid())
			.as('website_collection_keys.destroy');
	})
	.use(webMiddleware)
	.use(middleware.auth());
