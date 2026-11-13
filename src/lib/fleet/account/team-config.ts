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
      { id: "owner", label: "Owner", description: "Full control of the school, its courses, learners and team." },
      { id: "admin", label: "Admin", description: "Publishes and archives courses, enrolls learners and removes access, exports the school and manages the team." },
      { id: "member", label: "Editor", description: "Creates and edits courses, imports from Kajabi and moderates lesson discussions." },
      { id: "viewer", label: "Viewer", description: "Sees courses, learners, the email list, analytics and the activity log without changing them." },
    ],
  },
  feedback: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the portal, its boards and its team." },
      { id: "admin", label: "Admin", description: "Manages boards, settings and the team." },
      { id: "member", label: "Triage", description: "Moves posts through statuses, merges duplicates and replies." },
      { id: "viewer", label: "Viewer", description: "Reads every board, including private ones." },
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
      { id: "owner", label: "Owner", description: "Full control of the community, its spaces, plans and team." },
      { id: "admin", label: "Admin", description: "Manages spaces, members, invites, plans, cohorts and courses, sees members' emails, and moderates." },
      { id: "moderator", label: "Moderator", description: "Works the reports and appeals queues, pins, closes and removes posts, and checks people in at events." },
      { id: "member", label: "Member", description: "Posts, replies, reacts, RSVPs to events and takes courses." },
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
      { id: "admin", label: "Admin", description: "Manages people, controls and the trust page." },
      { id: "member", label: "Contributor", description: "Uploads evidence and works on assigned controls." },
      { id: "viewer", label: "Viewer", description: "Reads controls and evidence without changing them." },
    ],
  },
};

export function getTeamConfig(product: string): TeamConfig {
  return resolveTeamConfig(productTeamConfigs[product]);
}
