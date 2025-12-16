# Universal Service Worker (Production Ready)

This Service Worker is designed as a **universal caching system**.
It supports **static sites, dynamic websites, blogs, and web apps**, depending on how the configuration is defined.

The primary goals are:

* Performance
* Security
* Full control
* Debuggability
* High-traffic safety

---

## 1. Design Philosophy

This Service Worker **does not assume the website is static**.

Core principles:

* **Static assets → cache-first**
* **HTML / dynamic pages → stale-while-revalidate**
* **Auth, admin, sensitive pages → network-only**
* **Cross-origin opaque responses → strictly controlled**

Nothing is cached implicitly — **all behavior is configuration-driven**.

---

## 2. Cache Structure & Versioning

### Cache Naming

```js
CACHE_NAME        = site-name-v{VERSION}
OPAQUE_CACHE_NAME = site-name-opaque-v{VERSION}
OPAQUE_QUEUE_KEY  = opaque-queue-{VERSION}
```

### Purpose

* Bumping `VERSION` **invalidates all old caches**
* Opaque cache is **always refreshed on version change**
* No stale cache survives across deployments

### Lifecycle

* `activate` event deletes all old caches using `CACHE_PREFIX`
* Old IndexedDB opaque queues are also removed

---

## 3. Cache Strategies

### Cache-First

Used for:

* CSS
* JavaScript
* Fonts
* Images
* Build assets (`_astro`, `pwa`, etc.)

Behavior:

1. Serve cached response if still fresh
2. If expired → fetch from network
3. If **same-origin and ETag exists** → background revalidation
4. **Cross-origin or no ETag → skip revalidation**

Goals:

* Maximum performance
* Reduced bandwidth
* Safe behavior

---

### Stale-While-Revalidate (SWR)

Used for:

* HTML pages
* Dynamic content
* Homepage
* Semi-dynamic content

Behavior:

1. Serve cache immediately (if available)
2. Fetch from network in the background
3. If network succeeds → update cache
4. If network fails → fallback to cache

Safety rules:

* `Cache-Control: no-store` → never cached
* Redirect responses → never cached
* Opaque responses → handled separately

Recommended for:

* Blogs
* News websites
* Universal sites
* Offline-tolerant pages

---

### Network-Only

Used for:

* Login / logout
* Admin pages
* Authentication flows
* APIs
* Sensitive endpoints

Behavior:

* Always fetch from network
* No cache fallback (intentional)

---

## 4. ETag Revalidation (Cache-First)

ETag is used **only when it is safe and reliable**.

Rules:

* ✅ Same-origin only
* ✅ Cached response has ETag
* ❌ Cross-origin → skipped
* ❌ No ETag → skipped

Reasons:

* Many cross-origin responses do not expose ETag via CORS
* Conditional requests may silently fail
* Skipping is safer than incorrect validation

ETag revalidation is intended for:

* Internal assets
* App shell files
* Versioned resources

---

## 5. Opaque Cache (Cross-Origin Assets)

Opaque responses are **never cached blindly**.

### Conditions to Cache Opaque Responses

* Host must be listed in `ALLOW_CDN_HOSTS`
* Only static assets:

  ```
  fonts, images, css, js
  ```
* Not a document / HTML
* GET requests only

### Additional Safeguards

* FIFO entry limit (`MAX_OPAQUE_ENTRIES`)
* Queue stored in IndexedDB
* Queue & cache cleared when version changes

### Opaque & Offline

* Suitable for fonts and CDN assets
* Not suitable for HTML or APIs
* Used to stabilize third-party assets

---

## 6. Automatic Cache Cleanup

### Behavior

* Cleanup does **not** run on every request
* Throttled and interval-based
* Safe under high traffic

### Trigger Conditions

* Post-install delay
* Cleanup interval exceeded

### What Gets Cleaned

* Main cache entries based on `cached-at`
* Opaque queue compaction
* FIFO enforcement for opaque cache

Cleanup runs **asynchronously and non-blocking**.

---

## 7. IndexedDB Usage

IndexedDB is used to store:

* `sw-installed-at`
* `sw-last-cleanup`
* `opaque-queue-{VERSION}`

Notes:

* All transactions handle error and abort states
* No hanging promises or silent failures

---

## 8. Debugging & Observability

### Logging

* `log()` → enabled only when `DEBUG = true`
* `logError()` → always enabled, capped at 50 logs

This ensures:

* Critical errors remain visible in production
* Console is not flooded

---

## 9. Push Notification Support

Features:

* Compatible with FCM and standard Web Push
* Supports absolute and relative URLs
* Focuses existing tab when possible
* Opens new window when necessary

Push handling is isolated from cache logic.

---

## 10. What This Service Worker Intentionally Does NOT Do

By design:

* ❌ Cache APIs
* ❌ Cache authentication pages
* ❌ Cache opaque documents
* ❌ Use ETag for cross-origin requests
* ❌ Force offline HTML fallback pages

These are **explicit design decisions**, not limitations.

---

## 11. Production Readiness Criteria

This Service Worker is safe for production when:

* `cachePatterns` are correctly defined
* Sensitive routes use `network-only`
* Opaque hosts are strictly allow-listed
* `VERSION` is bumped on meaningful deployments

---

## 12. Pre-Deployment Checklist

* [ ] `VERSION` updated
* [ ] `ALLOW_CDN_HOSTS` reviewed
* [ ] `excludedFromCache` verified
* [ ] `CACHE_CLEANUP_INTERVAL` tuned for traffic
* [ ] `DEBUG = false`
* [ ] Offline & slow-network tested in DevTools

---

## 13. Final Summary

* **Cache-first → fast & reliable**
* **SWR → ideal for dynamic pages**
* **Opaque caching → controlled & bounded**
* **Cleanup → efficient & scalable**
* **Versioning → deterministic behavior**

This is not a template Service Worker —
it is a **smart cache system**.

---
