/**
 * Provider adapter boundary. Gmail and Microsoft Graph adapters need OAuth clients that have
 * passed provider review (restricted Gmail scopes, Microsoft publisher verification). Until
 * those credentials exist, every adapter reports "not_configured" and the product works on
 * imported mail only — no sync or send is ever simulated.
 */

export type ProviderId = "gmail" | "microsoft";

export type ProviderStatus = {
  id: ProviderId;
  name: string;
  status: "not_configured";
  sync: false;
  send: false;
  requirement: string;
};

export interface MailProviderAdapter {
  id: ProviderId;
  name: string;
  status(): ProviderStatus;
  /** Incremental sync from a cursor; resolves with new raw RFC 822 messages. */
  sync(cursor: string | null): Promise<{ cursor: string; rawMessages: string[] }>;
  /** Idempotent send keyed by the draft id. */
  send(input: { idempotencyKey: string; raw: string }): Promise<{ providerMessageId: string }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(name: string) {
    super(`${name} connection is not configured for this deployment.`);
    this.name = "ProviderNotConfiguredError";
  }
}

function unconfigured(id: ProviderId, name: string, requirement: string): MailProviderAdapter {
  const status: ProviderStatus = { id, name, status: "not_configured", sync: false, send: false, requirement };
  return {
    id,
    name,
    status: () => status,
    sync: async () => {
      throw new ProviderNotConfiguredError(name);
    },
    send: async () => {
      throw new ProviderNotConfiguredError(name);
    },
  };
}

export const MAIL_PROVIDERS: MailProviderAdapter[] = [
  unconfigured("gmail", "Gmail", "Needs a Google OAuth client with verified restricted Gmail scopes (gmail.modify, gmail.send) and a security assessment."),
  unconfigured("microsoft", "Microsoft 365 / Outlook", "Needs a verified Microsoft Entra app registration with Mail.ReadWrite and Mail.Send delegated permissions."),
];

export function providerStatuses() {
  return MAIL_PROVIDERS.map((provider) => provider.status());
}

export const SEND_NOT_CONFIGURED =
  "Sending provider not configured: no Gmail or Microsoft account can send from this workspace yet. Your draft is saved and nothing was sent.";
