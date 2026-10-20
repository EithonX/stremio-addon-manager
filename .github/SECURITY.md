# Security Policy

## AuthKey Privacy Notice

Stremio Addon Manager operates on user-provided Stremio authentication keys (AuthKeys). AuthKeys allow access to your Stremio profile and addon configuration.

- Active AuthKeys stay in tab memory. Remembered accounts and restoration data are encrypted locally with a user-supplied passphrase. Login and authenticated collection requests pass through the deployment’s Cloudflare Function to Stremio.
- The reviewed Functions do not persist credentials or log request bodies, configured URLs, or fetch exception text. Operators must also review their infrastructure logging.
- Manifest proxy fallback is disabled unless the operator explicitly trusts an exact provider origin through `MANIFEST_PROXY_ORIGINS`; browsers otherwise contact CORS-enabled providers directly.
- Local disconnect and server-session revocation are separate actions. Private backups can contain provider credentials.
- Always treat your AuthKey with the same confidentiality as your password.

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please report it responsibly.

Do not open a public GitHub issue for security vulnerabilities. Instead, contact the repository maintainer via GitHub security advisories or by opening a private report through maintainer channels.

Reports should include:
- Description of the vulnerability and impact
- Step-by-step reproduction instructions
- Affected component (frontend vs serverless function API)

Acknowledged reports will be investigated and addressed promptly.
