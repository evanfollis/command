// Resolve the JWT signing/verification secret at call time.
//
// The secret is delivered at runtime via the systemd EnvironmentFile
// (.env.local) and must never be baked into build output. It is intentionally
// NOT declared in next.config.js `env`, which would inline the value into the
// compiled bundle (and could leak it into a client chunk if ever referenced
// from one). Reading process.env here keeps it a runtime-only value.
//
// Fail closed in every environment: a missing secret must never silently fall
// back to a known constant, which would let anyone forge a valid session token.
// Resolve lazily (per call), never at module load, so `next build` — which may
// run without the runtime secret — does not throw.
//
// No imports: this module is shared by the Next proxy boundary and server
// authentication code, so secret resolution stays small and auditable.

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET
  if (secret && secret.length > 0) return secret
  throw new Error('JWT_SECRET is required; refusing to sign or verify tokens without it')
}
