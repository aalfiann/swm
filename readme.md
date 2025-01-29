# SWM
Service Worker Manager  
This project is to simplify using Service Worker for common PWA Project.

## SWM Basic Features
- [x] Offline First functionality
- [x] Performance optimization
- [x] Resource caching
- [x] Cache version control
- [x] Automatic cache cleanup
- [x] Handles silent auto-updates
- [x] Development flexibility
- [x] Includes fallback and error handling

## SWM Additional Features
- [x] Support Push Message FCM
- [x] Support GPS Location
- [x] Support Battery Monitoring
- [x] Support Network Monitoring
- [x] Helper functionality

## PWA Features
- [x] Best practice manifest.json
- [x] Custom SplashScreen with ProgressBar for All Devices

Note:  
- To keep size always minimal, only common device APIs were implemented.
- You're able to use this Service Worker Manager for websites non PWA.


### Usage
1. Just put `sw.js`, `swm.js` and `manifest.json` in root or public directories.

2. Create `<script>` tags on all pages of your website.
```html
<script src="/swm.js"></script>
<script>
  // 1. Basic usage without any additional features
  ServiceWorkerManager.register();

  // service worker error listener
  window.addEventListener('serviceworker-error', function (e) {
    console.log(e.detail);
  });
</script>
```

3. Create new directory name pwa inside public directory.  
Then put all icon assets for manifest PWA in there.

4. For PWA support, just add `<link>` tags for `icons` and `manifest` on all pages of your website.
```html
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/pwa/icon-180x180.png">
```

5. Done.

### Testing
1. Preparation  
If you're using Linux environment, you can use `NodeJS` and `http-server`.
```bash
npm install -g http-server
```
2. Just go this project then run this command
```bash
http-server
```
3. Default will use port 8080.  
Now you can go to [http://localhost:8080/test-basic.html](http://localhost:8080/test-basic.html).  

Check the `Console` or `Application` in DevTools browser to see what happening.


### Helper Methods
- `ServiceWorkerManager.getStatus();`
- `ServiceWorkerManager.getCurrentPosition();`
- `ServiceWorkerManager.getCurrentBatteryStatus();`
- `ServiceWorkerManager.getCurrentNetworkInfo();`
- `ServiceWorkerManager.getConnectionQuality();`
- `ServiceWorkerManager.isConnectionMetered();`
- `ServiceWorkerManager.getRecommendedQuality();`
- `ServiceWorkerManager.reset();`
- `ServiceWorkerManager.cleanup();`
- `APISupport;`


### Advanced Usage

1. Setup FCM
```html
<script>
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
</script>
```

2. Setup GPS Location
```html
<script>
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
</script>
```

3. Setup Battery Monitoring
```html
<script>
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
</script>
```

4. Setup Network Monitoring
```html
<script>
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
</script>
```

5. Setup All
```html
<script>
  ServiceWorkerManager.register({
    allowLocalhost: true,
    enableGPS: true,
    enableBattery: true,
    enableNetworkMonitoring: true,
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
  
  // service worker error listener
  window.addEventListener('serviceworker-error', function (e) {
    console.log(e.detail);
  });
</script>
```
