# Security Policy

## AuthKey Privacy Notice

Stremio Addon Manager operates on user-provided Stremio authentication keys (AuthKeys). AuthKeys allow access to your Stremio profile and addon configuration.

- Credentials and AuthKeys are processed locally in your browser.
- Cloudflare Pages Functions act as an API proxy to resolve CORS requirements and do not store credentials or log authentication payloads.
- Always treat your AuthKey with the same confidentiality as your password.

## Reporting a Vulnerability

If you discover a security vulnerability within this project, please report it responsibly.

Do not open a public GitHub issue for security vulnerabilities. Instead, contact the repository maintainer via GitHub security advisories or by opening a private report through maintainer channels.

Reports should include:
- Description of the vulnerability and impact
- Step-by-step reproduction instructions
- Affected component (frontend vs serverless function API)

Acknowledged reports will be investigated and addressed promptly.
