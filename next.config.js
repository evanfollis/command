/** @type {import('next').NextConfig} */
const artifactTraceExcludes = [
  './.github/**/*',
  './.prompteval/**/*',
  './deploy/**/*',
  './docs/**/*',
  './scripts/**/*',
  './src/**/*',
  './AGENTS.md',
  './CLAUDE.md',
  './CURRENT_STATE.md',
  './Makefile',
  './README.md',
  './next.config.js',
  './repo.toml',
]

const nextConfig = {
  // JWT_SECRET is intentionally NOT declared here. next.config `env` inlines
  // values into the compiled build at build time; a signing secret must stay a
  // runtime-only value (delivered via the systemd EnvironmentFile) so it is
  // never baked into build output. Server code and middleware read it from
  // process.env at request time. COMMAND_ORIGIN is a public URL and is likewise
  // read from process.env at runtime.
  env: {},
  // Command does not use next/image. Disabling the optimizer keeps the
  // libvips-backed optional image path outside the deployed attack surface.
  images: {
    unoptimized: true,
  },
  // Artifact browsing reads allowlisted external runtime roots. Turbopack
  // cannot infer that dynamic recursion boundary and otherwise traces the
  // entire repository into these pages' unused NFT deployment manifests.
  // Command ships the complete .next output plus lockfile-bound node_modules,
  // not a standalone NFT-pruned bundle.
  outputFileTracingExcludes: {
    '/artifacts': artifactTraceExcludes,
    '/artifacts/**': artifactTraceExcludes,
  },
}
module.exports = nextConfig
