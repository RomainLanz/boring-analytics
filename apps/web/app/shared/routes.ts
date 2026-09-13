import router from '@adonisjs/core/services/router';
import { controllers } from '#generated/controllers';

router.get('/health/live', [controllers.shared.Liveness, 'execute']).as('health.live');
router.get('/health/ready', [controllers.shared.Readiness, 'execute']).as('health.ready');
