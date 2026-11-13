"use client";

import Link from "next/link";
import { Library, LogIn } from "lucide-react";

import { AccountMenu } from "@/components/account/account-menu";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/lib/brand/theme-toggle";

/** Sign in, or the learner's library link and account menu (with their photo). */
export function PublicAccountArea({ signedIn, nextPath }: { signedIn: boolean; nextPath: string }) {
  return (
    <>
      <ThemeToggle />
      {signedIn ? (
        <>
          <Button asChild variant="ghost" size="lg" className="hidden rounded-xl sm:inline-flex">
            <Link href="/apps/creator?view=learning"><Library aria-hidden="true" /> My learning</Link>
          </Button>
          <AccountMenu product="creator" accountHref="/apps/creator/account" signInHref={`/apps/creator/sign-in?next=${encodeURIComponent(nextPath)}`} />
        </>
      ) : (
        <Button asChild size="lg" className="rounded-xl">
          <Link href={`/apps/creator/sign-in?next=${encodeURIComponent(nextPath)}`}><LogIn aria-hidden="true" /> Sign in</Link>
        </Button>
      )}
    </>
  );
}
