import { randomUUID } from 'node:crypto';
import { inject } from '@adonisjs/core';
import { TransactionManager } from '#shared/services/transaction_manager';

@inject()
export class WorkspaceRepository {
	constructor(private readonly transactions: TransactionManager) {}

	async createPersonalWorkspace(ownerUserId: string) {
		await this.transactions
			.currentDatabase()
			.insertInto('workspaces')
			.values({ id: randomUUID(), owner_user_id: ownerUserId })
			.execute();
	}
}
