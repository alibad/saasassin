"use client";

import type { CSSProperties } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarTintIndex, initialsFor } from "@/lib/fleet/account/identity";
import { cn } from "@/lib/utils";

export type UserAvatarPerson = {
  uid: string;
  name?: string | null;
  email?: string | null;
  /**
   * The photo to show: an uploaded photo (/api/fleet/{product}/avatars/{uid}?v=…, as returned
   * by the account and team APIs), the sign-in provider's photo, or null for initials.
   */
  photoURL?: string | null;
};

export type UserAvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export type UserAvatarProps = {
  person: UserAvatarPerson;
  size?: UserAvatarSize;
  className?: string;
};

const sizes: Record<UserAvatarSize, [box: string, text: string]> = {
  xs: ["size-5", "text-[0.6rem]"],
  sm: ["size-6", "text-[0.65rem]"],
  md: ["size-8", "text-xs"],
  lg: ["size-10", "text-sm"],
  xl: ["size-16", "text-lg"],
  "2xl": ["size-24", "text-2xl"],
};

/** Hue steps around the brand's primary colour, so neighbouring initials avatars differ. */
const hueSteps = [0, 28, -28, 56, -56, 84];

function tintStyle(seed: string): CSSProperties {
  const step = hueSteps[avatarTintIndex(seed, hueSteps.length)];
  const hue = `oklch(from var(--primary) l c calc(h + ${step}))`;
  return {
    backgroundColor: `color-mix(in oklch, ${hue} 18%, var(--background))`,
    color: hue,
  };
}

/**
 * A person's avatar: their uploaded photo, else their sign-in provider's photo, else their
 * initials on a tint derived from the product's --primary colour. Styled only with theme
 * tokens, so it follows each product's brand.
 */
export function UserAvatar({ person, size = "md", className }: UserAvatarProps) {
  const label = person.name || person.email || "Unknown person";
  return (
    <Avatar className={cn(sizes[size][0], className)} role="img" aria-label={label}>
      {person.photoURL ? (
        <AvatarImage src={person.photoURL} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback
        aria-hidden="true"
        className={cn("bg-primary/15 font-medium text-primary", sizes[size][1])}
        style={tintStyle(person.uid || label)}
        delayMs={person.photoURL ? 400 : 0}
      >
        {initialsFor(person.name, person.email)}
      </AvatarFallback>
    </Avatar>
  );
}
