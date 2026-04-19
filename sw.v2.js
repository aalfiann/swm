//-----------------------
// CONFIGURATION
//-----------------------
// This version is used to invalidate the cache when the service worker is updated
const VERSION = '1.0.0'; // Update this version directly when making changes on website
const CACHE_PREFIX = 'site-name'; // Change 'site-name' to your actual site name
const CACHE_NAME = `${CACHE_PREFIX}-v${VERSION}`;
const OPAQUE_CACHE_NAME = `${CACHE_PREFIX}-opaque-v${VERSION}`;
const OPAQUE_QUEUE_KEY = `opaque-queue-${VERSION}`;
const MAX_OPAQUE_ENTRIES = 50; // don't too high, storage browser only have 200MB space per origin
// Cache expiration will keep the cache until the specified time
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours
// Cache cleanup will clean up all caches older than CACHE_EXPIRATION
const CACHE_CLEANUP_ENABLED = true;  // If your site is small (below 20 pages), better set this to false
const CACHE_CLEANUP_INTERVAL = 8 * 60 * 60 * 1000 // 8 hours
// Allow-list for cross-origin CDN hosts whose opaque responses are safe to cache
// Hostname only (no protocol, no path)
const ALLOW_CDN_HOSTS = [
  'fonts.gstatic.com',
  'fonts.googleapis.com',
  // 'cdn.yourdomain.com',
  // 'static.yourdomain.com'
];
// Environment variable to control cache expiration
// Set to 'development' for shorter cache expiration (1 minute) and 'production' will use CACHE_EXPIRATION
const ENVIRONMENT = 'production'; // Change to 'development' or 'production'
// Debugging flag to enable/disable console logs
const DEBUG = false; // Set to false in production

// Files to cache explicitly
const urlsToCache = [
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
    strategy: 'network-first'
  }
];

// Excluded URLs from cache
const excludedFromCache = [
  '/api/*',
  '/sw.js*',
  '/sw.*.js*',
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
  '*token=*',
  '*static.cloudflareinsights.com*'
];

//-----------------------
// Service Worker
//-----------------------
function log(...args) {
  if (DEBUG) {
    console.log('[ServiceWorker]', ...args);
  }
}

let _errCount = 0;
function logError(...args) {
  if (_errCount++ < 50) console.error('[ServiceWorker Error]', ...args);
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
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);

        tx.objectStore(storeName).put(value, key);
      });
    },
    async keys() {
      const db = await getStore();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAllKeys();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result || []);
      });
    },
    async del(key) {
      const db = await getStore();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const req = tx.objectStore(storeName).delete(key);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }
  };
})();

async function getOpaqueQueue() {
  var q = await idbKeyval.get(OPAQUE_QUEUE_KEY);
  return Array.isArray(q) ? q : [];
}

async function setOpaqueQueue(q) {
  await idbKeyval.set(OPAQUE_QUEUE_KEY, q);
}

async function recordOpaqueUrl(url) {
  var q = await getOpaqueQueue();

  // dedupe
  for (var i = q.length - 1; i >= 0; i--) {
    if (q[i] === url) q.splice(i, 1);
  }
  q.push(url);

  await setOpaqueQueue(q);
}

async function compactOpaqueQueue() {
  try {
    var q = await getOpaqueQueue();
    if (!q.length) return;

    var cache = await caches.open(OPAQUE_CACHE_NAME);
    var kept = [];

    for (var i = 0; i < q.length; i++) {
      var res = await cache.match(q[i]);
      if (res) kept.push(q[i]);
    }

    await setOpaqueQueue(kept);
  } catch(e) {
    // ignore error
  }
}

async function enforceOpaqueLimit(maxEntries) {
  try {
    var q = await getOpaqueQueue();
    if (q.length <= maxEntries) return;

    var cache = await caches.open(OPAQUE_CACHE_NAME);

    while (q.length > maxEntries) {
      var oldest = q.shift();
      try {
        await cache.delete(oldest);
      } catch (e) {
        // ignore error
      }
    }

    await setOpaqueQueue(q);
  } catch(e) {
    // ignore error
  }
}

function deleteOldOpaqueQueues() {
  return idbKeyval.keys()
    .then(keys => {
      const oldKeys = keys.filter(k =>
        typeof k === 'string' &&
        k.startsWith('opaque-queue-') &&
        k !== OPAQUE_QUEUE_KEY
      );

      if (!oldKeys.length) {
        log('[activate] No old opaque queue keys to delete.');
        return;
      }

      log('[activate] Deleting old opaque queue keys:', oldKeys);
      return Promise.all(oldKeys.map(k => idbKeyval.del(k)));
    })
    .catch(err => {
      logError('[activate] Opaque queue IDB cleanup failed:', err);
    });
}

// Cross-origin detector + CORS-first fetch with fallback
function isCrossOrigin(url) {
  try {
    return new URL(url).origin !== self.location.origin;
  } catch {
    return false;
  }
}

async function matchFromCaches(request) {
  const cache = await caches.open(CACHE_NAME);

  // exact request
  let res = await cache.match(request);
  if (res) return res;

  // cross-origin: try the CORS-key variant (because you sometimes store with corsReq)
  if (isCrossOrigin(request.url)) {
    const corsKey = new Request(request.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: request.cache || 'default'
    });
    res = await cache.match(corsKey);
    if (res) return res;
  }

  // last resort in main cache: match by URL
  res = await cache.match(request.url);
  if (res) return res;

  // THEN check opaque cache
  const opaqueCache = await caches.open(OPAQUE_CACHE_NAME);

  // try exact request.url
  res = await opaqueCache.match(request.url);
  if (res) return res;

  // final global fallback
  return caches.match(request.url);
}


// Decide whether an opaque response is safe to cache
function shouldCacheOpaque(url) {
  try {
    const u = new URL(url);

    // Allow only specific CDN hosts
    const isAllowedHost = ALLOW_CDN_HOSTS.includes(u.hostname);

    // Allow common static asset extensions only
    const isStaticAsset =
      /\.(woff2?|ttf|otf|png|jpg|jpeg|webp|gif|svg|css|js)$/i.test(u.pathname);

    return isAllowedHost && isStaticAsset;
  } catch {
    return false;
  }
}

// Try CORS (no credentials) then fallback to original request
async function fetchWithCorsFallback(request) {
  // Only attempt the CORS trick for cross-origin requests
  if (!isCrossOrigin(request.url)) {
    return fetch(request);
  }

  // Try CORS first (many CDNs/fonts support this and then response is not opaque)
  try {
    // Use GET-only safety here (since your fetch handler only intercepts GET anyway).
    // Also, do not forward request.headers for cross-origin: it can introduce forbidden headers or
    // accidentally trigger preflight / be blocked in some browsers/CDNs.
    const corsReq = new Request(request.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: request.cache || 'default'
    });
    return await fetch(corsReq);
  } catch (e) {
    // Fallback to original (may become opaque but should still load)
    return fetch(request);
  }
}

// Like fetchWithCorsFallback, but also returns the actual Request used for fetching
async function fetchWithCorsFallbackKeyed(originalRequest) {
  if (!isCrossOrigin(originalRequest.url)) {
    const res = await fetch(originalRequest);
    return { request: originalRequest, response: res };
  }

  try {
    const corsReq = new Request(originalRequest.url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
      cache: originalRequest.cache || 'default'
    });
    const res = await fetch(corsReq);
    return { request: corsReq, response: res };
  } catch (e) {
    const res = await fetch(originalRequest);
    return { request: originalRequest, response: res };
  }
}


// Cache opaque response "as-is" so CDN assets become more stable
async function cacheOpaqueIfPossible(cacheKeyRequest, response) {
  try {
    if (cacheKeyRequest.destination === 'document') return;

    if (response && response.type === 'opaque' && shouldCacheOpaque(cacheKeyRequest.url)) {
      if (/\.(zip|rar|7z|mp4|mkv|webm)$/i.test(cacheKeyRequest.url)) {
        return; // skip potential big file
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > 2_000_000) {
        return; // skip big file (>2MB)
      }

      const cache = await caches.open(OPAQUE_CACHE_NAME);
      const key = cacheKeyRequest.url;
      await cache.put(key, response.clone());

      await recordOpaqueUrl(key);
      await enforceOpaqueLimit(MAX_OPAQUE_ENTRIES);

      log('[opaque-cache] Cached opaque:', key);
    }
  } catch (e) {
    logError('[opaque-cache] Failed caching opaque:', cacheKeyRequest && cacheKeyRequest.url, e);
  }
}


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
        if (!cachedAt) return; // opaque won't have cached-at, intentionally skipped

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
    await compactOpaqueQueue();
    await enforceOpaqueLimit(MAX_OPAQUE_ENTRIES);
    self._cleanupScheduled = false;
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
    const href = urlObj.href;

    return pathMatchesPattern(path, excludedFromCache) ||
           pathMatchesPattern(full, excludedFromCache) ||
           pathMatchesPattern(href, excludedFromCache);
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
    return cachePatterns.find(({ pattern }) => pattern.test(full) || pattern.test(path)) || null;
  } catch (error) {
    logError('[check-pattern] Error matching pattern:', error);
    return null;
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
              const req = new Request(url, {
                cache: 'reload',
                credentials: 'same-origin'
              });

              const res = await fetch(req);
              if (!res || !res.ok) return;

              const cacheControl = res.headers.get('Cache-Control');
              if (cacheControl && cacheControl.includes('no-store')) return;

              if (res.redirected) return;

              const headers = new Headers(res.headers);
              headers.set('cached-at', new Date().toISOString());

              const body = await res.clone().arrayBuffer();

              const stored = new Response(body, {
                status: res.status,
                statusText: res.statusText,
                headers
              });

              await cache.put(req, stored);
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

async function revalidateWithETag(request, cachedResponse) {
  try {
    // Skip if not HTTP request
    if (!request.url.startsWith('http')) return;

    // Skip cross origin
    if (isCrossOrigin(request.url)) {
      log('[revalidateWithETag] cross-origin skip:', request.url);
      return;
    }

    // Skip if cached response doesn't have ETag
    const cachedETag = cachedResponse.headers.get('ETag');
    if (!cachedETag) {
      log('[revalidateWithETag] No ETag in cache, skipping revalidation:', request.url);
      return;
    }

    // Save bandwidth: conditional request
    const headers = new Headers(request.headers);
    headers.set('If-None-Match', cachedETag);

    // Fetch fresh response, CORS-first with fallback
    const conditionalReq = new Request(request.url, {
      method: 'GET',
      headers,
      mode: request.mode,
      credentials: request.credentials,
      redirect: 'follow',
      cache: 'no-store' // will validate to origin, not disk cache browser
    });

    const { request: keyReq, response: freshResponse } =
      await fetchWithCorsFallbackKeyed(conditionalReq);

    // If opaque, we can't validate with ETag; optionally cache it and stop
    if (freshResponse && freshResponse.type === 'opaque') {
      await cacheOpaqueIfPossible(keyReq, freshResponse);
      return;
    }

    // 304 = Not Modified => save bandwidth (not download body)
    if (freshResponse.status === 304) {
      log('[revalidateWithETag] 304 Not Modified:', request.url);
      return;
    }

    // Skip if response not OK
    if (!freshResponse.ok) {
      log('[revalidateWithETag] Fresh response not OK:', freshResponse.status, request.url);
      return;
    }

    // Skip if redirected
    if (freshResponse.redirected) {
      log('[revalidateWithETag] Response redirected:', request.url);
      return;
    }

    // Skip if there is Cache-Control: no-store
    const cacheControl = freshResponse.headers.get('Cache-Control');
    if (cacheControl && cacheControl.includes('no-store')) {
      log('[revalidateWithETag] Cache-Control: no-store, skipping:', request.url);
      return;
    }

    // Update cache (only when changed)
    const buf = await freshResponse.clone().arrayBuffer();

    const newHeaders = new Headers(freshResponse.headers);
    newHeaders.set('cached-at', new Date().toISOString());

    const responseToStore = new Response(buf, {
      status: freshResponse.status,
      statusText: freshResponse.statusText,
      headers: newHeaders
    });

    const cache = await caches.open(CACHE_NAME);
    await cache.put(keyReq, responseToStore);

    log('[revalidateWithETag] Cache updated successfully:', request.url);
  } catch (error) {
    // Log error but don't throw (this is a background task)
    logError('[revalidateWithETag] Error:', error, request.url);
  }
}

async function handleFetch(event) {
  const url = event.request.url;
  const matchedPattern = matchesPattern(url);

  // Trigger auto cleanup asynchronously
  if (CACHE_CLEANUP_ENABLED) {
    var now = Date.now();
    var CHECK_EVERY = 5 * 60 * 1000;

    if (!self._cleanupScheduled && (!self._nextCleanupCheckAt || now >= self._nextCleanupCheckAt)) {
      self._cleanupScheduled = true;

      event.waitUntil((function () {
        return (async function () {
          try {
            var run = await shouldRunCleanup();

            // throttle check (high-traffic)
            self._nextCleanupCheckAt = Date.now() + CHECK_EVERY;

            if (!run) return;

            await idbKeyval.set('sw-last-cleanup', Date.now());
            await cleanUpExpiredCache();
          } catch (e) {
            logError('[cache-cleanup] Failed:', e);
          } finally {
            self._cleanupScheduled = false;
          }
        })();
      })());
    }
  }

  const strategy =
    (matchedPattern && matchedPattern.strategy) ||
    (urlsToCache.includes(new URL(url).pathname) ? 'cache-first' : null);

  if (!strategy) {
    return fetch(event.request).catch(error => {
      logError('[handle-fetch] Fetch error:', error);
      throw error;
    });
  }

  if (strategy === 'cache-only') {
    const cached = await matchFromCaches(event.request);

    if (cached) {
      log('[cache-only] Serving from cache:', event.request.url);
      return cached;
    }

    log('[cache-only] Not found in cache:', event.request.url);
    return new Response('Resource not available offline.', {
      status: 504,
      statusText: 'Gateway Timeout',
      headers: { 'Content-Type': 'text/plain' }
    });
  }

  if (strategy === 'network-only') {
    return fetch(event.request).catch(error => {
      logError('[network-only] Fetch failed:', error, event.request.url);
      throw error;
    });
  }

  if (strategy === 'network-first') {
    // Use CORS-first fallback for better CDN behavior
    return fetchWithCorsFallbackKeyed(event.request)
      .then(async ({ request: cacheKeyRequest, response }) => {
        if (response && response.type === 'opaque') {
          log('[network-first] Opaque response encountered:', event.request.url);
          await cacheOpaqueIfPossible(cacheKeyRequest, response);
          return response;
        }

        if (response.ok && event.request.url.startsWith('http')) {
          if (response.redirected) {
            log('[network-first] Skipping cache for redirected response:', event.request.url);
            return response;
          }

          if (response.headers.get('Cache-Control') && response.headers.get('Cache-Control').includes('no-store')) {
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
            await cache.put(cacheKeyRequest, responseToStore);
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
        const cachedResponse = await matchFromCaches(event.request);
        if (cachedResponse) return cachedResponse;
        throw error;
      });
  }

  if (strategy === 'stale-while-revalidate') {
    let cachedResponse = await matchFromCaches(event.request);

    // Use CORS-first fallback for better CDN behavior
    const fetchPromise = fetchWithCorsFallbackKeyed(event.request)
      .then(async ({ request: cacheKeyRequest, response: networkResponse }) => {
        if (networkResponse && networkResponse.type === 'opaque') {
          log('[stale-while-revalidate] Opaque response encountered:', event.request.url);
          await cacheOpaqueIfPossible(cacheKeyRequest, networkResponse);
          return networkResponse;
        }

        if (!networkResponse.ok) {
          log('[stale-while-revalidate] Network response not OK:', networkResponse.status);
          if (cachedResponse) return cachedResponse;
          return networkResponse;
        }

        if (networkResponse.ok && event.request.url.startsWith('http')) {
          if (networkResponse.redirected) {
            log('[stale-while-revalidate] Skipping cache for redirected response:', event.request.url);
            return networkResponse;
          }

          if (networkResponse.headers.get('Cache-Control') && networkResponse.headers.get('Cache-Control').includes('no-store')) {
            log('[stale-while-revalidate] Skipping cache due to Cache-Control: no-store:', event.request.url);
            return networkResponse;
          }

          if (networkResponse.status === 206) return networkResponse;

          const buf = await networkResponse.clone().arrayBuffer();

          const headers = new Headers(networkResponse.headers);
          headers.set('cached-at', new Date().toISOString());

          const responseToStore = new Response(buf, {
            status: networkResponse.status,
            statusText: networkResponse.statusText,
            headers
          });

          try {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(cacheKeyRequest, responseToStore);
          } catch (err) {
            logError('[stale-while-revalidate] Cache put error:', err);
          }
        } else {
          log('[stale-while-revalidate] Skipping cache.put for non-http(s) request:', event.request.url);
        }

        return networkResponse;
      })
      .catch(async (error) => {
        logError('[stale-while-revalidate] Fetching failed:', error);
        const cachedResponse = await matchFromCaches(event.request);
        if (cachedResponse) return cachedResponse;
        throw error;
      });

    return cachedResponse || fetchPromise;
  }

  // Default: cache-first
  const cachedResponse = await matchFromCaches(event.request);
  if (cachedResponse) {
    // If cache-first non opaque, then still revalidateWithEtag.
    if (cachedResponse.type !== 'opaque') {
      event.waitUntil(
        revalidateWithETag(event.request, cachedResponse)
          .catch(error => logError('[cache-first] Background revalidation failed:', error))
      );
    }

    // Still respect TTL if there is cached-at header
    const cachedAt = cachedResponse.headers.get('cached-at');
    if (cachedAt) {
      const age = Date.now() - new Date(cachedAt).getTime();
      const expiration = ENVIRONMENT === 'production' ? CACHE_EXPIRATION : 60 * 1000;

      // If still masih fresh => continue serve cache
      if (age < expiration) {
        return cachedResponse;
      }
      // If expired => continue to the network fetch
    } else {
      // If no cached-at (i.e opaque / old cache), just serve cache
      return cachedResponse;
    }
  }

  try {
    // Use CORS-first fallback instead of forcing mode/credentials
    const { request: cacheKeyRequest, response } = await fetchWithCorsFallbackKeyed(event.request);

    if (response && response.type === 'opaque') {
      log('[cache-first] Opaque response encountered:', event.request.url);
      await cacheOpaqueIfPossible(cacheKeyRequest, response);
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

      if (response.headers.get('Cache-Control') && response.headers.get('Cache-Control').includes('no-store')) {
        log('[cache-first] Skipping cache due to Cache-Control: no-store:', event.request.url);
        return response;
      }

      const buf = await response.clone().arrayBuffer();

      const newHeaders = new Headers(response.headers);
      newHeaders.set('cached-at', new Date().toISOString());

      const responseToStore = new Response(buf, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });

      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(cacheKeyRequest, responseToStore);
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

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        // Safer deletion list (no undefined values passed to Promise.all)
        const deletions = cacheNames
          .filter(cacheName => cacheName.startsWith(CACHE_PREFIX + '-') &&
            cacheName !== CACHE_NAME &&
            cacheName !== OPAQUE_CACHE_NAME)
          .map(cacheName => {
            log('[activate] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          });
        return Promise.all(deletions);
      })
      .then(() => deleteOldOpaqueQueues())
      .then(() => clients.claim())
      .catch(error => logError('[activate] Cache cleanup failed:', error))
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
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var raw = (event.notification && event.notification.data && event.notification.data.url) || '/';
  var target;
  try {
    target = new URL(raw, self.location.origin).href; // aman untuk full atau relative
  } catch (e) {
    target = self.location.origin + '/';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === target && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});

// Listen for messages from the main thread
self.addEventListener('message', function (event) {
  if (!event || !event.data || !event.data.type) return;

  switch (event.data.type) {
    case 'GET_SW_CONFIG':
      handleGetSWConfig(event);
      break;
    case 'GET_SW_CLEANUP_STATUS':
      handleGetSWCleanupStatus(event);
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
