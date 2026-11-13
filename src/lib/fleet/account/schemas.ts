import { z } from "zod";

/** Request bodies for the account and team routes. */

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Keep your name under 80 characters.").optional(),
  title: z.string().trim().max(80, "Keep your title under 80 characters.").optional(),
  photoSource: z.enum(["provider", "none"]).optional(),
}).strict();

export const invitationCreateSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.string().trim().min(1, "Choose a role.").max(40),
});

export const roleChangeSchema = z.object({
  role: z.string().trim().min(1, "Choose a role.").max(40),
});

export const transferSchema = z.object({
  uid: z.string().trim().min(1, "Choose who will own the workspace.").max(128),
});

export const acceptSchema = z.union([
  z.object({ token: z.string().trim().min(10).max(300) }),
  z.object({ tenantId: z.string().trim().min(1).max(128), invitationId: z.string().trim().min(1).max(128) }),
]);
