"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FileIcon from "@/components/FileIcon";
import { useGoogleAuth } from "@/components/GoogleAuthProvider";
import {
  type DriveFile,
  DriveAuthError,
  fileKind,
  formatDate,
  formatSize,
  isFolder,
  listFiles,
} from "@/lib/drive";

type Crumb = { id: string; name: string };

const ROOT: Crumb = { id: "root", name: "My Drive" };

export default function DriveBrowser() {
  const { accessToken, user, signOut, invalidate } = useGoogleAuth();

  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const folder = trail[trail.length - 1];
  // Guards against an earlier, slower request overwriting a newer listing.
  const requestId = useRef(0);

  // Debounce typing so we aren't firing a Drive query per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPage = useCallback(
    async (pageToken?: string) => {
      if (!accessToken) return;
      const id = ++requestId.current;

      if (pageToken) setLoadingMore(true);
      else setLoading(true);

      try {
        const data = await listFiles({
          accessToken,
          folderId: folder.id,
          search: query || undefined,
          pageToken,
        });
        if (id !== requestId.current) return;

        setError(null);
        setFiles((current) => (pageToken ? [...current, ...data.files] : data.files));
        setNextPageToken(data.nextPageToken);
      } catch (err) {
        if (id !== requestId.current) return;
        if (err instanceof DriveAuthError) invalidate();
        else setError(err instanceof Error ? err.message : "Could not load your files.");
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [accessToken, folder.id, query, invalidate],
  );

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  function openFolder(file: DriveFile) {
    // Searching spans all of Drive, so opening a hit restarts the trail there.
    setTrail(query ? [ROOT, { id: file.id, name: file.name }] : [...trail, { id: file.id, name: file.name }]);
    setSearch("");
    setQuery("");
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Drive Browser</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{user?.name ?? user?.email}</p>
        </div>
        <button
          onClick={signOut}
          className="rounded-full border border-black/[.12] px-4 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.16] dark:hover:bg-white/[.06]"
        >
          Sign out
        </button>
      </header>

      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search all files…"
        className="h-11 w-full rounded-lg border border-black/[.12] bg-white px-4 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-white/[.16] dark:bg-zinc-900 dark:focus:border-zinc-500"
      />

      {query ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Results for <span className="font-medium text-zinc-900 dark:text-zinc-100">{query}</span>
        </p>
      ) : (
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Breadcrumb">
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;
            return (
              <span key={crumb.id} className="flex items-center gap-1">
                {index > 0 && <span className="text-zinc-300 dark:text-zinc-600">/</span>}
                {isLast ? (
                  <span className="font-medium">{crumb.name}</span>
                ) : (
                  <button
                    onClick={() => setTrail(trail.slice(0, index + 1))}
                    className="text-zinc-500 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
                  >
                    {crumb.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-black/[.08] dark:border-white/[.12]">
        <div className="grid grid-cols-[1fr_auto] gap-4 border-b border-black/[.08] bg-zinc-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-white/[.12] dark:bg-zinc-900 dark:text-zinc-400 sm:grid-cols-[1fr_8rem_7rem_6rem]">
          <span>Name</span>
          <span className="hidden sm:block">Type</span>
          <span className="hidden sm:block">Modified</span>
          <span className="text-right">Size</span>
        </div>

        {loading ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : files.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {query ? "No files match that search." : "This folder is empty."}
          </p>
        ) : (
          <ul className="divide-y divide-black/[.06] dark:divide-white/[.08]">
            {files.map((file) => (
              <li
                key={file.id}
                className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-2.5 text-sm transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03] sm:grid-cols-[1fr_8rem_7rem_6rem]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileIcon mimeType={file.mimeType} />
                  {isFolder(file) ? (
                    <button
                      onClick={() => openFolder(file)}
                      className="truncate text-left font-medium hover:underline"
                    >
                      {file.name}
                    </button>
                  ) : (
                    <a
                      href={file.webViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:underline"
                    >
                      {file.name}
                    </a>
                  )}
                </div>
                <span className="hidden truncate text-zinc-500 dark:text-zinc-400 sm:block">
                  {fileKind(file.mimeType)}
                </span>
                <span className="hidden text-zinc-500 dark:text-zinc-400 sm:block">
                  {formatDate(file.modifiedTime)}
                </span>
                <span className="text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                  {isFolder(file) ? "—" : formatSize(file.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {nextPageToken && !loading && (
        <button
          onClick={() => fetchPage(nextPageToken)}
          disabled={loadingMore}
          className="self-center rounded-full border border-black/[.12] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-60 dark:border-white/[.16] dark:hover:bg-white/[.06]"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
