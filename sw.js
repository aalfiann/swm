//-----------------------
// CONFIGURATION
//-----------------------
// This version is used to invalidate the cache when the service worker is updated
const VERSION = '1.0.0'; // Update this version directly when making changes on website
// Cache name format: site-name-v1.0.0
const CACHE_NAME = `site-name-v${VERSION}`; // Change 'site-name' to your actual site name
// Cache expiration will keep the cache until the specified time
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours
// Cache cleanup will clean up all caches older than CACHE_EXPIRATION
const CACHE_CLEANUP_ENABLED = true;  // If your site is small (below 10 pages), better set this to false.
const CACHE_CLEANUP_INTERVAL = 8 * 60 * 60 * 1000 // 8 hours
// Environment variable to control cache expiration
// Set to 'development' for shorter cache expiration (1 minute) and 'production' will use CACHE_EXPIRATION.
const ENVIRONMENT = 'production'; // Change to 'development' or 'production'.
// Debugging flag to enable/disable console logs
const DEBUG = false; // Set to false in production

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
  {
    // Cloudflare Insights
    pattern: /^https:\/\/static\.cloudflareinsights\.com\//,
    strategy: 'network-only'
  },
  {
    // WordPress admin and login pages - use network-only to avoid caching sensitive data
    pattern: /^\/(wp-login\.php|wp-admin)/,
    strategy: 'network-only'
  },
  {
    // Auth pages - use network-only to avoid caching sensitive data
    pattern: /^\/(login|logout|register|sso)(\/?$|\/.+|\?.*$)/,
    strategy: 'network-only'
  },

  // Add more patterns as needed here
  // ...

  // Don't remove this below, it will be used as a fallback
  // -----------------
  // Default Homepage, if your website is news or blog, you can use network-first
  // to always get the latest content, but if your website is a web app or static,
  // its better to use stale-while-revalidate to get the latest content but still use the cached
  {
    pattern: /^\/$/, // Default Homepage
    strategy: 'network-first' // use 'network-first' or 'stale-while-revalidate'
  },
  // Default Fallback if no another pattern matches, use strategy based on environment
  {
    pattern: /^\/.+/, // Matches all other requests
    strategy: (ENVIRONMENT === 'production' ? 'stale-while-revalidate' : 'network-first')
  }
];

// Excluded URLs from cache
const excludedFromCache = [
  '/login*',
  '/logout*',
  '/register*',
  '/wp-login*',
  '/wp-admin*',
  '*wp-json*',
  '*xmlrpc.php*',
  '/oauth*',
  '*authorize*',
  '*token*',
  '*callback*',
  '*code=*',
  '*state=*',
  '*oauth_token=*',
  '/auth*',
  '*redirect_uri=*',
  '*csrf*',
  '*token=*'
];

//-----------------------
// Service Worker
//-----------------------
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

function formatLocalTime(date) {
  if (!date) return 'Never';
  const d = new Date(date);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function msToHumanReadable (ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'}`;
  if (hours > 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  if (minutes > 0) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
  return 'less than a minute';
}

// Inlined idb-keyval library
const idbKeyval = (() => {
  const dbName = 'sw-store';
  const storeName = 'sw-cache-cleanup';
  let store;

  const getStore = () => {
    if (!store) store = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = e => {
        e.target.result.createObjectStore(storeName);
      };
    });
    return store;
  };

  return {
    async get(key) {
      const db = await getStore();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },
    async set(key, value) {
      const db = await getStore();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const request = tx.objectStore(storeName).put(value, key);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve();
      });
    }
  };
})();

async function shouldRunCleanup() {
  if(CACHE_CLEANUP_ENABLED === false) {
    return false;
  }

  try {
    const last = await idbKeyval.get('sw-last-cleanup');
    const now = Date.now();
    const installedAt = await idbKeyval.get('sw-installed-at') || now;

    // Delay before cleanup after installation
    if (now - installedAt < 6e5) return false;

    // Cleanup if last cleanup was more than CACHE_CLEANUP_INTERVAL
    return !last || (now - last > CACHE_CLEANUP_INTERVAL);
  } catch (e) {
    logError('[cache-cleanup] Error:', e);
    return false;
  }
}

async function cleanUpExpiredCache() {
  try {
    log('[cache-cleanup] Starting cleanup process.');
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();

    if (requests.length === 0) {
      log('[cache-cleanup] No cache to clean.');
      self._cleanupScheduled = false;
      return;
    }

    const now = Date.now();
    let deletedCount = 0;

    const deletionTasks = requests.map(async (request) => {
      try {
        const response = await cache.match(request);
        if (!response) return;

        const cachedAt = response.headers.get('cached-at');
        if (!cachedAt) return;

        const cachedTime = new Date(cachedAt).getTime();
        if (now - cachedTime > CACHE_EXPIRATION) {
          const success = await cache.delete(request);
          if (success) deletedCount++;
        }
      } catch (err) {
        logError('[cache-cleanup] Error processing request:', request.url, err);
      }
    });

    await Promise.allSettled(deletionTasks);
    log(`[cache-cleanup] Finished. Deleted ${deletedCount} expired item(s).`);
  } catch (err) {
    logError('[cache-cleanup] Failed to clean cache:', err);
  } finally {
    self._cleanupScheduled = false;
  }
}

function pathMatchesPattern(path, patterns) {
  return patterns.some(pattern => {
    // Escape regex chars, convert * become .*
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return regex.test(path);
  });
}

function shouldExcludeFromCache(url) {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const full = urlObj.pathname + urlObj.search;

    return pathMatchesPattern(path, excludedFromCache) ||
           pathMatchesPattern(full, excludedFromCache);
  } catch (e) {
    logError('[shouldExcludeFromCache] Error parsing URL:', url);
    return false;
  }
}

// Helper function to check if URL matches any pattern
function matchesPattern(url) {
  if (shouldExcludeFromCache(url)) {
    log('[matchesPattern] Excluded from cache:', url);
    return null;
  }

  try {
    const urlObj = new URL(url);
    const full = urlObj.toString();
    const path = urlObj.pathname;
    return cachePatterns.find(({ pattern }) => pattern.test(full) || pattern.test(path));
  } catch (error) {
    logError('[check-pattern] Error matching pattern:', error);
    return false;
  }
}

// Install event with error handling
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME)
        .then(async (cache) => {
          log('[install] Cache opened');
          const cachingTasks = urlsToCache.map(async (url) => {
            try {
              await cache.add(url);
              log('[install] Cached:', url);
            } catch (error) {
              logError('[install] Failed to cache:', url, error);
            }
          });
          await Promise.allSettled(cachingTasks);
        }),
      idbKeyval.set('sw-installed-at', Date.now())
    ]).catch(error => {
      logError('[install] Installation failed:', error);
    })
  );
  self.skipWaiting();
});

// Fetch event with improved error handling
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(handleFetch(event));
});

async function handleFetch(event) {
  const url = event.request.url;
  const matchedPattern = matchesPattern(url);

  // Trigger auto cleanup asynchronously
  if (!self._cleanupScheduled && await shouldRunCleanup()) {
    self._cleanupScheduled = true;
    try {
      await idbKeyval.set('sw-last-cleanup', Date.now());
    } catch (e) {
      logError('[cache-cleanup] Set IDB error:', e);
    }
    setTimeout(() => {
      cleanUpExpiredCache();
    }, 3e4);
  }

  const strategy = matchedPattern?.strategy || (urlsToCache.includes(new URL(url).pathname) ? 'cache-first' : null);

  if (!strategy) {
    return fetch(event.request).catch(error => {
      logError('[handle-fetch] Fetch error:', error);
      throw error;
    });
  }

  if (strategy === 'cache-only') {
    const cached = await caches.match(event.request);
    if (cached) {
      log('[cache-only] Serving from cache:', event.request.url);
      return cached;
    }

    logError('[cache-only] Not found in cache:', event.request.url);
    return new Response('Resource not available offline.', {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  if (strategy === 'network-only') {
    return fetch(event.request).catch(error => {
      logError('[network-only] Fetch failed:', error, event.request.url);
      return new Response('', { status: 204, statusText: 'No Content' });
    });
  }

  if (strategy === 'network-first') {
    return fetch(event.request)
      .then(async (response) => {
        if (response.type === 'opaque') {
          logError('[network-first] Opaque response encountered:', event.request.url);
          return response;
        }

        if (response.ok && event.request.url.startsWith('http')) {
          if (response.redirected) {
            log('[network-first] Skipping cache for redirected response:', event.request.url);
            return response;
          }

          if (response.headers.get('Cache-Control')?.includes('no-store')) {
            log('[network-first] Skipping cache due to Cache-Control: no-store:', event.request.url);
            return response;
          }

          const rawBody = await response.clone().arrayBuffer();
          const headers = new Headers(response.headers);
          headers.set('cached-at', new Date().toISOString());

          const responseToStore = new Response(rawBody, {
            status: response.status,
            statusText: response.statusText,
            headers
          });

          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, responseToStore);
          } catch (err) {
            logError('[network-first] Cache put error:', err);
          }
        } else {
          log('[network-first] Skipping cache.put for non-http(s) request:', event.request.url);
        }

        return response;
      })
      .catch(async (error) => {
        logError('[network-first] Fetch failed:', error, event.request.url);
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        throw error;
      });
  }

  if (strategy === 'stale-while-revalidate') {
    const cachedResponse = await caches.match(event.request);

    const fetchPromise = fetch(event.request)
      .then(async (networkResponse) => {
        if (networkResponse.type === 'opaque') {
          logError('[stale-while-revalidate] Opaque response encountered:', event.request.url);
          return networkResponse;
        }

        if (!networkResponse.ok) {
          logError('[stale-while-revalidate] Network response not OK:', networkResponse.status);
          if (cachedResponse) return cachedResponse;
          return networkResponse;
        }

        if (networkResponse.ok && event.request.url.startsWith('http')) {
          if (networkResponse.redirected) {
            log('[stale-while-revalidate] Skipping cache for redirected response:', event.request.url);
            return networkResponse;
          }

          if (networkResponse.headers.get('Cache-Control')?.includes('no-store')) {
            log('[stale-while-revalidate] Skipping cache due to Cache-Control: no-store:', event.request.url);
            return networkResponse;
          }

          const clonedResponse = networkResponse.clone();
          const headers = new Headers(clonedResponse.headers);
          headers.set('cached-at', new Date().toISOString());

          const responseToStore = new Response(clonedResponse.body, {
            status: clonedResponse.status,
            statusText: clonedResponse.statusText,
            headers
          });

          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, responseToStore);
          } catch (err) {
            logError('[stale-while-revalidate] Cache put error:', err);
          }
        } else {
          log('[stale-while-revalidate] Skipping cache.put for non-http(s) request:', event.request.url);
        }

        return networkResponse;
      })
      .catch(error => {
        logError('[stale-while-revalidate] Fetching failed:', error);
        if (cachedResponse) return cachedResponse;
        throw error;
      });

    return cachedResponse || fetchPromise;
  }

  // Default: cache-first
  const cachedResponse = await caches.match(event.request);
  if (cachedResponse) {
    const cachedAt = cachedResponse.headers.get('cached-at');
    if (cachedAt) {
      const age = Date.now() - new Date(cachedAt).getTime();
      const expiration = ENVIRONMENT === 'production' ? CACHE_EXPIRATION : 60 * 1000;
      if (age < expiration) {
        return cachedResponse;
      }
    }
  }

  try {
    const response = await fetch(event.request.clone(), {
      credentials: 'same-origin',
      mode: 'cors'
    });

    if (response.type === 'opaque') {
      logError('[cache-first] Opaque response encountered:', event.request.url);
      return response;
    }

    if (!response.ok) {
      if (cachedResponse) return cachedResponse;
      return response;
    }

    if (response.ok && event.request.url.startsWith('http')) {
      if (response.redirected) {
        log('[cache-first] Skipping cache for redirected response:', event.request.url);
        return response;
      }

      if (response.headers.get('Cache-Control')?.includes('no-store')) {
        log('[cache-first] Skipping cache due to Cache-Control: no-store:', event.request.url);
        return response;
      }

      const newHeaders = new Headers(response.headers);
      newHeaders.set('cached-at', new Date().toISOString());

      const responseToStore = new Response(response.clone().body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(event.request, responseToStore);
      } catch (cacheError) {
        logError('[cache-first] Cache put error:', cacheError);
      }
    } else {
      log('[cache-first] Skipping cache.put for non-http(s) request:', event.request.url);
    }

    return response;
  } catch (error) {
    logError('[cache-first] Fetching failed:', error);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

// Activate event with improved cleanup
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              log('[activate] Deleting old cache:', cacheName);
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
        logError('[activate] Cache cleanup failed:', error);
      })
  );
});

// Handle push messages in the background
self.addEventListener("push", event => {
  if (!event.data) {
    log("[push] Push event received but no data available.");
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (e) {
    logError("[push] Error parsing push data:", e);
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
    }).catch(error => logError("[notificationclick] Error handling notification click:", error))
  );
});

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  switch (event.data.type) {
    case 'GET_SW_CONFIG':
      await handleGetSWConfig(event);
      break;
    case 'GET_SW_CLEANUP_STATUS':
      await handleGetSWCleanupStatus(event);
      break;
  }
});

// Handler for GET_SW_CONFIG
async function handleGetSWConfig(event) {
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({
      version: VERSION,
      environment: ENVIRONMENT,
      debug: DEBUG,
      cacheName: CACHE_NAME,
      cacheExpiration: msToHumanReadable(
        ENVIRONMENT === 'production' ? CACHE_EXPIRATION : (60 * 1000)
      ),
      cacheCleanupEnabled: CACHE_CLEANUP_ENABLED,
      cacheCleanupInterval: msToHumanReadable(CACHE_CLEANUP_INTERVAL),
    });
  }
}

// Handler for GET_SW_CLEANUP_STATUS
async function handleGetSWCleanupStatus(event) {
  if (!CACHE_CLEANUP_ENABLED || !event.ports || !event.ports[0]) return;

  const now = Date.now();
  const last = await idbKeyval.get('sw-last-cleanup');
  const installedAt = await idbKeyval.get('sw-installed-at') || now;

  const cacheCleanupStats = {
    lastCleanup: formatLocalTime(last),
    installedAt: formatLocalTime(installedAt),
    now: formatLocalTime(now),
    timeSinceInstall: now - installedAt,
    timeSinceLastCleanup: now - (last || 0),
    nextCleanup: formatLocalTime((last || now) + CACHE_CLEANUP_INTERVAL),
  };

  event.ports[0].postMessage(cacheCleanupStats);
}
