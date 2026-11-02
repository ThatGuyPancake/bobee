# Bobee Desktop and Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Configurable desktop companionship and secure, durable Cloudflare drawing delivery.
**Architecture:** Extend the existing saved state and behavior engine; keep Link credentials and inbox in main-process storage. A single receiver serializes board presentations without changing preferences. A Worker serves static upload assets and uses D1 for pairing and ordered delivery.
**Tech Stack:** Electron, JavaScript, Vitest, Cloudflare Workers, D1, cf CLI.
**Spec:** docs/superpowers/specs/2026-11-02-bobee-link-design.md

## Global Constraints
- Preserve the existing design draft, interactions, saved state, and updater.
- Incoming art overrides Pause, quiet hours, away behavior and hourly budget; restore CURRENT settings after draining.
- Every accepted delivery is durable before acknowledgement, with stable IDs, deduplication, ordered single consumption and crash recovery.
- Cloudflare hosting only; no release publication.
- Execute directly in the supplied checkout as explicitly delegated; preserve uncommitted design. Implementation already authorized; no additional plan approval gate.

## Review Focus
- Restart during presentation replays unfinished art; disk write failure must prevent receipt acknowledgement.
- Overlapping polls and retries cannot overlap presentations or advance the wrong delivery.
- Preference changes during a board affect restoration, never the saved preferences themselves.
- Lock/suspend defers completion and restarts the unfinished presentation on unlock.
- Pair codes expire, are single-use, and receiver credentials cannot authorize sender operations.

## Defaults
64x64 RGBA pixel payload; browser accepts PNG/JPEG/WebP up to 2 MiB and 4096 pixels per edge, nearest-neighbor contain preview. No executable remote content. 20-second board or click dismissal. Poll every 15 seconds with 10-second network timeout. Queue maximum 100 outstanding drawings per receiver. Pending deliveries retained 30 days; completed pixel data erased on completion, dedup tombstones retained 30 days. Pair code: 128 bits, 10 minutes, single use; bearer secrets: 256 bits, hashed at rest on server; desktop secrets encrypted using Electron safeStorage when available. Quiet hours optional (21:00–07:30 preset). Break reminder optional after 50 active minutes, snooze 10 minutes or skip/reset. Snack routine starts after 30 seconds of attended jar time, mopey for 3 seconds, walks to jar and eats once; cancellation discards the routine.

### Task 1: Desktop settings and behavior
**Files:** lib/store.js; renderer/brain.js; renderer/visits.js; lib/breaks.js; main.js; renderer/app.js; test/settings.test.js.
**Interfaces:** saved activeMinutes (0..60), restMode ('home'|'sleep'), paused, displayId, quietHours, breakMinutes; brain.setPreferences(settings); createBreaks.tick(milliseconds,active).
- [x] Write failing settings, plan budget, brain rest/quiet and active-time reminder tests; run `npm test -- test/settings.test.js` expecting failures.
- [x] Implement validated backward-compatible saved settings, budget-scaled visits, rest choice and quiet-hours behavior, active-time reminder state.
- [x] Add tray settings, monitor selection/fallback, snooze/skip and persist Pause. Verify targeted and existing regression tests.

### Task 2: Durable desktop inbox and presentation
**Files:** lib/linkInbox.js; lib/linkReceiver.js; lib/linkCredentials.js; renderer/board.js; preload.js; main.js; renderer/app.js; renderer/index.html; renderer/style.css; test/link.test.js.
**Interfaces:** inbox.ingest(deliveries), next(), complete(id), receipts(); receiver.poll(), present(), finish(id), defer(boolean). Board data {id,sequence,pixels}.
- [x] Write failing tests for persistence, replay, dedup, ordering, disk errors, overlaps, offline/reconnect, ID-bound completion and deferral. Run `npm test -- test/link.test.js` expecting failures.
- [x] Implement atomic main-process inbox, bounded validated RGBA payload, retryable receipt/completion acknowledgements and one presentation consumer.
- [x] Wire encrypted pairing configuration UI, renderer ready/reload, lock/suspend deferral, temporary presentation and current-settings restoration; verify targeted tests.

### Task 3: Cloudflare sender and durable API
**Files:** link/cloudflare.config.ts; link/package.json; link/worker.mjs; link/schema.sql; link/public/*; test/link-worker.test.js.
**Interfaces:** POST /api/receiver (pair initiation); POST /api/pair; GET /api/inbox; POST /api/deliveries; POST /api/ack; POST /api/revoke. Bearer auth by role. Sender delivery IDs are stable UUIDs with server sequence.
- [x] Write failing tests using actual SQLite for pairing expiry/single use, authorization, invalid data, retry/conflict, ordered queue, idempotent receipt/completion and retention. Run targeted tests expecting failure.
- [x] Implement prepared SQL and atomic conditional writes, request bounds, hashed secrets, queue limit, cleanup and static response security headers.
- [x] Build upload/preview/pair/send UI with stable retry IDs and explicit success/error state. Check current cf configuration and local build.

### Task 4: Snack routine and full verification
**Files:** lib/jarWindows.js; renderer/brain.js; renderer/app.js; scripts/* if additional sprites required; test/snack.test.js; README.md; link/README.md.
**Interfaces:** jar event includes x; brain.walkTo(x), snack main-process consumption uses existing jar session.
- [x] Write failing attended-time/cancellation/self-feed tests; run targeted tests expecting failure.
- [x] Implement mopey -> grumpy walk -> munch -> happy using existing generated sprites/overlays, cancel when unavailable/away and preserve feeding interaction.
- [x] Run complete test suite, syntax checks, Worker local integration and packaging checks. Review state restoration/security paths, document defaults, deployment steps and any actual credential/tool limitations.

## Pre-flight interface ledger
Task 1 -> 2: preference state consumed without writes by presentation override; no conflict.
Task 2 -> 3: shared fixed 64x64 RGBA data plus stable ID/server sequence; receipt distinct from completion.
Task 1 -> 4: jar active predicate includes normal visibility and excludes presentation; routine cancellation never accumulates debt.


## Completion ledger

- Task 1 complete: validated saved preferences, tray menus, monitor fallback, active-time breaks; root settings/brain/regression tests passed.
- Task 2 complete: durable atomic inbox and encrypted receiver settings, separate receipt/completion retries, one consumer, lock/reload recovery and temporary renderer override. Queue tests and real Electron integration passed.
- Task 3 complete: Worker/D1 service, upload/preview/send UI, bounded protocol, hashed roles, secure single-use pairing and revocation. SQLite tests, local Cloudflare runtime smoke, build and deployment dry run passed. Deployed dedicated bobee-link Worker/database after user authenticated locally. Live test verified enrollment/pairing/delivery/retry/role isolation/completion and revoked its temporary receiver.
- Task 4 complete: code-drawn snack expressions, attended-time routine, jar consumption and cancellation. Sprite checks, all 281 unit/regression tests, actual renderer smoke and unpacked Windows package passed. No installer or GitHub release/update published.
- Final independent review: all identified issues resolved. Tests reproduced and fixed rest-mode changes while asleep, delayed bubble resize clipping, typing interrupting snack walk, and invisible hit-testing. Reviewer rechecked fixes and reported no remaining concrete issues.
- Ruling: root Vitest discovery excludes archived .claude/worktrees so tests exercise this checkout. The original baseline’s 959 tests included 47 suites from stale checkouts; the final root suite has 281 tests across 23 files.
- Ruling: use native execution in the explicitly supplied shared checkout; user already authorized worker implementation and instructed the parent not to edit it. Keep design draft unchanged and all changes reviewable without publishing a desktop release.
- Actual production URL: https://bobee-link.mihailapatrick.workers.dev. Local enrollment secret is ignored by Git and excluded from desktop packaging; the user still needs to run this desktop version and pair it.
