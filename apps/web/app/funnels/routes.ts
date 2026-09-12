import router from '@adonisjs/core/services/router';
import { controllers } from '#generated/controllers';
import { middleware, webMiddleware } from '#start/kernel';

router
	.group(() => {
		router
			.get('/websites/:id/funnels', [controllers.funnels.WebsiteFunnels, 'render'])
			.where('id', router.matchers.uuid())
			.as('funnels.index');
		router
			.get('/websites/:id/funnels/new', [controllers.funnels.CreateFunnel, 'render'])
			.where('id', router.matchers.uuid())
			.as('funnels.create');
		router
			.post('/websites/:id/funnels', [controllers.funnels.CreateFunnel, 'execute'])
			.where('id', router.matchers.uuid())
			.as('funnels.store');
		router
			.get('/websites/:id/funnels/:funnelId', [controllers.funnels.FunnelReport, 'render'])
			.where('id', router.matchers.uuid())
			.where('funnelId', router.matchers.uuid())
			.as('funnels.show');
		router
			.get('/websites/:id/funnels/:funnelId/edit', [controllers.funnels.EditFunnel, 'render'])
			.where('id', router.matchers.uuid())
			.where('funnelId', router.matchers.uuid())
			.as('funnels.edit');
		router
			.put('/websites/:id/funnels/:funnelId', [controllers.funnels.EditFunnel, 'execute'])
			.where('id', router.matchers.uuid())
			.where('funnelId', router.matchers.uuid())
			.as('funnels.update');
	})
	.use(webMiddleware)
	.use(middleware.auth());
