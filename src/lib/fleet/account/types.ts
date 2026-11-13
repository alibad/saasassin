import type { RoleOption } from "./roles";

/** Wire types shared by the account and team API routes and the account components. */

export type PhotoSource = "upload" | "provider" | "none";

export type AccountProfile = {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  title: string;
  /** What to show right now: an uploaded photo, the sign-in provider's photo, or null for initials. */
  photoURL: string | null;
  photoSource: PhotoSource;
  /** The sign-in provider's photo, offered as an alternative even while another is shown. */
  providerPhotoURL: string | null;
};

export type AccountWorkspace = {
  id: string;
  name: string;
  role: string;
  roleLabel: string;
};

export type PendingInvitation = {
  tenantId: string;
  invitationId: string;
  workspaceName: string;
  role: string;
  roleLabel: string;
  invitedByName: string;
  expiresAt: string | null;
};

export type MeResponse = {
  profile: AccountProfile;
  workspaces: AccountWorkspace[];
  /** Invitations addressed to the signed-in email. Empty until that email is verified. */
  pendingInvitations: PendingInvitation[];
};

export type TeamMemberView = {
  uid: string;
  name: string;
  /** Null when this product hides member emails from the viewer's role. */
  email: string | null;
  title: string;
  role: string;
  roleLabel: string;
  photoURL: string | null;
  joinedAt: string | null;
  isYou: boolean;
};

export type InvitationView = {
  id: string;
  email: string;
  role: string;
  roleLabel: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  invitedBy: { uid: string; name: string };
  createdAt: string | null;
  expiresAt: string | null;
};

export type TeamView = {
  workspace: { id: string; name: string };
  viewer: { uid: string; role: string; roleLabel: string; canManage: boolean; isOwner: boolean };
  roles: RoleOption[];
  assignableRoles: RoleOption[];
  defaultInviteRole: string;
  members: TeamMemberView[];
  /** Pending and expired invitations; null for roles that cannot manage the team. */
  invitations: InvitationView[] | null;
};

export type CreatedInvitation = {
  invitation: InvitationView;
  /** Absolute link containing the one-time secret. Shown once; resend to get a new one. */
  inviteUrl: string;
};

export type InvitePreviewState =
  | "invalid"
  | "revoked"
  | "expired"
  | "used"
  | "signed_out"
  | "wrong_email"
  | "verify_email"
  | "already_member"
  | "ready";

export type InvitePreview = {
  state: InvitePreviewState;
  tenantId: string | null;
  workspaceName: string | null;
  inviter: { name: string; photoURL: string | null } | null;
  role: RoleOption | null;
  /** The invited address, masked ("j•••@acme.com"). */
  invitedEmail: string | null;
  viewerEmail: string | null;
  expiresAt: string | null;
};

export type ApiErrorBody = { error: string; code?: string };
