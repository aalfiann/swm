// This version is used to invalidate the cache when the service worker is updated
const VERSION = '1.0.0'; // Update this version directly when making changes on website
// Cache name format: site-name-v1.0.0
const CACHE_NAME = `site-name-v${VERSION}`; // Change 'site-name' to your actual site name
// Cache expiration time in milliseconds
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours
// Environment variable to control cache expiration
// Set to 'development' for shorter cache expiration (1 minute) and 'production' will use CACHE_EXPIRATION.
const ENVIRONMENT = 'production'; // Change to 'development' or 'production'.
// Debugging flag to enable/disable console logs
const DEBUG = false; // Set to false in production

function log(...args) {
  if (DEBUG) {
    console.log('[ServiceWorker]', ...args);
  }
}

function logError(...args) {
  if (DEBUG) {
    console.error('[ServiceWorker Error]', ...args);
  }
}

// Files to cache explicitly
const urlsToCache = [
  '/favicon.ico'
];

// Pattern matching rules
const cachePatterns = [
  {
    pattern: /^\/$/, // Homepage
    strategy: 'cache-first'
  },
  {
    pattern: /^\/(about|contact)\/$/, // another static page if any
    strategy: 'cache-first'
  },
  {
    pattern: /^\/blog\/.*$/, // cache dynamic content page. i.e. /blog/* posts
    strategy: 'cache-first'
  },
  {
    pattern: /^\/js\/.+\.js$/, // Matches all .js files in /js/ directory
    strategy: 'cache-first'
  },
  {
    pattern: /^\/images\/.+\.(png|jpg|jpeg|gif|svg)$/, // Matches all images
    strategy: 'cache-first'
  },
  {
    // PWA assets
    pattern: /^\/pwa\/.+\.(png|jpg|jpeg)$/,
    strategy: 'cache-first'
  },
  {
    // Local fonts
    pattern: /^\/fonts\/.+\.(woff|woff2|eot|ttf|otf)$/,
    strategy: 'cache-first'
  },
  {
    // Astro SSG assets if any
    pattern: /^\/_astro\/.+\.(css|js|png|webp|jpg|jpeg|svg|woff2)$/,
    strategy: 'cache-first'
  },
  {
    // Google Fonts
    pattern: /^https:\/\/fonts\.googleapis\.com\//,
    strategy: 'cache-first'
  },
  {
    // Google Fonts Files (actual font files)
    pattern: /^https:\/\/fonts\.gstatic\.com\//,
    strategy: 'cache-first'
  }
  // Add more patterns as needed
];

// Helper function to check if URL matches any pattern
function matchesPattern(url) {
  try {
    const urlObj = new URL(url);
    const full = urlObj.toString();
    const path = urlObj.pathname;
    return cachePatterns.find(({ pattern }) => pattern.test(full) || pattern.test(path));
  } catch (error) {
    logError('Error matching pattern:', error);
    return false;
  }
}

// Install event with error handling
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        log('Cache opened');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        logError('Cache installation failed:', error);
      })
  );
  // Optional: immediately activate the service worker
  self.skipWaiting();
});

// Fetch event with improved error handling
self.addEventListener('fetch', event => {
  // Ignore non-GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const matchedPattern = matchesPattern(url);

  if (matchedPattern || urlsToCache.includes(new URL(url).pathname)) {
    event.respondWith(
      caches.match(event.request)
        .then(async cachedResponse => {
          if (cachedResponse) {
            const headers = cachedResponse.headers;
            const cachedAt = headers.get('cached-at');

            if (cachedAt) {
              const cachedTime = new Date(cachedAt).getTime();
              const now = new Date().getTime();

              if (now - cachedTime < (ENVIRONMENT === 'production' ? CACHE_EXPIRATION : (60 * 1000))) {
                return cachedResponse;
              }
            }
          }

          try {
            const response = await fetch(event.request.clone(), {
              credentials: 'same-origin',
              mode: 'cors' // Added for cross-origin requests like Google Fonts
            });

            if (!response || !response.ok) {
              return cachedResponse || response;
            }

            const responseToCache = response.clone();
            const cache = await caches.open(CACHE_NAME);

            const newHeaders = new Headers(response.headers);
            newHeaders.append('cached-at', new Date().toISOString());

            const responseToStore = new Response(responseToCache.body, {
              status: responseToCache.status,
              statusText: responseToCache.statusText,
              headers: newHeaders
            });

            if (event.request.url.startsWith('http')) {
              try {
                await cache.put(event.request, responseToStore);
              } catch (cacheError) {
                logError('Cache put error:', cacheError);
              }
            } else {
              log('Skipping cache.put for non-http(s) request:', event.request.url);
            }

            return response;
          } catch (error) {
            logError('Fetching failed:', error);
            return cachedResponse || new Response('Network error', { status: 408 });
          }
        })
    );
  } else {
    event.respondWith(
      fetch(event.request)
        .catch(error => {
          logError('Fetch error:', error);
          return new Response('Network error', { status: 408 });
        })
    );
  }
});

// Activate event with improved cleanup
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Optional: ensure new service worker takes control immediately
        return clients.claim();
      })
      .catch(error => {
        logError('Cache cleanup failed:', error);
      })
  );
});

// Handle push messages in the background
self.addEventListener("push", event => {
  if (!event.data) {
    console.warn("Push event received but no data available.");
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    console.error("Error parsing push data:", e);
  }

  const notif = data.notification || {};
  const title = notif.title || "New Notification";
  const options = {
    body: notif.body || "You have a new message.",
    icon: notif.image || "/pwa/icon-192x192.png",
    data: {
      url: notif.click_action || "/"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle notification clicks (compatible with FCM and regular push)
self.addEventListener('notificationclick', event => {
  event.preventDefault();
  event.notification.close();

  const url = (event.notification && event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    }).catch(error => console.error("Error handling notification click:", error))
  );
});

// Handle isolated messages for getting sw config
self.addEventListener('message', (event) => {
  if (event.data.type === 'GET_SW_CONFIG') {
    // Convert milliseconds to human readable format
    const msToHumanReadable = (ms) => {
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

      if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}`;
      if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
      if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
      return 'less than a minute';
    };

    event.ports[0].postMessage({
      version: VERSION,
      cacheName: CACHE_NAME,
      cacheExpiration: msToHumanReadable((ENVIRONMENT === 'production' ? CACHE_EXPIRATION : (60 * 1000))),
      environment: ENVIRONMENT
    });
  }
});
