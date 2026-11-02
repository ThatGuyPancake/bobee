# Delivery Put-away Plan

Request: animate Bobee putting the frame away. Use the existing master-based reach poses in reverse with a 950 ms frame-lowering motion behind his body, on both dismissal and the 20-second timeout. Hold the same durable active ID and temporary preference override throughout; signal completion only after stowing finishes. Cancel all old timers on lock/reload/replacement and recover unfinished art normally. Reduced motion completes immediately. Restart only the local development Bobee after verification; keep pairing and saved state.

- [x] Test delayed completion on timeout/dismissal, duplicate dismissal, stow cancellation and reduced motion.
- [x] Add stowing controller phase, reverse sprite strip, matching body/frame animation, and disabled dismissal during stowing.
- [x] Verify full tests, sprite lint and actual Electron queue/settings/lock smoke; inspect midway rendering, review and restart local Bobee.

Verified: 296 tests across25 files passed; sprite lint and real Electron smoke passed. The smoke asserts the first durable ID remains active during stowing, dismissal disables immediately, next drawing starts only afterwards, and current preferences still restore. Inspected mid-stow screenshot. Independent review found no material issues and independently passed54 focused tests. Restarted the existing local development Bobee normally; no desktop release, updater publication or website redeployment.
