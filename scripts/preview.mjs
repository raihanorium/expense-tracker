/**
 * Serves the static export from out/ — the only way to exercise the service
 * worker, since it is deliberately not registered under `next dev`.
 * Dependency-free on purpose.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const ROOT = "out";
const PORT = Number(process.env.PORT ?? 3000);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

async function resolve(pathname) {
  // Strip any leading base path segment so the export works at "/" locally.
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [join(ROOT, clean), join(ROOT, clean, "index.html")]) {
    try {
      const info = await stat(candidate);
      if (info.isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? "/", "http://localhost");
  const file = (await resolve(pathname)) ?? (await resolve("/404.html"));

  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }

  response.writeHead(pathname === "/404.html" ? 404 : 200, {
    "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
    // The worker owns caching; stale HTTP caching would confuse testing.
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(response);
}).listen(PORT, () => {
  console.log(`Serving ./${ROOT} at http://localhost:${PORT}`);
});
