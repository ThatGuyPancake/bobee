# Bobee updater (1.5.0)
Approved behavior: check 15 seconds after startup and every four hours, download stable GitHub updates quietly, only install through the explicit tray restart action. Manual check available; failures stay in tray and never stop Bobee. Development runs do not contact GitHub.
1. Add an injected updater controller and tests for scheduling, concurrent checks, downloads, failures, manual retry, disposal and explicit installation only.
2. Wire tray status/actions, flush saved state before restart, disable automatic install on quit.
3. Configure public GitHub provider and versioned NSIS artifacts; publish installer, blockmap and latest.yml together. Add repeatable release instructions.
4. Run tests, build, validate manifest hashes and packaged feed. Install bootstrap version. End-to-end upgrade needs a subsequent newer release; report that limit.
