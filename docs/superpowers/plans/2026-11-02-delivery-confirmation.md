# Website Delivery Confirmation Plan

Request: show confirmation on the sender website when her Bobee receives the drawing.

Use the existing durable received/completed receipts. Add sender-authenticated POST /api/status with up to 20 stable IDs; With no IDs, recover the latest 20 records for earlier sends. Return only this sender's receiver's ID/status records, never pixels or credentials. States: queued, received, displayed (completed presentation), unavailable (unknown/expired). Received confirms persistence on the PC, not that a person read it. Displayed confirms the frame was presented and dismissed or timed out, not just that the invitation was clicked. No desktop changes or schema migration required.

The website tracks its latest 20 accepted sends, persists metadata scoped to its pairing, polls unfinished IDs every 5 seconds while visible, and retains confirmed states when offline. Serialize polls and ignore old responses after pairing changes. Show a separate recent-deliveries panel so ordinary upload messages cannot overwrite receipts. Refresh resumes tracking; pairing changes/forget clear unrelated history.

- [x] Write failing Worker tests for state progression, role/receiver isolation, bounds and expiration; tracker tests for persistence, offline retries, overlapping polls and stale responses.
- [x] Implement status endpoint, small browser tracking module, accessible recent-deliveries panel and network recovery note.
- [x] Verify full tests and real Cloudflare runtime, review, deploy website/API to existing dedicated Worker, run isolated live receipt check, and document behavior. No desktop restart/update.

Verification: all 294 tests passed across25 files, real sender UI smoke passed upload/send and queued/received/displayed transitions, offline recovery, refresh and Forget. Real Cloudflare D1 runtime/build/dry-run passed. Independent review findings on history recency and offline startup retry were reproduced by failing tests, fixed, and re-reviewed ready. Deployed existing Worker version945599cc-21cb-43bf-9e20-b278bce842fc; live temporary receiver check verified queued -> received -> displayed plus metadata-only recent history and role isolation, then revoked its receiver. No changes to desktop credentials, queued art, installed Bobee or updater.
