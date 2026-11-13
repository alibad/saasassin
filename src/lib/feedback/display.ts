import type { PostStatus } from "./model";

/** Status names as people see them; stored values stay Fider-shaped (see ./model.ts). */
export const STATUS_DISPLAY: Record<PostStatus, string> = {
  open: "Open",
  planned: "Planned",
  started: "In progress",
  completed: "Completed",
  declined: "Declined",
  duplicate: "Merged",
};
