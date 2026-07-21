import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			pages: 'dist',
			assets: 'dist',
			fallback: null,
			precompress: false,
			strict: true
		}),
		paths: {
			// Base path for GitHub Pages deployment
			base: process.env.NODE_ENV === 'production' ? '/ai-model-advisor' : ''
		},
		// Content Security Policy. Managed by SvelteKit (hash mode) so that the
		// framework's own inline hydration script is allowlisted by hash rather
		// than by opening up `script-src` to all inline scripts. This keeps
		// `'unsafe-inline'` OUT of `script-src`, which is what actually blocks
		// injected inline <script> / event-handler XSS. The policy is emitted as
		// a <meta http-equiv> tag on the prerendered pages (GitHub Pages can't
		// set response headers).
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				// 'wasm-unsafe-eval' is required to compile the transformers.js
				// WASM backend. No 'unsafe-inline' — inline scripts run by hash only.
				'script-src': ['self', 'wasm-unsafe-eval'],
				'connect-src': [
					'self',
					'https://huggingface.co',
					'https://cdn-lfs.huggingface.co',
					'https://cdn-lfs-us-1.huggingface.co',
					'https://fonts.googleapis.com',
					'https://fonts.gstatic.com'
				],
				// 'unsafe-inline' stays only for styles: dynamic inline style
				// attributes (e.g. progress-bar width) require it and inline
				// styles are not a script-execution vector.
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'data:', 'https://fonts.gstatic.com'],
				'img-src': ['self', 'data:', 'blob:'],
				'worker-src': ['self', 'blob:'],
				'child-src': ['self', 'blob:'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		}
	}
};

export default config;