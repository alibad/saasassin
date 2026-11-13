"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, LoaderCircle, LogOut, MonitorX, Trash2, UserRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster, toast } from "@/components/ui/toast";
import type { AccountProfile } from "@/lib/fleet/account/types";
import { cn } from "@/lib/utils";

import { readableAuthError } from "./auth-errors";
import { accountApiBase, accountRequest, setAccount, useAccount } from "./client";
import { PhotoCropDialog } from "./photo-crop-dialog";
import { useReauthGuard } from "./reauth-dialog";
import { SignInMethods } from "./sign-in-methods";
import { TwoStepVerification } from "./two-step-verification";
import { signOutOfProduct, useFirebaseUser } from "./use-firebase-user";
import { UserAvatar } from "./user-avatar";

export type AccountSettingsProps = {
  /** Fleet product slug, or "performance". */
  product: string;
  productName: string;
  /** Where to send people after they sign out (for example "/apps/research/sign-in"). */
  signInHref: string;
  className?: string;
};

/**
 * Account settings for one product: profile (name, title, photo upload with crop, provider
 * photo), sign-in methods (link/unlink providers, password, email confirmation), two-step
 * verification with an authenticator app, and signing out of this device or everywhere.
 */
export function AccountSettings({ product, productName, signInHref, className }: AccountSettingsProps) {
  const { data, error, loading, refresh } = useAccount(product);
  const { user, touch } = useFirebaseUser();
  const { guard, dialog } = useReauthGuard(product);

  return (
    <div className={cn("grid gap-6", className)}>
      <Toaster />
      {dialog}
      {loading && !data ? (
        <Card>
          <CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64" /></CardHeader>
          <CardContent className="flex items-center gap-4"><Skeleton className="size-24 rounded-full" /><Skeleton className="h-9 w-full" /></CardContent>
        </Card>
      ) : error && !data ? (
        <Alert variant="destructive">
          <AlertTitle>Your account couldn&apos;t be loaded</AlertTitle>
          <AlertDescription>
            {error}
            <Button className="mt-2 w-fit" size="sm" variant="outline" onClick={() => void refresh()}>Try again</Button>
          </AlertDescription>
        </Alert>
      ) : data ? (
        <ProfileCard product={product} profile={data.profile} />
      ) : null}

      {user === undefined ? (
        <Card><CardHeader><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-72" /></CardHeader></Card>
      ) : user === null ? (
        <Alert>
          <AlertTitle>Sign in again to manage sign-in methods</AlertTitle>
          <AlertDescription>
            This browser no longer holds your sign-in, so sign-in methods and two-step verification can&apos;t be changed here.
            <Button
              className="mt-2 w-fit"
              size="sm"
              variant="outline"
              onClick={async () => {
                await signOutOfProduct(product);
                window.location.assign(signInHref);
              }}
            >
              Sign in again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <SignInMethods product={product} user={user} guard={guard} onChanged={touch} />
          <TwoStepVerification product={product} productName={productName} user={user} guard={guard} onChanged={touch} />
        </>
      )}

      <SessionsCard product={product} signInHref={signInHref} email={data?.profile.email ?? user?.email ?? ""} />
    </div>
  );
}

function ProfileCard({ product, profile }: { product: string; profile: AccountProfile }) {
  const [name, setName] = useState(profile.name);
  const [title, setTitle] = useState(profile.title);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirty = name.trim() !== profile.name || title.trim() !== profile.title;

  function applyProfile(next: AccountProfile) {
    setAccount(product, (current) => ({ ...current, profile: next }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const { profile: next } = await accountRequest<{ profile: AccountProfile }>(`${accountApiBase(product)}/me`, {
        method: "PATCH",
        json: { name: name.trim(), title: title.trim() },
      });
      applyProfile(next);
      setName(next.name);
      setTitle(next.title);
      toast({ title: "Profile saved" });
    } catch (caught) {
      toast({ title: "Couldn't save your profile", description: readableAuthError(caught), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif|heic|heif|avif)$/.test(file.type) && file.type !== "") {
      toast({ title: "Choose a photo", description: "Use a PNG, JPEG or WebP image.", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "That file is too large", description: "Choose a photo under 15 MB; it's resized before upload.", variant: "destructive" });
      return;
    }
    setCropFile(file);
  }

  async function upload(photo: Blob) {
    const { profile: next } = await accountRequest<{ profile: AccountProfile }>(`${accountApiBase(product)}/me/photo`, {
      method: "PUT",
      headers: { "Content-Type": photo.type || "application/octet-stream" },
      body: photo,
    });
    applyProfile(next);
    setCropFile(null);
    toast({ title: "Photo updated" });
  }

  async function changeSource(source: "provider" | "none") {
    setPhotoBusy(source);
    try {
      const { profile: next } = source === "none"
        ? await accountRequest<{ profile: AccountProfile }>(`${accountApiBase(product)}/me/photo`, { method: "DELETE" })
        : await accountRequest<{ profile: AccountProfile }>(`${accountApiBase(product)}/me`, { method: "PATCH", json: { photoSource: source } });
      applyProfile(next);
      toast({ title: source === "none" ? "Photo removed" : "Using your sign-in photo" });
    } catch (caught) {
      toast({ title: "Couldn't change your photo", description: readableAuthError(caught), variant: "destructive" });
    } finally {
      setPhotoBusy(null);
    }
  }

  return (
    <Card>
      <form onSubmit={save}>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How teammates see you in this product.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="flex flex-wrap items-center gap-4">
            <UserAvatar person={{ uid: profile.uid, name: profile.name, email: profile.email, photoURL: profile.photoURL }} size="2xl" />
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/*"
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={chooseFile}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} disabled={photoBusy !== null}>
                  <Camera /> {profile.photoSource === "upload" ? "Change photo" : "Upload photo"}
                </Button>
                {profile.providerPhotoURL && profile.photoSource !== "provider" ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => changeSource("provider")} disabled={photoBusy !== null}>
                    {photoBusy === "provider" ? <LoaderCircle className="animate-spin" /> : <UserRound />} Use sign-in photo
                  </Button>
                ) : null}
                {profile.photoURL ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(true)} disabled={photoBusy !== null}>
                    {photoBusy === "none" ? <LoaderCircle className="animate-spin" /> : <Trash2 />} Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">Square crop, resized to 256 × 256. PNG, JPEG or WebP.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="account-name">Name</Label>
              <Input id="account-name" value={name} maxLength={80} autoComplete="name" required onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="account-title">Title</Label>
              <Input id="account-title" value={title} maxLength={80} placeholder="e.g. Product designer" autoComplete="organization-title" onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="account-email">Email</Label>
              <Input id="account-email" value={profile.email} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                {profile.emailVerified ? "Confirmed." : "Not confirmed yet. Confirm it under Sign-in methods."}
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || saving || !name.trim()}>
            {saving ? <LoaderCircle className="animate-spin" /> : null} Save profile
          </Button>
        </CardFooter>
      </form>

      <PhotoCropDialog file={cropFile} onOpenChange={(open) => { if (!open) setCropFile(null); }} onCropped={upload} />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your photo?</AlertDialogTitle>
            <AlertDialogDescription>Teammates will see your initials instead. You can add a photo again at any time.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep photo</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void changeSource("none")}>Remove photo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SessionsCard({ product, signInHref, email }: { product: string; signInHref: string; email: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmEverywhere, setConfirmEverywhere] = useState(false);

  async function signOutHere() {
    setBusy("here");
    await signOutOfProduct(product);
    window.location.assign(signInHref);
  }

  async function signOutEverywhere() {
    setBusy("everywhere");
    try {
      await accountRequest(`${accountApiBase(product)}/me/sessions`, { method: "DELETE" });
      await signOutOfProduct(product);
      window.location.assign(signInHref);
    } catch (caught) {
      setBusy(null);
      toast({ title: "Couldn't sign you out everywhere", description: readableAuthError(caught), variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>{email ? `Signed in as ${email}.` : "Your sign-in on this and other devices."}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={signOutHere} disabled={busy !== null}>
          {busy === "here" ? <LoaderCircle className="animate-spin" /> : <LogOut />} Sign out
        </Button>
        <Button variant="destructive" onClick={() => setConfirmEverywhere(true)} disabled={busy !== null}>
          {busy === "everywhere" ? <LoaderCircle className="animate-spin" /> : <MonitorX />} Sign out everywhere
        </Button>
      </CardContent>
      <AlertDialog open={confirmEverywhere} onOpenChange={setConfirmEverywhere}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              Every device and browser signed in to this account, including this one, will need to sign in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void signOutEverywhere()}>Sign out everywhere</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
