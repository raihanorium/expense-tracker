/**
 * Minimal typings for the parts of Google Identity Services we use.
 * Loaded at runtime from https://accounts.google.com/gsi/client
 */

export type TokenResponse = {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
};

export type TokenClient = {
  requestAccessToken: (overrides?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    /** The gapi loader, used only to pull in the Picker module. */
    gapi?: {
      load: (name: string, config: { callback: () => void; onerror?: () => void }) => void;
    };
    google?: {
      picker: typeof google.picker;
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }) => TokenClient;
          hasGrantedAllScopes: (response: TokenResponse, ...scopes: string[]) => boolean;
          revoke: (accessToken: string, done?: () => void) => void;
        };
      };
    };
  }
}
