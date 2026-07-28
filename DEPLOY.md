# Deploying this site

## What was actually broken

There was no auto-deploy. Not a broken webhook, not an expired token — it was never
wired at all. Every deploy this site has ever had came from running `./deploy.sh`
by hand on the desktop, which does a direct upload with wrangler.

Two things kept CI from being possible:

1. **No workflow existed.** There is no `.github/` in the repo history.
2. **The files a build needs are gitignored.** `build.sh`, `_headers`, `functions/`
   and `wrangler.toml` are all excluded, so a CI runner checking out this repo would
   have no build command, no security headers and no API functions. Even a correctly
   connected Cloudflare git integration would have produced a broken site.

The result was the worst kind of failure: pushing to GitHub *looked* like it did
something. The live site and `main` had already drifted apart by the time this was
found.

## To turn it on

**1. Add two repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Where it comes from |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare dashboard → My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers", scoped to this account only |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → the account id in the right-hand sidebar |

Scope the token to Pages on one account. Do not use a global API key.

**2. Commit the build files.** Currently gitignored:

```
build.sh        the build — CI cannot run without it
_headers        the CSP and HSTS headers — without these the deployed site is less safe
functions/      the API routes — without these /api/* returns 404 on the live site
```

None of them contain a credential. They are infrastructure detail that was kept
private deliberately, so this is a judgement call: making the repo public-buildable
means showing how the site is built.

`wrangler.toml` stays ignored — the workflow passes the project name on the command
line instead, so the KV namespace id never has to be published.

To do it:

```bash
sed -i '/^functions\/$/d; /^build\.sh$/d; /^_headers$/d' .gitignore
git add -f build.sh _headers functions/ .github/ DEPLOY.md .gitignore
git commit -m "ci: deploy on push instead of by hand"
git push
```

**3. Watch the first run.** Actions tab. It should build `dist/` and deploy. If it
fails, the site is untouched — the deploy step is the last one.

## After that

- Push to `main` → production.
- Push to any other branch → a preview URL, printed in the Actions log.
- A failed build annotates the run rather than failing silently.

`./deploy.sh` still works from the desktop and is worth keeping as the escape hatch
for when GitHub is having a bad day.

## One thing to fix while you are here

`main` currently has uncommitted changes to `bonus.html`, and the live site was
deployed from a working tree that had them. Commit or discard before switching to
CI, otherwise the first automated deploy will look like it reverted something.
