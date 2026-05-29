export function registerServiceWorker() {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
          console.log('ServiceWorker registered:', reg);

          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('New content available; please refresh.');
                } else {
                  console.log('Content cached for offline use.');
                }
              }
            });
          });
        })
        .catch(err => console.error('ServiceWorker registration failed:', err));
    });

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      const ev = e as any;
      ev.preventDefault();
      (window as any).__soulmapDeferredInstallPrompt = ev;
    });
  } else {
    console.log('Service workers not supported or insecure context.');
  }
}
