import { Form } from '@adonisjs/inertia/react';
import { type Data } from '@generated/data';
import { Head } from '@inertiajs/react';
import { FunnelForm } from '~/components/funnel-form';
import { WebsiteReportHeader } from '~/components/website-report-header';
import { type InertiaProps } from '~/types';

type PageProps = InertiaProps<{ editor: Data.Funnels.FunnelEditor }>;

export default function EditFunnel({ editor }: PageProps) {
	if (!editor.funnel) {
		return null;
	}

	return (
		<>
			<Head title={`Edit ${editor.funnel.name}`} />
			<main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
				<WebsiteReportHeader website={editor.website} period={editor.period} activeReport="funnels" />
				<header className="mb-5">
					<h2 className="text-ink text-xl font-bold tracking-tight">Edit {editor.funnel.name}</h2>
					<p className="text-muted mt-1 text-sm">Changes apply to the full report period.</p>
				</header>
				<Form route="funnels.update" routeParams={{ id: editor.website.id, funnelId: editor.funnel.id }}>
					{({ errors, processing }) => (
						<FunnelForm editor={editor} errors={errors} processing={processing} submitLabel="Save Funnel" />
					)}
				</Form>
			</main>
		</>
	);
}
