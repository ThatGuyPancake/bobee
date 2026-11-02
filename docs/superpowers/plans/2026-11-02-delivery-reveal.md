# Delivery Reveal Implementation Plan

User request: announce “I have something for you” or “Special delivery”, wait for a click on Bobee, then pull a smaller frame from behind him. This is a scoped revision of the approved presentation flow; implement directly as requested.

Design: retain the same durable active delivery through waiting, a 950 ms reach/reveal, and the existing 20-second viewing period. Waiting has no dismissal timer. Lock/reload cancels animation and recovers the unfinished drawing through the existing receiver. Keep Pause/away/quiet overrides throughout all phases. Reduce art from 128 to 96 CSS pixels; use existing master-based sprite tooling plus CSS to move the frame from behind to in front. Reduced motion reveals immediately. Each queued delivery gets its own invitation and click.

- [x] Add failing lifecycle tests for click gating, post-reveal timeout, duplicate clicks, cancellation, reduced motion and queue replacement.
- [x] Implement renderer/delivery.js lifecycle, board/bubble integration and sprite click handling. Preserve opaque hit-testing and other interactions outside delivery mode.
- [x] Draw delivery reach/hold sprites from art/bobee-master.png through art/make-states.js; animate smaller frame behind/in front.
- [x] Adapt actual Electron smoke for waiting/click/reveal, queued invitations, current preference restoration and lock recovery. Inspect a screenshot, run full regression suite and sprite checks, review, then restart the running development Bobee without changing credentials or publishing a desktop update.

Verification: 286 tests passed across 24 files; real Electron smoke passed invitation/click/reveal, 96px board, queued invitations, lock replay, current preference restoration and Pause invitation retention. Sprite lint passed. Independent review found invitation cancellation on Pause, reproduced by smoke test, fixed and re-reviewed with no remaining material findings. Existing outfit bounds test was made equivalent but faster by checking each opaque pixel bounding box once per prop, eliminating a 5-second timeout as animation coverage expanded. Local Bobee restarted normally to activate the change; no release or updater publication.
