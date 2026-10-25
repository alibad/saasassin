import type { FleetTenantRole } from "@/lib/fleet/platform/tenants";

/** Who can draft and edit curriculum. Viewers can read enrollments and audit only. */
export const EDITOR_ROLES: FleetTenantRole[] = ["owner", "admin", "member"];
/** Publishing, exporting and inviting change what the outside world sees or receives. */
export const PUBLISHER_ROLES: FleetTenantRole[] = ["owner", "admin"];
