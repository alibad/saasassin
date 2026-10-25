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
