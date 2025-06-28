# SWM
Service Worker + Manager  

A `modular`, `scalable` and `production-ready` Service Worker + Manager.  


The purpose of this project is to simplify using Service Worker for any websites with the use of PWA. If you need more advanced features you can go with [workbox](https://github.com/GoogleChrome/workbox), but for me, I don't use it because the features is too bloated and the code size very large than this project.


## Service Worker Features
- [x] Modular and Scalable
- [x] Offline functionality
- [x] Performance optimization
- [x] Cache version control
- [x] Pattern-based caching
- [x] Excluded URLs from cache (support wildcard)
- [x] Multiple Cache Strategy
- [x] Automatic and Scheduled cache cleanup
- [x] Handles silent auto-updates
- [x] Development flexibility
- [x] Includes fallback and error handling

## Service Worker Manager Features
- [x] Support Push Message FCM
- [x] Support GPS Location
- [x] Support Battery Monitoring
- [x] Support Network Monitoring
- [x] Support Device Info Screen Monitoring
- [x] Helper functionality

## PWA Features
- [x] Offline Support
- [x] Edge Side Panel
- [x] Custom shortcuts
- [x] Display Override
- [x] Best practice manifest.json
- [x] Custom SplashScreen with ProgressBar for All Devices
- [x] PWA Assets Generator 

Note:  
- To keep size always minimal, only common device APIs were implemented.
- You're able to use this Service Worker Manager for PWA or non PWA websites.
- Service Worker is modular, you're able to use `sw.js` only without `swm.js`.
- Service Worker Manager is also modular, you're able to use `swm.js` only without `sw.js`.


### Configuration
This project is already included with `sw.js` and `sw.min.js`. I have already create the default configuration, but yes you have to adjust it to your website.

Note:  
- If you don't set swPath, then it will use `sw.js` as default.
- If you don't want to use our `sw.js`, yes you can use your own sw.js.


Here is the example using SWM with your own Service Worker
```js
  ServiceWorkerManager.register({
    swPath: '/your-sw.js', // or '/sw.min.js' for using minified
    scope: '/'
  });
```

## Multiple Strategy
Our sw.js has already support to use multiple strategy and you can setup it by regex pattern.

| Strategy | Fast Respons? | Fresh Data? | Best for |
|----------|---------------|-------------|-------------|
| cache-first | ✅ | ❌ | Static assets (CSS, JS, images) |
| network-first | ❌ | ✅ | HTML, dynamic content |
| stale-while-revalidate | ✅ | ✅ (slow) | Blog, article, PWA |
| network-only | ❌ | ✅ | Beacon, tracking, login |
| cache-only | ✅ | ❌ | Offline app, game |

Example cache pattern-based  
```js
const cachePatterns = [
  {
    // PWA assets
    pattern: /^\/pwa\/.+\.(png|jpg|jpeg|webp)$/,
    strategy: 'cache-first'
  },
  {
    // Cloudflare insights
    pattern: /^https:\/\/static\.cloudflareinsights\.com\//,
    strategy: 'network-only'
  },
  {
    // Default Homepage
    pattern: /^\/$/,
    strategy: 'network-first'
  },
  {
    // Matches all other requests
    pattern: /^\/.*$/,
    strategy: 'stale-while-revalidate'
  }  
];
```

### Simple Usage with Generator
1. Clone this project
```bash
git clone https://github.com/aalfiann/swm.git mypwaproject && rm -rf mypwaproject/.git
```
2. Go to mypwaproject directory
3. Install Dependencies
```bash
npm ci
```
4. Replace icon at `src/icon-512x512.png` with yours
5. Modify `src/manifest.json`. (don't add "icons", coz its generated automatically)
6. Modify `sw.js`, look at CONFIGURATION area.
7. Generate it
```bash
npm run generator
```
8. Result is at `output` directory.

Note: 
- Just copy the `pwa-assets`, `sw.js` and `swm.js` to the public directory.
- Copy parts of head meta/link and script tag in `index.html` to your index page website.


### Manual Usage
1. Just put `sw.js`, `swm.js` and `manifest.json` in root or public directories.

2. Create `<script>` tags on layout or home page of your website.
```html
<script src="/swm.js"></script>
<script>
  // must wrapped in try-catch block to prevent old browser error
  try {
    // 1. Basic usage without any additional features
    ServiceWorkerManager.register();
  
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch(err) {
    console.log(err);
  }
</script>
```

3. Create new directory name pwa inside public directory.  
Then put all icon assets for manifest PWA in there.

4. For PWA support, just add `<link>` tags for `icons` and `manifest` on all pages of your website.
```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/pwa/icon-180x180.png">
```

5. For PWA project, you're required to create a file named `assetlinks.json`  
and place it at `.well-known/assetlinks.json` in your website's root directory.  
Please see [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started) for more information.

6. Done.

### Testing Service Worker
1. Preparation  
If you're using Linux environment, you can use `NodeJS`.
```bash
npm ci
```

2. Just go to this project then run this command
```bash
npm run dev
```

3. Default will use port 8080.  
Now you can go to [http://localhost:8080/test/test-basic.html](http://localhost:8080/test/test-basic.html).  

Check the `Console` or `Application` in DevTools browser to see what happening.


### Helper Methods
- `ServiceWorkerManager.getStatus();`
- `async ServiceWorkerManager.getCurrentPosition();`
- `async ServiceWorkerManager.getCurrentBatteryStatus();`
- `ServiceWorkerManager.getCurrentNetworkInfo();`
- `ServiceWorkerManager.isConnectionMetered();`
- `ServiceWorkerManager.getRecommendedQuality();`
- `ServiceWorkerManager.getDeviceInfo();`
- `async ServiceWorkerManager.setAppBadge(count);`
- `async ServiceWorkerManager.clearAppBadge();`
- `async ServiceWorkerManager.reset();`
- `async ServiceWorkerManager.cleanup();`
- `async ServiceWorkerManager.getSWConfig();`
- `async ServiceWorkerManager.getSWCleanupStatus();`
- `APISupport;`


### Advanced Usage

1. Using ESM
```html
<script type="module">
  import { ServiceWorkerManager, APISupport } from '/swm.esm.js';

  ServiceWorkerManager.register();

  // service worker error listener
  window.addEventListener('serviceworker-error', function (e) {
    console.log(e.detail);
  });
  
  // check API support
  document.addEventListener('DOMContentLoaded', function() {
    console.log('API Support:', APISupport);
  });
</script>
```

2. Using TypeScript  
First, install Firebase and its types:
```bash
npm install firebase
npm install --save-dev @types/firebase
# or
yarn add firebase
yarn add -D @types/firebase
```

Then you can use it like this
```js
import { ServiceWorkerManager } from '/swm.ts';

ServiceWorkerManager.register();

// service worker error listener
window.addEventListener('serviceworker-error', function (e) {
  console.log(e.detail);
});
```

### Example Usage
1. Setup FCM
```html
<script>
  try {
    ServiceWorkerManager.register({
      allowLocalhost: true,
      enableFCM: true,
      firebaseConfig: {
        apiKey: "your-api-key",
        authDomain: "your-auth-domain",
        projectId: "your-project-id",
        messagingSenderId: "your-sender-id",
        appId: "your-app-id"
      },
      vapidKey: 'your-vapid-key',
      onFCMTokenReceived: (token) => {
        console.log('FCM Token:', token);
      }
    });
    
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch (err) {
    console.log(err);
  }
</script>
```

2. Setup GPS Location
```html
<script>
  try {
    ServiceWorkerManager.register({
      allowLocalhost: false, // gps only work in https secure context
      enableGPS: true,
      onLocationReceived: (location) => {
        console.log('Location:', location);
      }
    });
    
    window.addEventListener('location-changed', function (e) {
      console.log(e.detail);
    });
    
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch (err) {
    console.log(err);
  }
</script>
```

3. Setup Battery Monitoring
```html
<script>
  try {
    ServiceWorkerManager.register({
      allowLocalhost: true,
      enableBattery: true,
      onBatteryStatus: (status) => {
        console.log('Battery:', status);
      }
    });
    
    window.addEventListener('battery-status-changed', function (e) {
      console.log(e.detail);
    });
    
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch (err) {
    console.log(err);
  }
</script>
```

4. Setup Network Monitoring
```html
<script>
  try {
    ServiceWorkerManager.register({
      allowLocalhost: true,
      enableNetworkMonitoring: true,
      onNetworkChange: (status) => {
        console.log('Network:', status);
      }
    });
    
    window.addEventListener('network-info-changed', function (e) {
      console.log(e.detail);
    });
    
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch (err) {
    console.log(err);
  }
</script>
```

5. Setup Device Screen Monitoring
```html
<script>
  try {
    ServiceWorkerManager.register({
      allowLocalhost: true,
      enableDeviceMonitoring: true,
      onDeviceInfoChange: (deviceInfo) => {
        console.log('Device info changed:', deviceInfo);
      }
    });
    
    window.addEventListener('device-orientation-changed', function (e) {
      console.log(e.detail);
    });
    
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch (err) {
    console.log(err);
  }
</script>
```

6. Setup Enable All Features
```html
<script>
  try {
    ServiceWorkerManager.register({
      allowLocalhost: true,
      enableGPS: true,
      enableBattery: true,
      enableNetworkMonitoring: true,
      enableDeviceMonitoring: true,
      enableFCM: true,
      firebaseConfig: {
        apiKey: "your-api-key",
        authDomain: "your-auth-domain",
        projectId: "your-project-id",
        messagingSenderId: "your-sender-id",
        appId: "your-app-id"
      },
      vapidKey: 'your-vapid-key',
      onFCMTokenReceived: (token) => {
        console.log('FCM Token:', token);
      },
      onDeviceInfoChange: (deviceInfo) => {
        console.log('Device info changed:', deviceInfo);
      },
      onLocationReceived: (location) => {
        console.log('Location:', location);
      },
      onBatteryStatus: (status) => {
        console.log('Battery:', status);
      },
      onNetworkChange: (status) => {
        console.log('Network:', status);
      }
    });
    
    window.addEventListener('location-changed', function (e) {
      console.log(e.detail);
    });
    
    window.addEventListener('battery-status-changed', function (e) {
      console.log(e.detail);
    });
    
    window.addEventListener('network-info-changed', function (e) {
      console.log(e.detail);
    });
    
    window.addEventListener('device-orientation-changed', function (e) {
      console.log(e.detail);
    });
    
    // service worker error listener
    window.addEventListener('serviceworker-error', function (e) {
      console.log(e.detail);
    });
  } catch (err) {
    console.log(err);
  }
</script>
```
