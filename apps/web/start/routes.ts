import '#app/collection/routes';
import '#app/funnels/routes';
import '#app/identity/routes';
import '#app/websites/routes';
import router from '@adonisjs/core/services/router';
import { webMiddleware } from '#start/kernel';

router
	.group(() => {
		router.on('/').renderInertia('home', {}).as('home');
	})
	.use(webMiddleware);
