export const PERMISSIONS = [
  "organization.read",
  "organization.manage",
  "directory.read",
  "directory.manage",
  "roles.read",
  "roles.manage",
  "roles.simulate",
  "reviews.read",
  "reviews.read_all",
  "reviews.manage",
  "reviews.submit",
  "reviews.calibrate",
  "reports.read",
  "workspace.export",
  "audit.read",
  "audit.write",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "organization.read": "View workspace settings",
  "organization.manage": "Manage workspace settings",
  "directory.read": "View employee directory",
  "directory.manage": "Import and manage employees",
  "roles.read": "View roles and permissions",
  "roles.manage": "Create roles and assign access",
  "roles.simulate": "Use permission simulator",
  "reviews.read": "View assigned reviews",
  "reviews.read_all": "View all review progress",
  "reviews.manage": "Manage templates and review cycles",
  "reviews.submit": "Draft and submit assigned reviews",
  "reviews.calibrate": "Calibrate ratings and release review packets",
  "reports.read": "View program reports and analytics",
  "workspace.export": "Download the complete workspace export",
  "audit.read": "Inspect immutable audit history",
  "audit.write": "Append audit events",
};

export type RoleSeed = {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  builtIn: boolean;
};

export const DEFAULT_ROLES: RoleSeed[] = [
  {
    id: "owner",
    name: "Owner",
    description: "Full workspace control, including organization and role settings.",
    permissions: [...PERMISSIONS],
    builtIn: true,
  },
  {
    id: "admin",
    name: "People admin",
    description: "Runs the directory and review program without ownership transfer.",
    permissions: [...PERMISSIONS],
    builtIn: true,
  },
  {
    id: "manager",
    name: "Manager",
    description: "Views the directory, completes reviews, and follows team progress.",
    permissions: [
      "organization.read",
      "directory.read",
      "roles.read",
      "reviews.read",
      "reviews.submit",
    ],
    builtIn: true,
  },
  {
    id: "employee",
    name: "Employee",
    description: "Views colleagues and completes assigned reviews.",
    permissions: ["directory.read", "reviews.read", "reviews.submit"],
    builtIn: true,
  },
];

export function hasPermission(
  permissions: readonly string[],
  permission: Permission,
) {
  return permissions.includes(permission);
}

const BUILT_IN_ROLE_PERMISSIONS = new Map(
  DEFAULT_ROLES.map((role) => [role.id, role.permissions] as const),
);

/**
 * Built-in roles always carry the capabilities their code definition grants, so
 * workspaces created before a capability existed pick it up without a migration.
 * Custom roles only ever carry what was stored for them.
 */
export function effectiveRolePermissions(
  roleId: string,
  builtIn: boolean,
  stored: readonly string[],
): Permission[] {
  const known = stored.filter((permission): permission is Permission =>
    (PERMISSIONS as readonly string[]).includes(permission),
  );
  if (!builtIn) return known;
  const defaults = BUILT_IN_ROLE_PERMISSIONS.get(roleId) ?? [];
  return [...new Set([...known, ...defaults])];
}
