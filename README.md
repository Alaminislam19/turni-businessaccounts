# TURNI Business Accounts — PWA v2 (Prototype)

Upload all files from this ZIP to the **root** of a GitHub repository (not the ZIP itself).

## Cloudflare Pages deployment
Connect the GitHub repo at Cloudflare > Workers & Pages > Create > Pages > Connect to Git. Framework preset: None; Build command: leave empty; Build output directory: `/` (repository root). Deploy.

## Important
This version uses browser localStorage, NOT Google Sheets. Steadfast integration, authenticated backend, return inspections and courier settlement are NOT implemented. Use TEST data only. Back up from Settings. Do not put API keys or customer data into a public repo. A private repo does not make a deployed public app private.

For a later secure integration use Cloudflare Workers with server-side secrets, authentication, transactional/idempotent order handling and validated Google Sheets access.
