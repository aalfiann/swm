/**
 * Service Worker Manager TS - v1.4.1
 * https://github.com/aalfiann/swm
 */
import { FirebaseApp, initializeApp, FirebaseOptions } from "firebase/app";
import { Messaging, getMessaging, getToken } from "firebase/messaging";

// Type definitions
export interface ServiceWorkerManagerOptions {
  allowLocalhost?: boolean;
  enableFCM?: boolean;
  firebaseConfig?: FirebaseOptions;
  vapidKey?: string;
  onFCMTokenReceived?: (token: string) => void;
  enableGPS?: boolean;
  onLocationReceived?: (location: LocationData) => void;
  enableBattery?: boolean;
  onBatteryStatus?: (status: BatteryData) => void;
  enableNetworkMonitoring?: boolean;
  onNetworkChange?: (info: NetworkInfo) => void;
  enableDeviceMonitoring?: boolean;
  onDeviceInfoChange?: ((info: DeviceInfo | null) => void) | undefined;
}

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
  source: string;
  isFallback?: boolean;
}

export interface BatteryData {
  level: number;
  charging: boolean;
  chargingTime: number | null;
  dischargingTime: number | null;
  timestamp: string;
  source: string;
  isFallback?: boolean;
}

export interface NetworkInfo {
  online: boolean;
  type: string | null;
  quality?: string;
  downlink: number | null;
  downlinkMax?: number | null;
  rtt: number | null;
  saveData: boolean;
  timestamp: string;
  source: string;
}

export interface ScreenInfo {
  width: number;
  height: number;
  availWidth: number;
  availHeight: number;
  colorDepth: number | string;
  pixelDepth: number | string;
  orientation: string;
  dpr: number;
}

export interface ViewportInfo {
  width: number;
  height: number;
  pageZoom: number;
}

export interface DeviceInfo {
  screen: ScreenInfo;
  viewport: ViewportInfo;
  device: {
    type: 'mobile' | 'tablet' | 'desktop';
    memory: number | 'unknown';
    processors: number | string;
    touchPoints: number;
    language: string;
    languages: readonly string[];
    devicePixelRatio: number;
    prefersDarkMode: boolean;
  };
  userAgent: string;
  timestamp: string;
}

export interface ServiceWorkerStatus {
  version: string;
  initialized: boolean;
  fcm: boolean;
  gps: boolean;
  battery: boolean;
  network: boolean;
  device: boolean;
  apiSupport: typeof APISupport;
  serviceWorker: boolean;
  online: boolean;
  timestamp: string;
}

export interface SWConfig {
  version: string;
  cacheName: string;
  cacheExpiration: number;
}

export interface ErrorDetail {
  type: string;
  error: string;
  timestamp: string;
}

// Add missing Navigator interfaces
declare global {
  interface Navigator {
    deviceMemory?: number;
    connection?: {
      effectiveType?: string;
      downlink?: number;
      downlinkMax?: number;
      rtt?: number;
      saveData?: boolean;
      addEventListener: (type: string, listener: EventListener) => void;
      removeEventListener: (type: string, listener: EventListener) => void;
    };
    mozConnection?: Navigator['connection'];
    webkitConnection?: Navigator['connection'];
    getBattery?: () => Promise<{
      level: number;
      charging: boolean;
      chargingTime: number;
      dischargingTime: number;
      addEventListener: (type: string, listener: EventListener) => void;
      removeEventListener: (type: string, listener: EventListener) => void;
    }>;
    setAppBadge?: (count: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  }

  interface Window {
    fcmConfig?: FirebaseOptions;
    gpsWatchId?: number;
    batteryManager?: any;
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
} as const;

export class APIFallbacks {
  static async getLocationFallback(): Promise<LocationData | null> {
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
        accuracy: 1000, // Default accuracy for IP-based location
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        timestamp: Date.now(),
        source: 'ip-fallback'
      };
    } catch (error) {
      ServiceWorkerManager.dispatchError('location-fallback', error as Error);
      return null;
    }
  }

  static getBatteryFallback(): BatteryData {
    return {
      level: 100,
      charging: true,
      chargingTime: null,
      dischargingTime: null,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }

  static getNetworkFallback(): NetworkInfo {
    return {
      online: navigator.onLine,
      type: 'unknown',
      quality: 'unknown',
      downlink: null,
      downlinkMax: null,
      rtt: null,
      saveData: false,
      timestamp: new Date().toISOString(),
      source: 'fallback'
    };
  }
}

export class ServiceWorkerManager {
  static VERSION: string = '1.4.1';
  static initialized: boolean = false;
  static _lastOptions: ServiceWorkerManagerOptions | null = null;

  static _handlers: Record<string, EventListener> = {};
  static _batteryHandlers: Record<string, EventListener> = {};
  static _deviceHandlers: Record<string, EventListener> = {};

  static status = {
    fcm: false,
    gps: false,
    battery: false,
    network: false,
    device: false
  };

  static dispatchError(type: string, error: Error | string): void {
    window.dispatchEvent(new CustomEvent<ErrorDetail>('serviceworker-error', {
      detail: {
        type,
        error: error instanceof Error ? error.message : error,
        timestamp: new Date().toISOString()
      }
    }));
  }

  static getStatus(): ServiceWorkerStatus {
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

  static async register(options: ServiceWorkerManagerOptions = {}): Promise<boolean> {
    if (this.initialized) {
      console.warn('ServiceWorkerManager already initialized');
      return true;
    }

    this._lastOptions = options;

    const {
      allowLocalhost = false,
      enableFCM = false,
      firebaseConfig = null,
      vapidKey = null,
      onFCMTokenReceived = null,
      enableGPS = false,
      onLocationReceived = null,
      enableBattery = false,
      onBatteryStatus = null,
      enableNetworkMonitoring = false,
      onNetworkChange = null,
      enableDeviceMonitoring = false,
      onDeviceInfoChange = null
    } = options;

    if (!('serviceWorker' in navigator)) {
      console.log('Service Workers not supported');
      return false;
    }

    let refreshing = false;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });

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
        if (enableFCM && firebaseConfig) {
          window.fcmConfig = firebaseConfig;
        }

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
                  this.dispatchError('location-callback', error as Error);
                }
              }
            } else {
              console.log('GPS permission not granted');
              const fallbackLocation = await APIFallbacks.getLocationFallback();
              if (fallbackLocation && typeof onLocationReceived === 'function') {
                this.status.gps = true;
                onLocationReceived(fallbackLocation);
              }
            }
          } catch (error) {
            this.dispatchError('gps-init', error as Error);
            const fallbackLocation = await APIFallbacks.getLocationFallback();
            if (fallbackLocation && typeof onLocationReceived === 'function') {
              this.status.gps = true;
              onLocationReceived(fallbackLocation);
            }
          }
        }

        if (enableBattery) {
          await this.initializeBatteryMonitoring(onBatteryStatus);
        }

        if (enableNetworkMonitoring) {
          this.initializeNetworkMonitoring(onNetworkChange);
        }

        if (enableDeviceMonitoring) {
          try {
            this.initializeDeviceMonitoring(onDeviceInfoChange);
          } catch (error) {
            this.dispatchError('device-monitoring', error as Error);
          }
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('ServiceWorker registered');

        if (enableFCM && firebaseConfig && vapidKey) {
          try {
            this.status.fcm = false;

            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              const app = initializeApp(firebaseConfig);
              const messaging = getMessaging(app);

              const token = await getToken(messaging, {
                serviceWorkerRegistration: registration,
                vapidKey: vapidKey
              });

              if (typeof onFCMTokenReceived === 'function') {
                try {
                  onFCMTokenReceived(token);
                } catch (error) {
                  this.dispatchError('fcm-callback', error as Error);
                }
              }

              this.status.fcm = true;
            }
          } catch (fcmError) {
            this.dispatchError('fcm-init', fcmError as Error);
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
      this.dispatchError('registration', error as Error);
      console.error('ServiceWorker registration failed:', error);
      return false;
    }
  }

  static async requestGPSPermission(): Promise<PermissionState> {
    if (!('geolocation' in navigator)) {
      return 'denied';
    }

    try {
      await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        });
      });
      return 'granted';
    } catch (error) {
      return (error as GeolocationPositionError).code === 1 ? 'denied' : 'prompt';
    }
  }

  static async getCurrentPosition(): Promise<LocationData> {
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
            const locationData: LocationData = {
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
          async (error: GeolocationPositionError) => {
            const standardError = new Error(error.message || 'Geolocation error');
            this.dispatchError('gps-position', standardError);

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
                  error: error.message || 'Unknown error',
                  code: error.code,
                  timestamp: new Date().toISOString()
                }
              }));
              reject(standardError);
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
      const standardError = error instanceof Error ? error : new Error(String(error));
      this.dispatchError('gps-general', standardError);

      const fallbackLocation = await APIFallbacks.getLocationFallback();
      if (fallbackLocation) {
        this.status.gps = true;
        window.dispatchEvent(new CustomEvent('location-changed', {
          detail: { ...fallbackLocation, isFallback: true }
        }));
        return fallbackLocation;
      }

      throw standardError;
    }
  }

  static async initializeBatteryMonitoring(
    callback?: ((status: BatteryData) => void) | null | undefined): Promise<boolean> {
    try {
      this.status.battery = false;

      if (!('getBattery' in navigator)) {
        console.log('Battery API not supported, using fallback');
        const fallbackData = APIFallbacks.getBatteryFallback();

        if (typeof callback === 'function') {
          try {
            callback(fallbackData);
          } catch (error) {
            this.dispatchError('battery-callback', error as Error);
          }
        }

        window.dispatchEvent(new CustomEvent('battery-status-changed', {
          detail: { ...fallbackData, isFallback: true }
        }));

        return false;
      }

      const battery = await navigator.getBattery!();
      window.batteryManager = battery;

      const handleBatteryChange = () => {
        const batteryData: BatteryData = {
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
            this.dispatchError('battery-callback', error as Error);
          }
        }
      };

      this._batteryHandlers = {
        levelchange: handleBatteryChange,
        chargingchange: handleBatteryChange,
        chargingtimechange: handleBatteryChange,
        dischargingtimechange: handleBatteryChange
      };

      Object.entries(this._batteryHandlers).forEach(([event, handler]) => {
        battery.addEventListener(event, handler);
      });

      handleBatteryChange();
      this.status.battery = true;
      return true;
    } catch (error) {
      this.dispatchError('battery-init', error as Error);
      return false;
    }
  }

  static async getCurrentBatteryStatus(): Promise<BatteryData> {
    if (!('getBattery' in navigator)) {
      return APIFallbacks.getBatteryFallback();
    }

    try {
      const battery = await navigator.getBattery!();
      return {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
        chargingTime: battery.chargingTime === Infinity ? null : battery.chargingTime,
        dischargingTime: battery.dischargingTime === Infinity ? null : battery.dischargingTime,
        timestamp: new Date().toISOString(),
        source: 'native'
      };
    } catch (error) {
      this.dispatchError('battery-status', error as Error);
      return APIFallbacks.getBatteryFallback();
    }
  }

  static initializeNetworkMonitoring(
    callback?: ((info: NetworkInfo) => void) | null | undefined): Promise<boolean> {
    try {
      this.status.network = false;
      const connection = navigator.connection ||
                        navigator.mozConnection ||
                        navigator.webkitConnection;

      const safeCallback = (info: NetworkInfo) => {
        if (typeof callback === 'function') {
          try {
            callback(info);
          } catch (error) {
            this.dispatchError('network-callback', error as Error);
          }
        }
      };

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

      const initialInfo = this.getCurrentNetworkInfo();
      safeCallback(initialInfo);

      this.status.network = true;
      return Promise.resolve(true);
    } catch (error) {
      this.dispatchError('network-init', error as Error);
      return Promise.resolve(false);
    }
  }

  static getCurrentNetworkInfo(): NetworkInfo {
    const connection = navigator.connection ||
                      navigator.mozConnection ||
                      navigator.webkitConnection;

    if (!connection) {
      return APIFallbacks.getNetworkFallback();
    }

    const info: NetworkInfo = {
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

  static getConnectionQuality(info: NetworkInfo): string {
    if (!info.online) return 'offline';

    if (info.type) {
      switch (info.type) {
        case '4g':
          return info.downlink! >= 5 ? 'excellent' : 'good';
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

  static isConnectionMetered(): boolean | null | undefined {
    const connection = navigator.connection ||
                      navigator.mozConnection ||
                      navigator.webkitConnection;

    return connection ? connection.saveData : null;
  }

  static getRecommendedQuality(): {
    video: string;
    maxHeight: number;
    maxBitrate: number;
  } {
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

  static getDeviceInfo(): DeviceInfo | null {
    try {
      const userAgent = navigator.userAgent;

      const ua = {
        mobile: /Mobile|Android|iP(hone|od|ad)/i.test(userAgent),
        tablet: /(tablet|ipad|playbook|silk)|(android(?!.*mobile))/i.test(userAgent)
      };

      const info: DeviceInfo = {
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
      this.dispatchError('device-info', error as Error);
      return null;
    }
  }

  static initializeDeviceMonitoring(
    callback?: ((info: DeviceInfo | null) => void) | undefined | null
  ): boolean {
    try {
      this.status.device = false;

      const handleResize = () => {
        const deviceInfo = this.getDeviceInfo();

        window.dispatchEvent(new CustomEvent('device-info-changed', {
          detail: deviceInfo
        }));

        if (typeof callback === 'function') {
          try {
            callback(deviceInfo);
          } catch (error) {
            this.dispatchError('device-callback', error as Error);
          }
        }
      };

      const handleOrientationChange = () => {
        const deviceInfo = this.getDeviceInfo();

        window.dispatchEvent(new CustomEvent('device-orientation-changed', {
          detail: deviceInfo
        }));

        if (typeof callback === 'function') {
          try {
            callback(deviceInfo);
          } catch (error) {
            this.dispatchError('device-orientation-callback', error as Error);
          }
        }
      };

      this._deviceHandlers = {
        resize: handleResize,
        orientationchange: handleOrientationChange
      };

      window.addEventListener('resize', this._deviceHandlers.resize);
      window.addEventListener('orientationchange', this._deviceHandlers.orientationchange);

      handleResize();

      this.status.device = true;
      return true;
    } catch (error) {
      this.dispatchError('device-init', error as Error);
      return false;
    }
  }

  static async setAppBadge(count: number): Promise<boolean> {
    try {
      if (!APISupport.appBadge) {
        console.log('App Badge API not supported');
        return false;
      }

      if (typeof count !== 'number' || count < 0) {
        console.warn('Invalid badge count. Must be a non-negative number.');
        return false;
      }

      await navigator.setAppBadge!(count);
      return true;
    } catch (error) {
      this.dispatchError('set-badge', error as Error);
      return false;
    }
  }

  static async clearAppBadge(): Promise<boolean> {
    try {
      if (!APISupport.appBadge) {
        console.log('App Badge API not supported');
        return false;
      }

      await navigator.clearAppBadge!();
      return true;
    } catch (error) {
      this.dispatchError('clear-badge', error as Error);
      return false;
    }
  }

  static async reset(): Promise<boolean> {
    if (!this.initialized) {
      return false;
    }
    await this.cleanup();
    this.initialized = false;
    return this._lastOptions ? this.register(this._lastOptions) : false;
  }

  static async cleanup(): Promise<boolean> {
    try {
      if (this._handlers) {
        Object.entries(this._handlers).forEach(([event, handler]) => {
          window.removeEventListener(event, handler);
          if (navigator.connection) {
            navigator.connection.removeEventListener(event, handler);
          }
        });
        this._handlers = {};
      }

      if (window.gpsWatchId) {
        navigator.geolocation.clearWatch(window.gpsWatchId);
        window.gpsWatchId = undefined;
      }

      if (window.batteryManager && this._batteryHandlers) {
        Object.entries(this._batteryHandlers).forEach(([event, handler]) => {
          window.batteryManager.removeEventListener(event, handler);
        });
        window.batteryManager = undefined;
        this._batteryHandlers = {};
      }

      if (this._deviceHandlers) {
        Object.entries(this._deviceHandlers).forEach(([event, handler]) => {
          window.removeEventListener(event, handler);
        });
        this._deviceHandlers = {};
      }

      Object.keys(this.status).forEach(key => {
        this.status[key as keyof typeof this.status] = false;
      });

      window.fcmConfig = undefined;

      console.log('ServiceWorkerManager cleaned up successfully');
      return true;
    } catch (error) {
      this.dispatchError('cleanup', error as Error);
      return false;
    }
  }

  static async getSWConfig(): Promise<SWConfig> {
    const fallbackResult: SWConfig = {
      version: 'unknown',
      cacheName: 'unknown',
      cacheExpiration: 0
    };

    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      this.dispatchError('sw-config', 'ServiceWorker not active');
      return fallbackResult;
    }

    return new Promise<SWConfig>((resolve) => {
      const timeout = setTimeout(() => {
        this.dispatchError('sw-config', 'Request timed out');
        resolve(fallbackResult);
      }, 3000);

      const channel = new MessageChannel();

      channel.port1.onmessage = (event: MessageEvent) => {
        clearTimeout(timeout);
        resolve(event.data as SWConfig);
      };

      try {
        controller.postMessage(
          { type: 'GET_SW_CONFIG' },
          [channel.port2]
        );
      } catch (error) {
        clearTimeout(timeout);
        this.dispatchError('sw-config', error as Error);
        resolve(fallbackResult);
      }
    });
  }
}
