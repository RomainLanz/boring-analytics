import adonisjs from '@adonisjs/vite/client';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { context } from 'esbuild';
import { defineConfig, type Plugin } from 'vite';

function watchTracker(): Plugin {
	let tracker: Awaited<ReturnType<typeof context>> | undefined;

	return {
		name: 'watch-tracker',
		apply: 'serve',
		async configureServer() {
			tracker = await context({
				entryPoints: [`${import.meta.dirname}/tracker/tracker.ts`],
				bundle: true,
				minify: true,
				target: 'es2020',
				outfile: `${import.meta.dirname}/public/tracker.js`,
			});
			await tracker.watch();
		},
		async closeBundle() {
			await tracker?.dispose();
			tracker = undefined;
		},
	};
}

export default defineConfig({
	plugins: [
		watchTracker(),
		react(),
		tailwindcss(),
		adonisjs({ entryPoints: ['inertia/app.tsx'], reload: ['resources/views/**/*.edge'] }),
	],

	/**
	 * Define aliases for importing modules from
	 * your frontend code
	 */
	resolve: {
		alias: {
			'~/': `${import.meta.dirname}/inertia/`,
			'@generated': `${import.meta.dirname}/.adonisjs/client/`,
		},
	},

	server: {
		allowedHosts: process.env.AMP_ORB ? true : undefined,
		watch: {
			ignored: ['**/storage/**', '**/tmp/**'],
		},
	},
});
