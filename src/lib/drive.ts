const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

// `version` is Drive's monotonic change counter — the cheapest reliable way to
// ask "did this file change since we last looked?" without downloading it.
const FILE_FIELDS = "id,name,mimeType,modifiedTime,version,trashed";

export type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  modifiedTime?: string;
  version?: string;
  trashed?: boolean;
};

/** Token was rejected — the caller should re-prompt for sign-in. */
export class DriveAuthError extends Error {}

/** The referenced file is gone (deleted or unshared out-of-band). */
export class DriveNotFoundError extends Error {}

/** Throttled. Retrying later may succeed. */
export class DriveRateLimitError extends Error {}

/** The user's Drive is full. Retrying will not help. */
export class DriveQuotaError extends Error {}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

/**
 * Turns a failed response into a specific error type.
 *
 * 403 is deliberately not treated as an auth failure on its own: Drive also
 * returns it for rate limiting and a full Drive. Signing the user out on a
 * rate limit would lose the pending sync, so branch on the reason code.
 */
async function raise(response: Response, context: string): Promise<never> {
  const body = await response.text().catch(() => "");
  let reason = "";
  try {
    reason = JSON.parse(body)?.error?.errors?.[0]?.reason ?? "";
  } catch {
    // Non-JSON error body; fall through to status-only classification.
  }

  if (response.status === 404) throw new DriveNotFoundError(`Not found (${context}).`);
  if (response.status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
    throw new DriveRateLimitError("Google Drive is rate limiting requests. Try again shortly.");
  }
  if (reason === "storageQuotaExceeded") {
    throw new DriveQuotaError("Your Google Drive is full, so changes cannot be saved.");
  }
  if (response.status === 401 || reason === "authError" || reason === "insufficientPermissions") {
    throw new DriveAuthError(`Drive rejected the credentials (${context}).`);
  }
  throw new Error(`Drive ${context} failed (${response.status}). ${body.slice(0, 200)}`);
}

/** Retries throttling and transient server errors with backoff + jitter. */
async function driveFetch(url: string, init: RequestInit, context: string): Promise<Response> {
  const maxAttempts = 4;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, init);
    if (response.ok) return response;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) return raise(response, context);

    const backoff = 500 * 2 ** (attempt - 1) + Math.random() * 250;
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }
}

/** Drive query strings are single-quoted, so literal quotes need escaping. */
function escapeQueryValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Locates the snapshot by name so a lost fileId can be recovered without
 * creating a duplicate. Under the drive.file scope this only ever sees files
 * this app created, which is exactly what we want.
 */
export async function findFileInFolder({
  accessToken,
  folderId,
  name,
}: {
  accessToken: string;
  folderId: string;
  name: string;
}): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    q: `name = '${escapeQueryValue(name)}' and '${escapeQueryValue(folderId)}' in parents and trashed = false`,
    fields: `files(${FILE_FIELDS})`,
    pageSize: "1",
    spaces: "drive",
  });

  const response = await driveFetch(
    `${FILES_URL}?${params}`,
    { headers: authHeaders(accessToken) },
    "search",
  );

  const data = await response.json();
  return data.files?.[0] ?? null;
}

export async function getFileMeta({
  accessToken,
  fileId,
}: {
  accessToken: string;
  fileId: string;
}): Promise<DriveFile> {
  const params = new URLSearchParams({ fields: FILE_FIELDS });
  const response = await driveFetch(
    `${FILES_URL}/${fileId}?${params}`,
    { headers: authHeaders(accessToken) },
    "metadata",
  );
  return response.json();
}

export async function downloadFile({
  accessToken,
  fileId,
}: {
  accessToken: string;
  fileId: string;
}): Promise<string> {
  const response = await driveFetch(
    `${FILES_URL}/${fileId}?alt=media`,
    { headers: authHeaders(accessToken) },
    "download",
  );
  return response.text();
}

/**
 * Creates the snapshot when `fileId` is absent, otherwise replaces its contents.
 * Uses a multipart/related body so metadata and content go up in one request.
 */
export async function uploadSnapshot({
  accessToken,
  fileId,
  folderId,
  name,
  content,
}: {
  accessToken: string;
  fileId?: string;
  folderId: string;
  name: string;
  content: string;
}): Promise<DriveFile> {
  const creating = !fileId;
  const metadata: Record<string, unknown> = { name, mimeType: "application/json" };
  // `parents` is only valid on create; sending it on update is rejected.
  if (creating) metadata.parents = [folderId];

  const boundary = `boundary-${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\n`,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\n`,
    "Content-Type: application/json\r\n\r\n",
    content,
    `\r\n--${boundary}--`,
  ]);

  const url = creating
    ? `${UPLOAD_URL}?uploadType=multipart&fields=${FILE_FIELDS}`
    : `${UPLOAD_URL}/${fileId}?uploadType=multipart&fields=${FILE_FIELDS}`;

  const response = await driveFetch(
    url,
    {
      method: creating ? "POST" : "PATCH",
      headers: {
        ...authHeaders(accessToken),
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
    "upload",
  );
  return response.json();
}
