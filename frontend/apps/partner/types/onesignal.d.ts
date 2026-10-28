interface OneSignalUserPushSubscription {
  id?: string | null;
  token?: string | null;
  optedIn?: boolean;
  addEventListener(event: string, listener: (event: unknown) => void): void;
  removeEventListener(event: string, listener: (event: unknown) => void): void;
  optIn(): Promise<void>;
  optOut(): Promise<void>;
}

interface OneSignalUser {
  onesignalId?: string | null;
  externalId?: string | null;
  addTag(key: string, value: string): Promise<void>;
  addTags(tags: Record<string, string>): Promise<void>;
  removeTag(key: string): Promise<void>;
  removeTags(keys: string[]): Promise<void>;
  PushSubscription: OneSignalUserPushSubscription;
}

interface OneSignalNotifications {
  permission: boolean;
  permissionNative: NotificationPermission;
  getPermissionStatus?(): NotificationPermission | boolean;
  requestPermission(): Promise<boolean>;
  addEventListener(event: string, listener: (event: unknown) => void): void;
  removeEventListener(event: string, listener: (event: unknown) => void): void;
}


interface OneSignalSlidedown {
  promptPush(options?: { force?: boolean }): Promise<void>;
}

export interface IOneSignal {
  init(options: {
    appId: string;
    allowLocalhostAsSecureOrigin?: boolean;
    serviceWorkerPath?: string;
    serviceWorkerParam?: { scope: string };
    [key: string]: unknown;
  }): Promise<void>;
  login(externalId: string): Promise<void>;
  logout(): Promise<void>;
  User: OneSignalUser;
  Notifications: OneSignalNotifications;
  Slidedown: OneSignalSlidedown;
}

declare global {
  interface Window {
    OneSignalDeferred?: Array<(OneSignal: IOneSignal) => void | Promise<void>>;
    OneSignal?: IOneSignal;
  }
}
