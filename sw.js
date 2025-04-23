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
  '/',
  '/favicon.ico'
];

// Pattern matching rules
const cachePatterns = [
  {
    // PWA assets
    pattern: /^\/pwa\/.+\.(png|jpg|jpeg|webp)$/,
    strategy: 'cache-first'
  },
  {
    // Astro SSG assets if any (you can delete this if not using Astro)
    pattern: /^\/_astro\/.+\.(css|js|png|webp|jpg|jpeg|gif|svg|woff|woff2|eot|ttf|otf)$/,
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
  },

  // Add more patterns as needed here
  // ...

  // Don't remove this below, it will be used as a fallback
  // Fallback if no another pattern matches, use strategy based on environment
  {
    pattern: /^\/$/, // Default Homepage
    strategy: (ENVIRONMENT === 'production' ? 'stale-while-revalidate' : 'network-first')
  },
  {
    pattern: /^\/.*$/, // Matches all other requests
    strategy: (ENVIRONMENT === 'production' ? 'stale-while-revalidate' : 'network-first')
  }
];

async function cleanUpExpiredCache() {
  try {
    log('[Cache Cleanup] Starting cleanup process.');
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();

    if (requests.length === 0) {
      log('[Cache Cleanup] No cache to clean.');
      return;
    }

    const now = Date.now();
    const expiration = ENVIRONMENT === 'production' ? CACHE_EXPIRATION : 60 * 1000;
    let deletedCount = 0;

    const deletionTasks = requests.map(async (request) => {
      try {
        const response = await cache.match(request);
        if (!response) return;

        const cachedAt = response.headers.get('cached-at');
        if (!cachedAt) return;

        const cachedTime = new Date(cachedAt).getTime();
        if (now - cachedTime > expiration) {
          const success = await cache.delete(request);
          if (success) deletedCount++;
        }
      } catch (err) {
        logError('[Cache Cleanup] Error processing request:', request.url, err);
      }
    });

    await Promise.allSettled(deletionTasks);
    log(`[Cache Cleanup] Finished. Deleted ${deletedCount} expired item(s).`);
  } catch (err) {
    logError('[Cache Cleanup] Failed to clean cache:', err);
  }
}

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
      .then(async (cache) => {
        log('Cache opened');

        const cachingTasks = urlsToCache.map(async (url) => {
          try {
            await cache.add(url);
            log('Cached:', url);
          } catch (error) {
            logError('Failed to cache:', url, error);
          }
        });

        await Promise.allSettled(cachingTasks);
      })
      .catch(error => {
        logError('Cache installation failed:', error);
      })
  );

  self.skipWaiting();
});

// Fetch event with improved error handling
self.addEventListener('fetch', event => {
  // Only 0.5% request trigger cleanup
  if (Math.random() < 0.005) {
    cleanUpExpiredCache();
  }

  // Ignore non-GET requests
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const matchedPattern = matchesPattern(url);

  if (matchedPattern || urlsToCache.includes(new URL(url).pathname)) {
    const strategy = matchedPattern?.strategy || 'cache-first';

    if (strategy === 'network-first') {
      event.respondWith(
        fetch(event.request)
          .then(async (response) => {
            if (response.type === 'opaque') {
              // Handle opaque response, e.g., return it directly without caching
              logError('Opaque response encountered:', event.request.url);
              return response;
            }

            if (event.request.url.startsWith('http')) {
              const rawBody = await response.clone().arrayBuffer();
              const headers = new Headers(response.headers);
              headers.set('cached-at', new Date().toISOString());

              const responseToStore = new Response(rawBody, {
                status: response.status,
                statusText: response.statusText,
                headers
              });

              const cache = await caches.open(CACHE_NAME);

              try {
                await cache.put(event.request, responseToStore);
              } catch (cacheError) {
                logError('Cache put error:', cacheError);
              }
            } else {
              log('Skipping cache.put for non-http(s) request:', event.request.url);
            }

            return response;
          })
          .catch(async (error) => {
            logError('Network fetch failed:', error, event.request.url);
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) return cachedResponse;
            throw error; // Let browser handle the error
          })
      );
    } else if (strategy === 'stale-while-revalidate') {
      event.respondWith(
        caches.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request)
            .then(async networkResponse => {
              if (networkResponse.type === 'opaque') {
                logError('SWR: Opaque response encountered:', event.request.url);
                return networkResponse;
              }

              if (!networkResponse || !networkResponse.ok) {
                logError('SWR: Network response not OK:', networkResponse.status);
                if (cachedResponse) {
                  return cachedResponse;
                } else {
                  throw networkResponse; // Let browser handle the error
                }
              }

              if (event.request.url.startsWith('http')) {
                const clonedResponse = networkResponse.clone();
                const cache = await caches.open(CACHE_NAME);

                const headers = new Headers(clonedResponse.headers);
                headers.set('cached-at', new Date().toISOString());

                const responseToStore = new Response(clonedResponse.body, {
                  status: clonedResponse.status,
                  statusText: clonedResponse.statusText,
                  headers
                });

                try {
                  await cache.put(event.request, responseToStore);
                } catch (err) {
                  logError('SWR: Cache put error:', err);
                }
              } else {
                log('SWR: Skipping cache.put for non-http(s) request:', event.request.url);
              }

              return networkResponse;
            })
            .catch(error => {
              logError('SWR fetch failed:', error);
              if (cachedResponse) return cachedResponse;
              throw error; // Let browser handle the error
            });

          if (cachedResponse) {
            // Trigger revalidation in background, but still return cache
            fetchPromise.catch(() => {}); // suppress unhandled promise warning
            return cachedResponse;
          }
          return fetchPromise;
        })
      );
    } else {
      // Default cache-first
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

              if (response.type === 'opaque') {
                // Handle opaque response, e.g., return it directly without caching
                logError('Opaque response encountered:', event.request.url);
                return response;
              }

              if (!response || !response.ok) {
                return cachedResponse || response;
              }

              if (event.request.url.startsWith('http')) {
                const responseToCache = response.clone();
                const cache = await caches.open(CACHE_NAME);

                const newHeaders = new Headers(response.headers);
                newHeaders.append('cached-at', new Date().toISOString());

                const responseToStore = new Response(responseToCache.body, {
                  status: responseToCache.status,
                  statusText: responseToCache.statusText,
                  headers: newHeaders
                });

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
              if (cachedResponse) return cachedResponse;
              throw error; // Let browser handle the error
            }
          })
      );
    }
  } else {
    event.respondWith(
      fetch(event.request)
        .catch(error => {
          logError('Fetch error:', error);
          throw error; // Let browser handle the error
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

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({
        version: VERSION,
        cacheName: CACHE_NAME,
        cacheExpiration: msToHumanReadable((ENVIRONMENT === 'production' ? CACHE_EXPIRATION : (60 * 1000))),
        environment: ENVIRONMENT
      });
    }
  }
});
