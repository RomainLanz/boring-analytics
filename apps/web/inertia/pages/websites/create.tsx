import { Form } from '@adonisjs/inertia/react';
import { Button } from '@boring-analytics/design-system/button';
import { Card } from '@boring-analytics/design-system/card';
import { Field } from '@boring-analytics/design-system/field';
import { Head } from '@inertiajs/react';

export default function CreateWebsite() {
	return (
		<>
			<Head title="Add website" />
			<main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
				<header className="mb-8">
					<p className="text-accent text-sm font-semibold tracking-wide uppercase">Websites</p>
					<h1 className="text-ink mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Add a website</h1>
					<p className="text-muted mt-3">Choose the only domain allowed to send pageviews for this website.</p>
				</header>

				<Card>
					<Form route="websites.store">
						{({ errors, processing }) => (
							<div className="space-y-5">
								<Field label="Name" error={errors.name} name="name" placeholder="Marketing site" required />
								<Field
									label="Allowed domain"
									error={errors.allowedDomain}
									name="allowedDomain"
									placeholder="example.com"
									required
								/>
								<p className="text-muted text-sm">Enter a hostname without a protocol, port, or path.</p>
								<Button type="submit" size="large" loading={processing}>
									{processing ? 'Adding website…' : 'Add website'}
								</Button>
							</div>
						)}
					</Form>
				</Card>
			</main>
		</>
	);
}
