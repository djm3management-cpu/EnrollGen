always keep same styling for site found in styles.css

## Deploys
Never run `netlify deploy --prod`. Production deploys happen automatically when main is pushed to GitHub. Commit as you go, but push to main once at the end of the session, not after each change. Use `netlify deploy` (draft/preview, no --prod) if you need to verify something live before pushing.

Never deploy to Netlify production. Netlify builds are stopped; Mike triggers production deploys manually once per session.
