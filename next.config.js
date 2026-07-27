/** @type {import('next').NextConfig} */
const artifactTraceExcludes = [
  './.github/**/*',
  './.prompteval/**/*',
  './deploy/**/*',
  './docs/**/*',
  './scripts/**/*',
  './src/**/*',
  './test/**/*',
  './.reviews/**/*',
  './AGENTS.md',
  './CLAUDE.md',
  './CURRENT_STATE.md',
  './Makefile',
  './README.md',
  './next-env.d.ts',
  './next.config.js',
  './package-lock.json',
  './postcss.config.js',
  './repo.toml',
  './server.ts',
  './tailwind.config.ts',
  './tsconfig*.json',
  './tsconfig*.tsbuildinfo',
]

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "connect-src 'self'",
      "font-src 'self' data:",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "frame-src 'none'",
      "img-src 'self' data: https:",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
    ].join('; '),
  },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=()' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
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
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
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
  // Dynamic reads intentionally target authenticated, external runtime
  // projections. The artifact NFT contract below proves project files were
  // removed, so suppress only Turbopack's pre-exclusion next.config warning.
  turbopack: {
    ignoreIssue: [{
      path: /next\.config\.js$/,
      title: /unexpected file in NFT list/i,
    }],
  },
}
module.exports = nextConfig
