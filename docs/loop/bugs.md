# Bugs to fix before new slices

The daily loop clears open rows here first (each is a small slice), then returns to
the parity map. Mark a row fixed with the commit and date; don't delete it.

| Id | Product | Bug | Found | Status |
| --- | --- | --- | --- | --- |
| BUG-001 | performance | The workspace snapshot sent the full audit history to every member, so "Recent activity" showed who gave feedback to whom regardless of permissions. | 2026-11-13, story-video capture | Fixed 2026-11-13: only roles with `audit.read` receive the full history; others get their own events (emulator test "audit visibility"). |
| BUG-002 | performance | Overview inbox "reminder" badge is squeezed into a circle and reads "mind". | 2026-11-13, story-video capture | Open |
| BUG-003 | performance | Timestamps cause a hydration mismatch whenever the viewer's time zone differs from the server's. | 2026-11-13, story-video capture | Open |
| BUG-004 | performance | Audit text reads "…review review packet" when a cycle name ends in "review". | 2026-11-13, story-video capture | Open |
| BUG-005 | performance | After a failed webhook "Send test", the delivery log doesn't refresh until a page reload. | 2026-11-13, story-video capture | Open |
| BUG-006 | performance | The public API lives at `/api/lattice/v1/...`, putting the competitor's name in our API surface. Add `/api/performance/v1/...` and keep the old prefix as a deprecated alias. | 2026-11-13, story-video capture | Open |
