export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

/** Metadata fields requested from the Drive API for each file. */
const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,webViewLink";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  /** Absent for folders and native Google Docs/Sheets/Slides. */
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

export type DriveListing = {
  files: DriveFile[];
  nextPageToken: string | null;
};

/** Thrown when Drive rejects the access token, so the UI can re-prompt. */
export class DriveAuthError extends Error {}

/** Drive query strings are single-quoted, so literal quotes need escaping. */
function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Lists one folder, or searches all of Drive when `search` is set. Called
 * directly from the browser — Google's REST APIs allow cross-origin requests
 * with a bearer token.
 */
export async function listFiles({
  accessToken,
  folderId = "root",
  search,
  pageToken,
}: {
  accessToken: string;
  folderId?: string;
  search?: string;
  pageToken?: string;
}): Promise<DriveListing> {
  const query = search
    ? `name contains '${escapeQueryValue(search)}' and trashed = false`
    : `'${escapeQueryValue(folderId)}' in parents and trashed = false`;

  const params = new URLSearchParams({
    q: query,
    fields: `nextPageToken, files(${FILE_FIELDS})`,
    // Folders first, then alphabetical — the familiar Drive ordering.
    orderBy: "folder,name_natural",
    pageSize: "100",
    spaces: "drive",
  });
  if (pageToken) params.set("pageToken", pageToken);

  const response = await fetch(`${DRIVE_FILES_URL}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401 || response.status === 403) {
    throw new DriveAuthError("Drive access token was rejected.");
  }
  if (!response.ok) {
    throw new Error(`Drive request failed (${response.status}).`);
  }

  const data = await response.json();
  return { files: data.files ?? [], nextPageToken: data.nextPageToken ?? null };
}

export function isFolder(file: DriveFile) {
  return file.mimeType === FOLDER_MIME_TYPE;
}

export function formatSize(bytes?: string) {
  if (!bytes) return "—";
  const value = Number(bytes);
  if (!Number.isFinite(value)) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size < 10 && unit > 0 ? size.toFixed(1) : Math.round(size)} ${units[unit]}`;
}

export function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Short, human-readable label for the common Drive mime types. */
export function fileKind(mimeType: string) {
  const known: Record<string, string> = {
    [FOLDER_MIME_TYPE]: "Folder",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.form": "Google Form",
    "application/pdf": "PDF",
  };
  if (known[mimeType]) return known[mimeType];

  if (mimeType.startsWith("image/")) return "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.startsWith("text/")) return "Text";
  return "File";
}
