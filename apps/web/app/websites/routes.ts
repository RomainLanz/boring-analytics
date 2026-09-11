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
	})
	.use(webMiddleware)
	.use(middleware.auth());
