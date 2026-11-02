# Bobee Link — first-version design draft

Date: 2026-11-02
Status: Draft; product decisions below are separated from implementation proposals.

## Intent

Send pixel art from a simple website to the desktop Bobee, who presents it on a board. The website will be hosted on Cloudflare. This is a separate project from the upcoming desktop settings, screen selection, snack behavior and break reminders.

## User decisions

- The first sender is a website.
- Upload existing artwork; a drawing editor is not needed for the first version.
- Incoming art interrupts Bobee's configured offline/away state. He appears, presents the drawing, then returns to that state if it is still selected.
- Ordinary hourly activity settings must not prevent this drawing interruption.
- Drawing deliveries also interrupt deliberate Pause and quiet hours.
- Every drawing is queued, including when it can be presented immediately. Presentations are serialized to prevent concurrent deliveries from competing for Bobee's state.

## Proposed experience

1. Pair the sender website with the intended desktop Bobee once.
2. Upload an image, inspect a preview of how it will appear on his board, and send it.
3. The service durably queues the drawing before confirming acceptance. The desktop persists received drawings to its local inbox before acknowledging receipt.
4. A single presentation consumer takes the next pending drawing. Bobee appears and holds up the board automatically, even when configured to be away, paused or within quiet hours.
5. After presentation, he returns to the behavior selected in his current settings. A setting changed during the presentation takes precedence over the previous state.

Configured offline/away is a character behavior, distinct from losing network connectivity. A disconnected, suspended or closed desktop app can receive queued art after it is running and connected again; a website cannot directly wake that app through this design.

## Approaches

- Upload website versus an in-browser pixel editor: the user chose uploads for a simpler first version.
- Periodic desktop checks versus a persistent connection: periodic checks are the proposed starting point, with a modest delivery delay and fewer connection-recovery concerns. The interval remains undecided.

## Proposed implementation

- Cloudflare Workers serves the website and API.
- D1 holds pairing records, delivery metadata and bounded pixel data for small normalized images. Revisit image storage if uploads require larger files.
- Use short-lived pairing codes and separate revocable sender and receiver credentials; possession of a public URL alone must not authorize sending.
- Normalize accepted images to a bounded raster format and dimensions, with nearest-neighbor scaling for pixel art and an accurate preview. Initial supported formats and board resolution remain to be selected.
- Download and validate image data outside the desktop renderer. Remote content is displayed as image data, never executed as website content.
- Keep receipt and presentation acknowledgements separate. Persist the local inbox so restarting does not lose an unshown image or repeatedly interrupt with the same delivery.
- Assign each delivery a stable ID; enforce deduplication in durable storage. Make receipt and completion acknowledgements idempotent so retries cannot add duplicate queue entries or complete a different drawing.
- Multiple incoming drawings wait in server-assigned order rather than overlapping boards. Only one desktop presentation may be active at a time; overlapping network checks must not create additional presentation consumers.
- Track pending, presenting and completed deliveries explicitly. Completion refers to the active delivery ID. Retain an unfinished drawing across restart for recovery; a crash during presentation may require showing it again rather than silently losing it.
- Treat presentation as a temporary override of user settings. Do not toggle or overwrite saved Pause, quiet hours or away preferences. Resolve current settings when the queue drains, including changes made while a drawing was displayed.

## Scope and constraints

The first version includes uploading, previewing, pairing, delivery and temporary desktop presentation. A pixel editor, public gallery and desktop-to-desktop sending are outside this version. Existing non-Link behavior stays usable without pairing.

## Still to settle

- Board dimensions and accepted image formats.
- Automatic presentation duration and dismissal interaction.
- Whether a locked PC defers presentation until unlock. Away, Pause and quiet-hours overrides are confirmed.
- Delivery-check interval, queue limits and retention.

## Verification targets for implementation

Exercise delivery while awake, configured away, paused and within quiet hours; restoration after the queue drains; settings changed while the board is open; disconnected/reconnected delivery; restart recovery; duplicate delivery and acknowledgements; simultaneous arrivals and overlapping network checks; queued drawings; invalid uploads and unauthorized send attempts.
