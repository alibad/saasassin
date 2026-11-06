"use client";

import { BellOff, ExternalLink, MailX, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { parseListUnsubscribe } from "@/lib/mail/unsubscribe";

import type { Message } from "./mail-api";
import type { ComposeSeed } from "./mail-dialogs";
import styles from "./mail.module.css";

/**
 * Shows where a newsletter says you can unsubscribe. Nothing is requested automatically: the web
 * link opens only when clicked (no referrer), and the mailto target becomes a normal draft.
 */
export function UnsubscribeHelper({
  messages,
  readOnly,
  onDraft,
  onMute,
}: {
  messages: Message[];
  readOnly: boolean;
  onDraft: (seed: ComposeSeed) => void;
  onMute: (() => void) | null;
}) {
  const latest = [...messages].reverse().find((message) => message.listUnsubscribe);
  const targets = latest ? parseListUnsubscribe(latest.listUnsubscribe, latest.listUnsubscribePost) : null;
  if (!latest) return null;

  return (
    <aside className={styles.unsubscribe} aria-label="Unsubscribe">
      <p className="flex items-center gap-2 font-medium"><MailX aria-hidden="true" className="size-4" /> This sender lists a way to unsubscribe</p>
      {targets ? (
        <>
          <div className="flex flex-wrap gap-2">
            {targets.web ? (
              <Button asChild size="sm" variant="outline">
                <a href={targets.web.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
                  <ExternalLink /> Open unsubscribe page ({targets.web.host})
                </a>
              </Button>
            ) : null}
            {targets.mailto ? (
              <Button
                size="sm"
                variant="outline"
                disabled={readOnly}
                onClick={() => onDraft({ threadId: null, to: targets.mailto!.address, cc: "", subject: targets.mailto!.subject, body: targets.mailto!.body })}
              >
                <PenLine /> Draft unsubscribe email to {targets.mailto.address}
              </Button>
            ) : null}
            {onMute ? <Button size="sm" variant="ghost" disabled={readOnly} onClick={onMute}><BellOff /> Mute instead</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            SaaSassin never contacts the sender for you{targets.oneClick ? " (the sender supports one-click unsubscribe; that request is only made if you use their page)" : ""}.
            {targets.web && !targets.web.secure ? " The link is not encrypted (http)." : ""}
            {targets.mailto ? " An unsubscribe email is saved as a draft; sending needs a connected provider." : ""}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">The List-Unsubscribe header has no usable mailto or web link, so there is nothing safe to show.</p>
      )}
    </aside>
  );
}
