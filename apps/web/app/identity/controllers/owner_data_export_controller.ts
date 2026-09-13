import { Readable } from 'node:stream';
import { inject } from '@adonisjs/core';
import { OWNER_DATA_EXPORT_SCHEMA_VERSION, OwnerDataExport } from '#identity/queries/owner_data_export';
import type { HttpContext } from '@adonisjs/core/http';

@inject()
export default class OwnerDataExportController {
	constructor(private readonly ownerDataExport: OwnerDataExport) {}

	execute({ auth, response }: HttpContext) {
		const exportedAt = new Date();
		const filenameDate = exportedAt.toISOString().slice(0, 10);
		response.header('Content-Type', 'application/x-ndjson; charset=utf-8');
		response.header(
			'Content-Disposition',
			`attachment; filename="boring-analytics-export-v${OWNER_DATA_EXPORT_SCHEMA_VERSION}-${filenameDate}.jsonl"`,
		);
		response.header('Cache-Control', 'private, no-store');
		response.header('X-Content-Type-Options', 'nosniff');
		response.stream(Readable.from(this.ownerDataExport.stream(auth.getUserOrFail().id, exportedAt)));
	}
}
