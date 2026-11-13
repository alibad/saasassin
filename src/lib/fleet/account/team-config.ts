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
      { id: "owner", label: "Owner", description: "Everything an admin can do, plus transferring ownership of the workspace." },
      { id: "admin", label: "Admin", description: "Manages people, restricted folders, legal holds, retention runs and the workspace export." },
      { id: "member", label: "Researcher", description: "Adds interviews and projects, highlights quotes, and writes insights and reports." },
      { id: "viewer", label: "Viewer", description: "Reads, searches and exports the projects they can open, without changing them." },
    ],
  },
  planner: {
    // Mirrors src/lib/planner: EDITOR_ROLES (owner, admin, member) change work; PRIVILEGED_ROLES
    // (owner, admin) also set working hours, capacity, anyone's focus hours and webhooks.
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the workspace, its team and its ownership." },
      { id: "admin", label: "Admin", description: "Sets working hours, capacity and webhooks, manages the team, and plans like a member." },
      { id: "member", label: "Member", description: "Adds tasks, projects and meetings, runs the scheduler and sets their own focus hours." },
      { id: "viewer", label: "Viewer", description: "Sees the calendar, tasks, insights and history, and can export them, without changing anything." },
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
      { id: "owner", label: "Owner", description: "Everything an admin can do, plus transferring ownership of the workspace." },
      { id: "admin", label: "Admin", description: "Manages the team, webhooks and read-only results links." },
      { id: "member", label: "Researcher", description: "Builds, launches and analyses studies, reviews sessions and writes findings." },
      { id: "viewer", label: "Viewer", description: "Reads studies, results and findings, and downloads exports, without changing them." },
    ],
  },
  revenue: {
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the workspace and its team." },
      { id: "admin", label: "Admin", description: "Manages the team, trackers, scoring, retention, webhooks and exports, and reopens closed deals." },
      { id: "manager", label: "Manager", description: "Scores and coaches calls, redacts transcripts, overrides forecast calls and reads the activity log." },
      { id: "rep", label: "Rep", description: "Logs calls and works accounts, deals and contacts; calls the forecast on their own deals." },
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
    // As in Community's own member actions, only the owner appoints, changes or removes admins.
    ownerManagesAdmins: true,
  },
  mail: {
    // Mirrors src/lib/mail: MAIL_WRITE_ROLES (owner, admin, member) import, triage, draft and edit
    // splits, filters and snippets; only owners and admins manage the team.
    roles: [
      { id: "owner", label: "Owner", description: "Full control of the mailbox, its team and its ownership." },
      { id: "admin", label: "Admin", description: "Manages the team, and does everything a member can." },
      { id: "member", label: "Member", description: "Imports and triages mail, writes drafts, and edits splits, filters and snippets." },
      { id: "viewer", label: "Viewer", description: "Reads mail, contacts and activity, and can export them, without changing anything." },
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
