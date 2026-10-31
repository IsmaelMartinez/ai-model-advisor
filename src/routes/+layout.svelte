<script>
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { asset } from '$app/paths';

  onMount(() => {
    if (browser && 'serviceWorker' in navigator) {
      // Resolve the service worker URL against the base path
      const swPath = asset('sw.js');

      // Register service worker for PWA functionality
      navigator.serviceWorker.register(swPath)
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope);

          // Check for updates periodically
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[PWA] New content available, refresh to update');
                }
              });
            }
          });
        })
        .catch((error) => {
          console.warn('[PWA] Service Worker registration failed:', error);
        });
    }
  });
</script>

<slot />
