- **Critical — fails for normal requests.** `req.headers.host` is typically `example.com`, but `URL` requires an absolute base such as `https://example.com`. This will throw `TypeError: Invalid URL`.

- **High — Host-header poisoning.** Even with a scheme added, deriving public URLs from the untrusted `Host` header lets attackers generate password-reset, OAuth, or redirect links under an attacker-controlled domain. Prefer a configured, allowlisted canonical origin.

- **High — `path` can replace the origin.** Absolute values like `https://evil.example/x` or protocol-relative values like `//evil.example/x` override the base. If callers expect same-origin URLs, reject these forms or construct only from validated path components.

- **Medium — missing-header failure mode.** HTTP/1.0, malformed requests, tests, and some proxy arrangements may leave `host` undefined, causing an uncaught exception unless explicitly handled.

- **Design recommendation:** Accept a trusted application origin as configuration and enforce same-origin paths. If request-derived origins are genuinely required, determine the protocol through explicitly configured proxy trust, validate the host against an allowlist, and fail closed.
