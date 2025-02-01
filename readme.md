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
- [x] Support Device Info Screen Monitoring
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
5. For PWA project, you might required to create a file named `assetlinks.json`  
and place it at `.well-known/assetlinks.json` in your website's root directory.

6. Done.

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
- `APISupport;`


### Advanced Usage

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
