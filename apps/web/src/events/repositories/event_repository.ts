import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';

@inject()
export class EventRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async appendPageview(websiteId: string, path: string) {
		await this.transactions
			.currentDatabase()
			.insertInto('events')
			.values({ id: randomUUID(), website_id: websiteId, name: 'pageview', path })
			.execute();
	}
}
