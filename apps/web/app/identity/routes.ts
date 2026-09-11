import router from '@adonisjs/core/services/router';
import { controllers } from '#generated/controllers';
import { middleware, webMiddleware } from '#start/kernel';

router
	.group(() => {
		router.get('signup', [controllers.identity.RegisterUser, 'render']).as('new_account.create');
		router.post('signup', [controllers.identity.RegisterUser, 'execute']).as('new_account.store');
		router.get('login', [controllers.identity.Login, 'render']).as('session.create');
		router.post('login', [controllers.identity.Login, 'execute']).as('session.store');
	})
	.use(webMiddleware)
	.use(middleware.guest());

router
	.group(() => {
		router.get('account', [controllers.identity.Account, 'render']).as('account.show');
		router.post('logout', [controllers.identity.Logout, 'execute']).as('session.destroy');
	})
	.use(webMiddleware)
	.use(middleware.auth());
