"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { captureAnalytics } from "@/lib/analytics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const missionRoles = [
  { value: "Builder", label: "Builder" },
  { value: "Maintainer", label: "Open-source maintainer" },
  { value: "Design partner", label: "Potential design partner" },
  { value: "Funder", label: "Funder or sponsor" },
  { value: "Researcher", label: "Researcher or product lead" },
];

/**
 * "mission" is the original catalog sign-up. "contact" is the site-wide "Talk to us"
 * form used on /contact and the compare pages: same API and validation, different copy,
 * and an extra "Adopter" role for people evaluating a product for their own team.
 */
const copy = {
  mission: {
    roleLabel: "How do you want to contribute?",
    roles: missionRoles,
    notePlaceholder: "Relevant experience, current tool, or what you want to own.",
    consent: "Store my details in Firebase and use my email only to coordinate this mission.",
    submit: "Join this mission",
    success: (targetName: string) =>
      `You are on the ${targetName} mission list. We will coordinate next steps by email.`,
  },
  contact: {
    roleLabel: "What brings you here?",
    roles: [{ value: "Adopter", label: "Evaluating it for my team" }, ...missionRoles],
    notePlaceholder: "Team size, the tool you use today, or what you want to talk about.",
    consent: "Store my details in Firebase and use my email only to reply to this message.",
    submit: "Send message",
    success: () => "Thanks. Your message is in, and we will reply by email.",
  },
} as const;

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function InterestForm({
  target,
  targetName,
  source = "saasassin-catalog",
  variant = "mission",
}: {
  target: string;
  targetName: string;
  source?: string;
  variant?: keyof typeof copy;
}) {
  const [state, setState] = useState<SubmissionState>({ status: "idle" });
  const text = copy[variant];

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const form = event.currentTarget;
    const data = new FormData(form);

    const response = await fetch("/api/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        role: data.get("role"),
        note: data.get("note"),
        website: data.get("website"),
        consent: data.get("consent") === "on",
        source,
        target,
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      captureAnalytics("mission_interest_failed", {
        target,
        source,
        status_code: response.status,
      });
      setState({
        status: "error",
        message: result.error ?? "The submission could not be stored.",
      });
      return;
    }

    captureAnalytics("mission_interest_submitted", {
      target,
      source,
      role: String(data.get("role") ?? "unknown"),
      interview_volunteer: false,
    });
    form.reset();
    setState({
      status: "success",
      message: text.success(targetName),
    });
  }

  if (state.status === "success") {
    return (
      <div className="form-success" role="status">
        <CheckCircle2 aria-hidden="true" size={28} />
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <form className="interest-form ph-no-capture" onSubmit={submitInterest}>
      <div className="form-row">
        <label>
          Name
          <input name="name" type="text" minLength={2} maxLength={80} required />
        </label>
        <label>
          Email
          <input name="email" type="email" maxLength={254} required />
        </label>
      </div>

      <div className="form-field">
        <label id={`role-label-${target}`}>{text.roleLabel}</label>
        <Select name="role" required>
          <SelectTrigger
            className="mission-select-trigger"
            aria-labelledby={`role-label-${target}`}
          >
            <SelectValue placeholder="Select a role" />
          </SelectTrigger>
          <SelectContent
            className="mission-select-content"
            position="popper"
            align="start"
            sideOffset={6}
          >
            {text.roles.map((role) => (
              <SelectItem key={role.value} className="mission-select-item" value={role.value}>
                {role.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <label>
        Useful context <span>Optional</span>
        <textarea
          name="note"
          maxLength={500}
          rows={4}
          placeholder={text.notePlaceholder}
        />
      </label>

      <label className="honeypot" aria-hidden="true">
        Website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="consent-row">
        <input name="consent" type="checkbox" required />
        <span>{text.consent}</span>
      </label>

      {state.status === "error" ? (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <button className="primary-button" type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? "Submitting…" : text.submit}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
