/**
 * Service Worker Manager ESM - v1.9.0
 * https://github.com/aalfiann/swm
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

export class ServiceWorkerManager {
  static VERSION = '1.9.0';
  static initialized = false;
  static _lastOptions = null;

  static _handlers = {};
  static _batteryHandlers = {};
  static _deviceHandlers = {};

  static status = {
    fcm: false,
    gps: false,
    battery: false,
    network: false,
    device: false
  };

  static dispatchError(type, error) {
    window.dispatchEvent(new CustomEvent('serviceworker-error', {
      detail: {
        type,
        error: error.message || error,
        timestamp: new Date().toISOString()
      }
    }));
  }

  static getStatus() {
    return {
      version: this.VERSION,
      initialized: this.initialized,
      ...this.status,
      apiSupport: APISupport,
      serviceWorker: 'serviceWorker' in navigator,
      online: navigator.onLine,
      timestamp: new Date().toISOString()
    };
  }

  static async register(options = {}) {
    if (this.initialized) {
      console.warn('ServiceWorkerManager already initialized');
      return true;
    }

    this._lastOptions = options;

    const {
      // Service Worker path
      swPath = '/sw.js',
      scope = null,
      // Allow localhost for development
      allowLocalhost = false,
      // FCM options
      enableFCM = false,
      firebaseConfig = null,
      vapidKey = null,
      onFCMTokenReceived = null,
      // GPS options
      enableGPS = false,
      onLocationReceived = null,
      // Battery options
      enableBattery = false,
      onBatteryStatus = null,
      // Network monitoring options
      enableNetworkMonitoring = false,
      onNetworkChange = null,
      // Device monitoring options
      enableDeviceMonitoring = false,
      onDeviceInfoChange = null
    } = options;

    if (!('serviceWorker' in navigator)) {
      console.log('Service Workers not supported');
      return false;
    }

    let refreshing = false;

    // Handle updates when app reopens
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

    // Check for updates when app becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        navigator.serviceWorker.ready.then(registration => {
          registration.update();
        }).catch(error => {
          this.dispatchError('update', error);
        });
      }
    });

    try {
      const host = window.location.hostname;
      const isLocalhost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        host.startsWith('172.16.');

      if (!isLocalhost || allowLocalhost) {
        // Add FCM config to global scope if enabled
        if (enableFCM && firebaseConfig) {
          window.fcmConfig = firebaseConfig;
        }

        // Initialize GPS if enabled
        if (enableGPS) {
          try {
            const permission = await this.requestGPSPermission();
            console.log('GPS permission status:', permission);

            if (permission === 'granted') {
              const location = await this.getCurrentPosition();
              if (typeof onLocationReceived === 'function') {
                try {
                  onLocationReceived(location);
                } catch (error) {
                  this.dispatchError('location-callback', error);
                }
              }
            } else {
              console.log('GPS permission not granted');
              // Try fallback immediately if permission denied
              const fallbackLocation = await APIFallbacks.getLocationFallback();
              if (fallbackLocation && typeof onLocationReceived === 'function') {
                this.status.gps = true;
                onLocationReceived(fallbackLocation);
              }
            }
          } catch (error) {
            this.dispatchError('gps-init', error);
            // Try fallback
            const fallbackLocation = await APIFallbacks.getLocationFallback();
            if (fallbackLocation && typeof onLocationReceived === 'function') {
              this.status.gps = true;
              onLocationReceived(fallbackLocation);
            }
          }
        }

        // Initialize Battery monitoring if enabled
        if (enableBattery) {
          await this.initializeBatteryMonitoring(onBatteryStatus);
        }

        // Enhanced Network detection with detailed information
        if (enableNetworkMonitoring) {
          this.initializeNetworkMonitoring(onNetworkChange);
        }

        // Initialize device monitoring if enabled
        if (enableDeviceMonitoring) {
          try {
            this.initializeDeviceMonitoring(onDeviceInfoChange);
          } catch (error) {
            this.dispatchError('device-monitoring', error);
          }
        }

        const registrationOptions = scope && { scope };
        const registration = await navigator.serviceWorker.register(swPath, registrationOptions);
        console.log('ServiceWorker registered');

        // Handle FCM if enabled
        if (enableFCM && firebaseConfig && vapidKey) {
          try {
            this.status.fcm = false;

            const permission = await Notification.requestPermission();
            if (permission === 'granted') {

              const app = initializeApp(firebaseConfig);
              const messaging = getMessaging(app);


              // Get FCM token using Firebase Messaging
              const token = await getToken(messaging, {
                serviceWorkerRegistration: registration,
                vapidKey: vapidKey
              });

              if (typeof onFCMTokenReceived === 'function') {
                try {
                  onFCMTokenReceived(token);
                } catch (error) {
                  this.dispatchError('fcm-callback', error);
                }
              }

              this.status.fcm = true;
            }
          } catch (fcmError) {
            this.dispatchError('fcm-init', fcmError);
          }
        }

        registration.update();
        this.initialized = true;
        return true;
      } else {
        console.log('ServiceWorker not registered (localhost)');
        return false;
      }
    } catch (error) {
      this.dispatchError('registration', error);
      console.error('ServiceWorker registration failed:', error);
      return false;
    }
  }

  // GPS methods
  static async requestGPSPermission() {
    if (!('geolocation' in navigator)) {
      return 'denied';
    }

    // Try to get current position to trigger prompt
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });
      return 'granted';
    } catch (error) {
      return error.code === 1 ? 'denied' : 'prompt';
    }
  }

  static async getCurrentPosition() {
    try {
      this.status.gps = false;

      if (!('geolocation' in navigator)) {
        const fallbackLocation = await APIFallbacks.getLocationFallback();
        if (fallbackLocation) {
          this.status.gps = true;
          window.dispatchEvent(new CustomEvent('location-changed', {
            detail: { ...fallbackLocation, isFallback: true }
          }));
          return fallbackLocation;
        }
        throw new Error('Geolocation not supported and fallback failed');
      }

      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const locationData = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              altitude: position.coords.altitude,
              altitudeAccuracy: position.coords.altitudeAccuracy,
              heading: position.coords.heading,
              speed: position.coords.speed,
              timestamp: position.timestamp,
              source: 'native'
            };

            window.dispatchEvent(new CustomEvent('location-changed', {
              detail: locationData
            }));

            this.status.gps = true;
            resolve(locationData);
          },
          async (error) => {
            this.dispatchError('gps-position', error);

            const fallbackLocation = await APIFallbacks.getLocationFallback();
            if (fallbackLocation) {
              this.status.gps = true;
              window.dispatchEvent(new CustomEvent('location-changed', {
                detail: { ...fallbackLocation, isFallback: true }
              }));
              resolve(fallbackLocation);
            } else {
              window.dispatchEvent(new CustomEvent('location-error', {
                detail: {
                  error: error.message,
                  code: error.code,
                  timestamp: new Date().toISOString()
                }
              }));
              reject(error);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          }
        );
      });
    } catch (error) {
      this.dispatchError('gps-general', error);

      // Try fallback one last time
      const fallbackLocation = await APIFallbacks.getLocationFallback();
      if (fallbackLocation) {
        this.status.gps = true;
        window.dispatchEvent(new CustomEvent('location-changed', {
          detail: { ...fallbackLocation, isFallback: true }
        }));
        return fallbackLocation;
      }

      throw error;
    }
  }

  // Add Battery monitoring methods
  static async initializeBatteryMonitoring(callback) {
    try {
      this.status.battery = false;

      if (!('getBattery' in navigator)) {
        console.log('Battery API not supported, using fallback');
        const fallbackData = APIFallbacks.getBatteryFallback();

        if (typeof callback === 'function') {
          try {
            callback(fallbackData);
          } catch (error) {
            this.dispatchError('battery-callback', error);
          }
        }

        window.dispatchEvent(new CustomEvent('battery-status-changed', {
          detail: { ...fallbackData, isFallback: true }
        }));

        return false;
      }

      const battery = await navigator.getBattery();
      window.batteryManager = battery; // Store for cleanup

      const handleBatteryChange = () => {
        const batteryData = {
          level: Math.round(battery.level * 100),
          charging: battery.charging,
          chargingTime: battery.chargingTime === Infinity ? null : battery.chargingTime,
          dischargingTime: battery.dischargingTime === Infinity ? null : battery.dischargingTime,
          timestamp: new Date().toISOString(),
          source: 'native'
        };

        window.dispatchEvent(new CustomEvent('battery-status-changed', {
          detail: batteryData
        }));

        if (typeof callback === 'function') {
          try {
            callback(batteryData);
          } catch (error) {
            this.dispatchError('battery-callback', error);
          }
        }
      };

      // Store handlers for cleanup
      this._batteryHandlers = {
        levelchange: handleBatteryChange,
        chargingchange: handleBatteryChange,
        chargingtimechange: handleBatteryChange,
        dischargingtimechange: handleBatteryChange
      };

      // Add listeners
      Object.entries(this._batteryHandlers).forEach(([event, handler]) => {
        battery.addEventListener(event, handler);
      });

      handleBatteryChange();
      this.status.battery = true;
      return true;
    } catch (error) {
      this.dispatchError('battery-init', error);
      return false;
    }
  }

  // Helper method to get current battery status
  static async getCurrentBatteryStatus() {
    if (!('getBattery' in navigator)) {
      return APIFallbacks.getBatteryFallback();
    }

    try {
      const battery = await navigator.getBattery();
      return {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime === Infinity ? null : battery.chargingTime,
        dischargingTime: battery.dischargingTime === Infinity ? null : battery.dischargingTime,
        timestamp: new Date().toISOString(),
        source: 'native'
      };
    } catch (error) {
      this.dispatchError('battery-status', error);
      return APIFallbacks.getBatteryFallback();
    }
  }

  // Add Network Information methods
  static async initializeNetworkMonitoring(callback) {
    try {
      this.status.network = false;
      const connection = navigator.connection ||
                        navigator.mozConnection ||
                        navigator.webkitConnection;

      const safeCallback = (info) => {
        if (typeof callback === 'function') {
          try {
            callback(info);
          } catch (error) {
            this.dispatchError('network-callback', error);
          }
        }
      };

      // Store handlers for cleanup
      this._handlers.online = () => {
        const info = this.getCurrentNetworkInfo();
        window.dispatchEvent(new CustomEvent('network-status-changed', {
          detail: {
            online: true,
            timestamp: new Date().toISOString(),
            connectionInfo: info
          }
        }));
        safeCallback(info);
      };

      this._handlers.offline = () => {
        const info = this.getCurrentNetworkInfo();
        window.dispatchEvent(new CustomEvent('network-status-changed', {
          detail: {
            online: false,
            timestamp: new Date().toISOString(),
            connectionInfo: info
          }
        }));
        safeCallback(info);
      };

      // Add listeners
      window.addEventListener('online', this._handlers.online);
      window.addEventListener('offline', this._handlers.offline);

      if (connection) {
        this._handlers.connectionchange = () => {
          const info = this.getCurrentNetworkInfo();
          window.dispatchEvent(new CustomEvent('network-info-changed', {
            detail: info
          }));
          safeCallback(info);
        };

        connection.addEventListener('change', this._handlers.connectionchange);
      }

      // Initial network status
      const initialInfo = this.getCurrentNetworkInfo();
      safeCallback(initialInfo);

      this.status.network = true;
      return true;
    } catch (error) {
      this.dispatchError('network-init', error);
      return false;
    }
  }

  // Helper method to get current network info
  static getCurrentNetworkInfo() {
    const connection = navigator.connection ||
                      navigator.mozConnection ||
                      navigator.webkitConnection;

    if (!connection) {
      return APIFallbacks.getNetworkFallback();
    }

    const info = {
      online: navigator.onLine,
      type: connection.effectiveType || null,
      downlink: connection.downlink || null,
      downlinkMax: connection.downlinkMax || null,
      rtt: connection.rtt || null,
      saveData: connection.saveData || false,
      timestamp: new Date().toISOString(),
      source: 'native'
    };

    info.quality = this.getConnectionQuality(info);
    return info;
  }

  // Helper method to determine connection quality
  static getConnectionQuality(info) {
    if (!info.online) return 'offline';

    if (info.type) {
      switch (info.type) {
        case '4g':
          return info.downlink >= 5 ? 'excellent' : 'good';
        case '3g':
          return 'fair';
        case '2g':
        case 'slow-2g':
          return 'poor';
        default:
          return 'unknown';
      }
    }

    if (info.downlink) {
      if (info.downlink >= 5) return 'excellent';
      if (info.downlink >= 2) return 'good';
      if (info.downlink >= 0.5) return 'fair';
      return 'poor';
    }

    return 'unknown';
  }

  // Helper method to check if connection is metered
  static isConnectionMetered() {
    const connection = navigator.connection ||
                      navigator.mozConnection ||
                      navigator.webkitConnection;

    return connection ? connection.saveData : null;
  }

  // Helper method to get recommended quality for media
  static getRecommendedQuality() {
    const info = this.getCurrentNetworkInfo();

    switch (info.quality) {
      case 'excellent':
        return {
          video: 'high',
          maxHeight: 1080,
          maxBitrate: 4000000
        };
      case 'good':
        return {
          video: 'medium',
          maxHeight: 720,
          maxBitrate: 2500000
        };
      case 'fair':
        return {
          video: 'low',
          maxHeight: 480,
          maxBitrate: 1000000
        };
      case 'poor':
        return {
          video: 'lowest',
          maxHeight: 360,
          maxBitrate: 500000
        };
      default:
        return {
          video: 'auto',
          maxHeight: 480,
          maxBitrate: 1000000
        };
    }
  }

  // Add Device Info
  static getDeviceInfo() {
    try {
      const userAgent = navigator.userAgent;

      const ua = {
        mobile: /Mobile|Android|iP(hone|od|ad)/i.test(userAgent),
        tablet: /(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(userAgent)
      };

      const info = {
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight,
          colorDepth: window.screen.colorDepth || 'unknown',
          pixelDepth: window.screen.pixelDepth || 'unknown',
          orientation: (window.screen.orientation && window.screen.orientation.type) || 'unknown',
          dpr: window.devicePixelRatio || 1
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          pageZoom: Math.round((window.outerWidth / window.innerWidth) * 100) / 100
        },
        device: {
          type: ua.mobile ? 'mobile' : ua.tablet ? 'tablet' : 'desktop',
          memory: navigator.deviceMemory || 'unknown',
          processors: navigator.hardwareConcurrency || 'unknown',
          touchPoints: navigator.maxTouchPoints || 0,
          language: navigator.language,
          languages: navigator.languages || [navigator.language],
          devicePixelRatio: window.devicePixelRatio,
          prefersDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches
        },
        userAgent,
        timestamp: new Date().toISOString()
      };
      return info;
    } catch (error) {
      this.dispatchError('device-info', error);
      return null;
    }
  }

  static initializeDeviceMonitoring(callback) {
    try {
      this.status.device = false;

      // Handle resize events
      const handleResize = () => {
        const deviceInfo = this.getDeviceInfo();

        window.dispatchEvent(new CustomEvent('device-info-changed', {
          detail: deviceInfo
        }));

        if (typeof callback === 'function') {
          try {
            callback(deviceInfo);
          } catch (error) {
            this.dispatchError('device-callback', error);
          }
        }
      };

      // Handle orientation changes
      const handleOrientationChange = () => {
        const deviceInfo = this.getDeviceInfo();

        window.dispatchEvent(new CustomEvent('device-orientation-changed', {
          detail: deviceInfo
        }));

        if (typeof callback === 'function') {
          try {
            callback(deviceInfo);
          } catch (error) {
            this.dispatchError('device-orientation-callback', error);
          }
        }
      };

      // Store handlers for cleanup
      this._deviceHandlers = {
        resize: handleResize,
        orientationchange: handleOrientationChange
      };

      // Add listeners
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleOrientationChange);

      // Initial device info
      handleResize();

      this.status.device = true;
      return true;
    } catch (error) {
      this.dispatchError('device-init', error);
      return false;
    }
  }

  // App Badge API
  static async setAppBadge(count) {
    try {
      if (!APISupport.appBadge) {
        console.log('App Badge API not supported');
        return false;
      }

      if (typeof count !== 'number' || count < 0) {
        console.warn('Invalid badge count. Must be a non-negative number.');
        return false;
      }

      await navigator.setAppBadge(count);
      return true;
    } catch (error) {
      this.dispatchError('set-badge', error);
      return false;
    }
  }

  static async clearAppBadge() {
    try {
      if (!APISupport.appBadge) {
        console.log('App Badge API not supported');
        return false;
      }

      await navigator.clearAppBadge();
      return true;
    } catch (error) {
      this.dispatchError('clear-badge', error);
      return false;
    }
  }

  static async reset() {
    if (!this.initialized) {
      return false;
    }
    await this.cleanup();
    this.initialized = false;
    return this._lastOptions ? this.register(this._lastOptions) : false;
  }

  static async cleanup() {
    try {
      // Clear event handlers
      if (this._handlers) {
        Object.entries(this._handlers).forEach(([event, handler]) => {
          window.removeEventListener(event, handler);
          if (navigator.connection) {
            navigator.connection.removeEventListener(event, handler);
          }
        });
        this._handlers = {};
      }

      // Clear GPS watch
      if (window.gpsWatchId) {
        navigator.geolocation.clearWatch(window.gpsWatchId);
        window.gpsWatchId = null;
      }

      // Clear battery listeners
      if (window.batteryManager && this._batteryHandlers) {
        Object.entries(this._batteryHandlers).forEach(([event, handler]) => {
          window.batteryManager.removeEventListener(event, handler);
        });
        window.batteryManager = null;
        this._batteryHandlers = {};
      }

      // Clean up device handlers
      if (this._deviceHandlers) {
        Object.entries(this._deviceHandlers).forEach(([event, handler]) => {
          window.removeEventListener(event, handler);
        });
        this._deviceHandlers = {};
      }

      // Reset status
      Object.keys(this.status).forEach(key => {
        this.status[key] = false;
      });

      // Clear global configs
      window.fcmConfig = null;

      console.log('ServiceWorkerManager cleaned up successfully');
      return true;
    } catch (error) {
      this.dispatchError('cleanup', error);
      return false;
    }
  }

  static async getSWConfig() {
    const fallbackResult = {
      version: 'unknown',
      cacheName: 'unknown',
      cacheExpiration: 0
    };

    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) {
      this.dispatchError('sw-config', 'ServiceWorker not active');
      return fallbackResult;
    }

    return new Promise((resolve) => {
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        this.dispatchError('sw-config', 'Request timed out');
        resolve(fallbackResult);
      }, 3000);

      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };

      try {
        navigator.serviceWorker.controller.postMessage(
          { type: 'GET_SW_CONFIG' },
          [channel.port2]
        );
      } catch (error) {
        clearTimeout(timeout);
        this.dispatchError('sw-config', error);
        resolve(fallbackResult);
      }
    });
  }
}

export class APIFallbacks {
  static async getLocationFallback() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch('https://ipapi.co/json/', {
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        accuracy: 1000,
        timestamp: new Date().toISOString(),
        source: 'ip-fallback'
      };
    } catch (error) {
      ServiceWorkerManager.dispatchError('location-fallback', error);
      return null;
    }
  }

  static getBatteryFallback() {
    return {
      level: 100,
      charging: true,
      chargingTime: null,
      dischargingTime: null,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }

  static getNetworkFallback() {
    return {
      online: navigator.onLine,
      type: 'unknown',
      quality: 'unknown',
      downlink: null,
      rtt: null,
      saveData: false,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }
}

export const APISupport = {
  geolocation: 'geolocation' in navigator,
  battery: 'getBattery' in navigator,
  network: !!(navigator.connection || navigator.mozConnection || navigator.webkitConnection),
  notification: 'Notification' in window,
  serviceWorker: 'serviceWorker' in navigator,
  pushManager: 'PushManager' in window,
  appBadge: 'setAppBadge' in navigator
};
