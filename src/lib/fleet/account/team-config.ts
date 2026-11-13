import { resolveTeamConfig, type TeamConfig } from "./roles";

/**
 * Per-product team configuration: the roles a workspace member can hold and who may see
 * other members' email addresses. Products not listed use owner / admin / member / viewer.
 * Role semantics stay product-owned; this only names and describes them for the team page
 * and validates invitations and role changes.
 */
const productTeamConfigs: Record<string, Partial<TeamConfig>> = {
  research: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the repository, its people and its retention settings." },
      { id: "admin", label: "Admin", description: "Manages people, projects and exports." },
      { id: "member", label: "Researcher", description: "Uploads evidence, highlights and publishes insights." },
      { id: "viewer", label: "Viewer", description: "Reads published research without changing it." },
    ],
  },
  planner: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the workspace and its members." },
      { id: "admin", label: "Admin", description: "Manages members, projects and integrations." },
      { id: "member", label: "Member", description: "Plans tasks and schedules work." },
      { id: "viewer", label: "Viewer", description: "Sees plans and projects without editing them." },
    ],
  },
  creator: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the business, its offers and its team." },
      { id: "admin", label: "Admin", description: "Publishes, exports and manages the team." },
      { id: "member", label: "Editor", description: "Drafts and edits products and lessons." },
      { id: "viewer", label: "Viewer", description: "Reads enrollments and the activity log." },
    ],
  },
  feedback: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the portal, its boards and its team." },
      { id: "admin", label: "Admin", description: "Changes statuses, merges and moderates posts, and manages boards, the changelog and the team." },
      { id: "member", label: "Triage", description: "Tags posts, assigns owners and adds team-only notes." },
      { id: "viewer", label: "Viewer", description: "Reads every board and post, including private ones, without changing them." },
    ],
  },
  studies: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the workspace and its team." },
      { id: "admin", label: "Admin", description: "Manages the team, webhooks and exports." },
      { id: "member", label: "Researcher", description: "Builds, launches and analyses studies." },
      { id: "viewer", label: "Viewer", description: "Reads results without changing studies." },
    ],
  },
  revenue: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the workspace and its team." },
      { id: "admin", label: "Admin", description: "Manages the team, integrations and exports." },
      { id: "manager", label: "Manager", description: "Coaches reps, reviews calls and owns the forecast." },
      { id: "rep", label: "Rep", description: "Logs calls, works deals and updates contacts." },
      { id: "viewer", label: "Viewer", description: "Reads calls and pipeline without changing them." },
    ],
    defaultInviteRole: "rep",
  },
  community: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the community, its spaces and its team." },
      { id: "admin", label: "Admin", description: "Manages spaces, members and settings." },
      { id: "moderator", label: "Moderator", description: "Reviews reports and keeps conversations healthy." },
      { id: "member", label: "Member", description: "Posts, comments and joins events." },
    ],
    // Members never see each other's email addresses in a community.
    memberEmails: "privileged",
  },
  mail: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the shared inbox and its team." },
      { id: "admin", label: "Admin", description: "Manages the team, imports and settings." },
      { id: "member", label: "Member", description: "Reads, sends and triages mail." },
      { id: "viewer", label: "Viewer", description: "Reads mail without sending or changing it." },
    ],
  },
  trust: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the program, its evidence and its team." },
      { id: "admin", label: "Admin", description: "Approves policies and evidence, publishes the trust center, and manages people and auditor access." },
      { id: "member", label: "Contributor", description: "Works on controls, evidence, risks, vendors, findings and policy drafts." },
      { id: "viewer", label: "Viewer", description: "Reads the whole program and acknowledges policies. Auditors get this role, with access that ends on a set date." },
    ],
  },
};

export function getTeamConfig(product: string): TeamConfig {
  return resolveTeamConfig(productTeamConfigs[product]);
}
