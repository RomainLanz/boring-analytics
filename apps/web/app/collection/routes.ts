import router from '@adonisjs/core/services/router';
import { controllers } from '#generated/controllers';
import { middleware, webMiddleware } from '#start/kernel';
import { limitCollectionSource, limitCollectionWebsite } from '#start/limiter';

router
	.post('/api/events', [controllers.collection.RecordBrowserEvent, 'execute'])
	.use([
		limitCollectionSource,
		middleware.requireJson(),
		middleware.bodyparser(),
		middleware.eventPayloadLimit(),
		limitCollectionWebsite,
	])
	.as('events.store');

router
	.post('/api/server/events', [controllers.collection.RecordServerEvent, 'execute'])
	.use([middleware.requireJson(), middleware.bodyparser(), middleware.eventPayloadLimit()])
	.as('server_events.store');

router
	.group(() => {
		router
			.get('/websites/:id/settings', [controllers.collection.ServerEventSettings, 'render'])
			.where('id', router.matchers.uuid())
			.as('website_server_keys.index');
		router
			.patch('/websites/:id/identity-mode', [controllers.websites.UpdateWebsiteIdentityMode, 'execute'])
			.where('id', router.matchers.uuid())
			.as('website_identity_mode.update');
		router
			.patch('/websites/:id/retention', [controllers.websites.UpdateWebsiteRetention, 'execute'])
			.where('id', router.matchers.uuid())
			.as('website_retention.update');
		router
			.post('/websites/:id/server-key', [controllers.collection.CreateServerKey, 'execute'])
			.where('id', router.matchers.uuid())
			.as('website_server_keys.store');
		router
			.delete('/websites/:id/server-key', [controllers.collection.RevokeServerKey, 'execute'])
			.where('id', router.matchers.uuid())
			.as('website_server_keys.destroy');
	})
	.use(webMiddleware)
	.use(middleware.auth());
