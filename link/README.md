# Bobee Link

Cloudflare Worker + static upload website + D1. The desktop works without pairing. Cloudflare credentials stay on the developer PC and are never shipped in Electron or sent to the upload website.

Current deployment: [bobee-link.mihailapatrick.workers.dev](https://bobee-link.mihailapatrick.workers.dev). Dedicated D1 database: `bobee-link`. The enrollment key is in ignored `link/.deployment-secrets.json` on this PC; copy its `SETUP_KEY` value into the desktop Link settings, never into the website or chat. No Cloudflare setup remains for this deployment.

## Local checks

From the repository root: `npm ci`, `npm test`, `npm run test:desktop`, `node scripts/lint-sprites.js`.

From `link/`: `npm ci`, `npm run build`, `npm run test:runtime`, `npm run check:deploy`. The runtime smoke uses an isolated local D1 instance and serves the actual built assets. Desktop smoke uses the real renderer and an isolated, hidden Electron window; it does not start or update the installed Bobee.

An explicit live check is `node smoke-live.mjs https://bobee-link.mihailapatrick.workers.dev`; it reads the ignored deployment secret, creates one temporary receiver and test drawing, verifies retry/role/ack behavior, then revokes that receiver. It changes only that temporary receiver's data.

For local development, create ignored `.dev.vars` with `SETUP_KEY=<a random secret>` and run `npm run dev`. Apply `schema.sql` to the local D1 database using Local Explorer or the cf D1 local commands, using the same persistence directory as Vite. Desktop development accepts HTTP only for localhost/127.0.0.1; installed builds require HTTPS.

## Hosting

1. Run `npx cf auth login`. Use the browser approval flow; do not put Cloudflare API tokens in chat or source control.
2. Select the intended account using `accountId` in `cloudflare.config.ts` or `CLOUDFLARE_ACCOUNT_ID`.
3. Check existing Workers/databases before creating anything: `npx cf workers list`, `npx cf d1 list`.
4. Create a dedicated database with `npx cf d1 create --name bobee-link`. Put its returned UUID into `bindings.d1({ name: 'bobee-link', id: 'UUID' })`.
5. Initialize this new database: `npx cf d1 migrations apply UUID --dir . --pattern schema.sql`. The migration is idempotent and uses a dedicated database; never target unrelated data.
6. Generate a random enrollment key and keep it in an ignored, protected local JSON file of the form `{"SETUP_KEY":"random secret"}`. `cloudflare.config.ts` declares it as a secret binding.
7. Run `npm run check:deploy`, then `npx cf deploy --secrets-file .deployment-secrets.json`. The latter publishes the website/API and daily retention cleanup. Verify the returned workers.dev URL; a custom domain is optional.

The cf CLI/build dependencies and lockfile are kept in this subproject. This setup follows Cloudflare's current [cf project workflow](https://developers.cloudflare.com/cf/projects/) and [programmatic configuration](https://developers.cloudflare.com/cf/projects/cloudflare-config/), with [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/). It does not introduce Wrangler configuration or change desktop updater publishing.

## Pair and send

Run this version of Bobee (`npm start` from the repository, or a separately authorized installer build). Quit an older running Bobee first because it uses a single-instance lock. Open **Bobee Link…** in the tray menu. Enter the website's HTTPS origin and the enrollment key from the ignored local secret file. The key is for creating desktop receivers only; the sender website never receives it.

Copy the resulting 10-minute pairing code into the website. The code pairs exactly one browser credential. A lost pairing response can safely retry with the same pending browser credential. To issue a fresh code or replace a paired browser, **Disconnect and revoke sender** on the desktop and connect again. Revocation removes queued server art. **Forget this browser** only clears that browser's credential; it does not revoke a credential copied elsewhere.

Upload PNG/JPEG/WebP (2 MiB maximum; dimensions at most 4096×4096). The browser converts it to a centered 64×64 RGBA raster using nearest-neighbor scaling. The preview is the exact pixel payload sent to Bobee; transparency appears against the cream board. The API accepts only exactly 16,384 RGBA bytes encoded as lowercase hex. No image URLs, SVG, HTML, or executable remote content enter the desktop renderer. The initial version has one sender per receiver, no gallery, and no drawing editor.

## Delivery contract

- Server acceptance means the drawing is committed to D1, with a stable client ID and server sequence. Duplicate retries return the original sequence; conflicting data for the same ID is rejected. The queue holds at most 100 outstanding drawings per receiver.
- Every desktop receipt is atomically written and flushed to a separate inbox file before acknowledging receipt. Credentials are encrypted with Electron safeStorage. Unreadable/corrupt inboxes fail closed and show an error in Link settings rather than silently discarding art.
- Polling is serialized every 15 seconds (10-second request timeout). Received rows remain available on the server until presentation completion, so losing the local inbox can recover uncompleted art. One consumer presents in sequence order, and completion must match its active ID. Local completion is saved before the server is told; network failures retry acknowledgements.
- Bobee first says **I have something for you** or **Special delivery** and waits for a click on him. He reaches behind himself and pulls out a smaller frame (96 CSS pixels of art, still the same 64×64 image data). The 20-second viewing timer starts after the reveal, or the user can dismiss with **Thanks, Bobee!**. Both dismissal and timeout make him lower the frame behind himself over 950 ms before advancing the queue or returning to current preferences; reduced motion skips this animation. Waiting has no timeout; each queued drawing gets its own invitation. Reduced motion skips the pulling animation after the click. The whole sequence overrides saved Pause, Go home, quiet hours and the hourly activity budget without writing those settings. Normal animation and visit clocks stop during the override. When the queue empties, current preferences apply, including changes made during the presentation.
- Lock/suspend defers presentation, cancels its visible timer and replays the unfinished delivery after unlock/resume. Network loss does not stop already downloaded art. Closed/disconnected/suspended apps cannot be remotely awakened; server art waits until the app runs and reconnects. A crash mid-board may replay that board; it is not silently lost.
- Server pending data expires after 30 days. Completed pixels are erased immediately; IDs/digests remain for deduplication for 30 days from acceptance, with daily cleanup. Local completed pixels are also erased immediately; completed tombstones are pruned only after 30 days and successful acknowledgement. Already downloaded uncompleted local art remains until presented.

Polling, D1 reads and accepted art use the account's normal Cloudflare quotas. This version has no automatic desktop release. Publishing an installer/update remains a separate action.


## Website delivery confirmations

The sender website shows the latest 20 deliveries, including earlier sends recovered from the service when the page opens. **Queued** means D1 accepted the art. **Received by her Bobee** appears only after the receiver has durably saved it and acknowledged receipt. **Displayed by her Bobee** means the frame presentation completed by dismissal or its viewing timeout; it is not a claim that a person read the picture. Status checks run every five seconds while the page is visible. The last confirmed state survives a temporary connection failure; startup history recovery retries when reconnected. Refreshing preserves recent statuses, and Forget clears this browser's pairing/history.

`POST /api/status` uses sender authorization and is restricted to that sender's paired receiver. An `ids` array queries at most 20 IDs; omitting it returns the receiver's latest 20 metadata records. Neither response includes image data or credentials. Unknown/expired IDs are reported as unavailable, never as received. Existing desktop versions already send the required durable receipts, so this website update needs no desktop restart or reinstall. API records retain the existing 30-day limit.

`electron scripts/smoke-sender.cjs` from the repository root tests the actual sender JS and DOM against an isolated local server, including upload/send, receipt progression, offline recovery, refresh and Forget. It does not send to a real receiver.
