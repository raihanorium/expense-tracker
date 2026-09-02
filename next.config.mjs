/**
 * Built as a fully static site so it can be served from GitHub Pages, which has
 * no Node runtime. Everything (OAuth + Drive calls) happens in the browser.
 */

// Project pages live under https://<user>.github.io/<repo>/, so assets need the
// repo name prefixed. Left empty for local dev.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
