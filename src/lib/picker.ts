const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "";
const APP_ID = process.env.NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER ?? "";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type PickedFolder = { id: string; name: string };

/** Config problems surface as a clear message rather than an opaque picker failure. */
export function pickerConfigError(): string | null {
  if (!API_KEY) return "NEXT_PUBLIC_GOOGLE_API_KEY is not set for this build.";
  if (!APP_ID) return "NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER is not set for this build.";
  return null;
}

let loader: Promise<void> | null = null;

/**
 * Loads the gapi loader, then the picker module. Memoized — mirrors the
 * loadGis() pattern in GoogleAuthProvider.
 */
function loadPicker() {
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const onReady = () => {
      window.gapi?.load("picker", {
        callback: () => resolve(),
        onerror: () => reject(new Error("Could not load the Google Picker.")),
      });
    };

    if (window.gapi) return onReady();

    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Could not load the Google API loader."));
    document.head.appendChild(script);
  }).catch((error) => {
    // Let a later attempt retry instead of caching the failure forever.
    loader = null;
    throw error;
  });

  return loader;
}

/**
 * Opens the Drive folder picker. Resolves null if the user cancels.
 *
 * The token passed to setOAuthToken must be the same one used for later Drive
 * calls, otherwise the per-file grant the picker creates won't apply to them.
 */
export async function pickFolder({ accessToken }: { accessToken: string }): Promise<PickedFolder | null> {
  const configError = pickerConfigError();
  if (configError) throw new Error(configError);

  await loadPicker();

  const picker = window.google?.picker;
  if (!picker) throw new Error("Google Picker is unavailable.");

  return new Promise<PickedFolder | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true)
      .setMimeTypes(FOLDER_MIME_TYPE);

    const instance = new picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(accessToken)
      .setDeveloperKey(API_KEY)
      .setAppId(APP_ID)
      .setTitle("Choose a folder for your expense data")
      .setCallback((data: google.picker.ResponseObject) => {
        if (data.action === picker.Action.PICKED) {
          const doc = data.docs?.[0];
          if (doc) resolve({ id: doc.id, name: doc.name ?? "Selected folder" });
          else resolve(null);
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();

    instance.setVisible(true);
  });
}
