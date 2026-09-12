import router from '@adonisjs/core/services/router';
import { controllers } from '#generated/controllers';
import { middleware } from '#start/kernel';
import { limitCollectionSource, limitCollectionWebsite } from '#start/limiter';

router
	.post('/api/events', [controllers.collection.RecordBrowserEvent, 'execute'])
	.use([limitCollectionSource, middleware.requireJson(), middleware.bodyparser(), limitCollectionWebsite])
	.as('events.store');
