import { test } from '@japa/runner';
import { RegisterUser } from '#identity/actions/register_user';
import { UserRepository } from '#identity/repositories/user_repository';
import { db } from '#shared/services/db';
import { TransactionManager } from '#shared/services/transaction_manager';
import { WorkspaceRepository } from '#websites/repositories/workspace_repository';

class FailingWorkspaceRepository extends WorkspaceRepository {
	async createPersonalWorkspace() {
		throw new Error('Workspace persistence failed');
	}
}

test.group('RegisterUser transaction', (group) => {
	group.each.setup(async () => {
		await db.deleteFrom('users').execute();
	});

	test('rolls back the user when personal workspace creation fails', async ({ assert }) => {
		const transactions = new TransactionManager();
		const workspaces = new FailingWorkspaceRepository(transactions);
		const registerUser = new RegisterUser(new UserRepository(transactions), workspaces, transactions);

		await assert.rejects(
			() =>
				registerUser.execute({
					name: 'Ada Lovelace',
					email: 'ada@example.com',
					password: 'a-secure-password',
				}),
			'Workspace persistence failed',
		);
		assert.lengthOf(await db.selectFrom('users').select('id').execute(), 0);
	});
});
