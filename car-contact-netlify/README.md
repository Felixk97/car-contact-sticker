# Car Contact Alert (ntfy + Netlify)

Free, backend-free* car contact sticker system. Visitors scan a QR code,
pick a reason (or type a message), and you get a push notification —
no phone number or WhatsApp exposed, and now the ntfy topic itself is kept
out of the page source using a Netlify Function.

*"Backend-free" in the sense of no server you manage — Netlify Functions are
serverless, so there's nothing to keep running.

## Folder structure
```
netlify.toml                     ← tells Netlify where the site + functions live
public/index.html                ← the visitor-facing QR landing page (also visitor.html)
public/owner-setup.html          ← one-time setup instructions for the owner
netlify/functions/send-alert.js  ← proxies the alert to ntfy.sh, keeps topic secret
```

## Deploy steps

1. **Push this folder to a GitHub repo** (or drag the whole folder into
   Netlify's dashboard under "Deploys" for a one-off manual deploy).
2. On [netlify.com](https://netlify.com), click **Add new site → Import an
   existing project**, pick the repo. Build settings are already defined in
   `netlify.toml`, so you shouldn't need to change anything.
3. Once the site is created, go to **Site settings → Environment variables**
   and add:
   - `NTFY_TOPIC` = your secret ntfy topic (long random string — see
     `owner-setup.html` for how to generate/subscribe to one)
4. Trigger a deploy (push a commit, or click "Trigger deploy" in the
   dashboard) so the function picks up the new environment variable.
5. Open your live site URL (e.g. `https://yoursite.netlify.app`), submit a
   test alert, confirm it arrives on your phone via the ntfy app.
6. Generate a QR code pointing at your site URL and print it on the sticker.

## Editing your car plate / reasons
Open `public/index.html`, find `const VEHICLE_PLATE = "WXX 1234"` near the
bottom and change it, and edit the four `reason(...)` buttons if you want
different quick-select options.

## Why this is safer than the original prototype
In the original version, the ntfy topic was written directly into the HTML,
so anyone could view-source the page and spam your phone directly via
`ntfy.sh` forever. Now the browser only ever talks to your own Netlify
Function at `/.netlify/functions/send-alert` — the real topic stays in
Netlify's environment variables, which visitors never see.

## Known limitations
- **Rate limiting is best-effort.** The function keeps an in-memory cooldown
  per IP (30s), but that resets whenever Netlify spins up a fresh function
  instance, so a determined spammer could still get through more often than
  intended. Fine for a personal car sticker; not bulletproof for a
  commercial/public rollout.
- **ntfy.sh is a shared free public service** — no uptime guarantee. Good
  enough for personal use; consider self-hosting ntfy or switching to a paid
  push service if you ever offer this to other car owners.
- **One-way alerts only** — the owner can't reply to the visitor through this
  system. If you need two-way conversation, that's what the WhatsApp-relay
  version (see the other project) is for.
