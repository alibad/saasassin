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

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function InterestForm({
  target,
  targetName,
  source = "saasassin-catalog",
}: {
  target: string;
  targetName: string;
  source?: string;
}) {
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

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
      message: `You are on the ${targetName} mission list. We will coordinate next steps by email.`,
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
        <label id={`role-label-${target}`}>How do you want to contribute?</label>
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
            <SelectItem className="mission-select-item" value="Builder">
              Builder
            </SelectItem>
            <SelectItem className="mission-select-item" value="Maintainer">
              Open-source maintainer
            </SelectItem>
            <SelectItem className="mission-select-item" value="Design partner">
              Potential design partner
            </SelectItem>
            <SelectItem className="mission-select-item" value="Funder">
              Funder or sponsor
            </SelectItem>
            <SelectItem className="mission-select-item" value="Researcher">
              Researcher or product lead
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <label>
        Useful context <span>Optional</span>
        <textarea
          name="note"
          maxLength={500}
          rows={4}
          placeholder="Relevant experience, current tool, or what you want to own."
        />
      </label>

      <label className="honeypot" aria-hidden="true">
        Website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="consent-row">
        <input name="consent" type="checkbox" required />
        <span>
          Store my details in Firebase and use my email only to coordinate this
          mission.
        </span>
      </label>

      {state.status === "error" ? (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <button className="primary-button" type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? "Submitting…" : "Join this mission"}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
