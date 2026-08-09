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

export function MissionInterestForm() {
  const [state, setState] = useState<SubmissionState>({ status: "idle" });

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "submitting" });

    const form = event.currentTarget;
    const data = new FormData(form);
    const interviewConsent = data.get("interviewConsent") === "on";
    const role = String(data.get("role") ?? "unknown");

    const response = await fetch("/api/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        email: data.get("email"),
        company: data.get("company"),
        role,
        currentTool: data.get("currentTool"),
        teamSize: data.get("teamSize"),
        migrationWindow: data.get("migrationWindow"),
        note: data.get("note"),
        website: data.get("website"),
        consent: data.get("consent") === "on",
        interviewConsent,
        source: "canny-fider-mission",
        target: "canny",
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      captureAnalytics("mission_interest_failed", {
        target: "canny",
        source: "canny-fider-mission",
        status_code: response.status,
      });
      setState({
        status: "error",
        message: result.error ?? "The submission could not be stored.",
      });
      return;
    }

    captureAnalytics("mission_interest_submitted", {
      target: "canny",
      source: "canny-fider-mission",
      role,
      interview_volunteer: interviewConsent,
    });
    form.reset();
    setState({
      status: "success",
      message:
        "You are in the Mission 01 review queue. Qualified builders and design partners will receive a focused follow-up.",
    });
  }

  if (state.status === "success") {
    return (
      <div className="form-success mission-form-success" role="status">
        <CheckCircle2 aria-hidden="true" size={28} />
        <p>{state.message}</p>
      </div>
    );
  }

  return (
    <form className="interest-form mission-interest-form ph-no-capture" onSubmit={submitInterest}>
      <div className="form-row">
        <label>
          Name
          <input name="name" type="text" minLength={2} maxLength={80} required />
        </label>
        <label>
          Work email
          <input name="email" type="email" maxLength={254} required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Company or project <span>Optional</span>
          <input name="company" type="text" maxLength={120} />
        </label>
        <div className="form-field">
          <label id="mission-role-label">How will you help?</label>
          <Select name="role" required>
            <SelectTrigger
              className="mission-select-trigger"
              aria-labelledby="mission-role-label"
            >
              <SelectValue placeholder="Select a role" />
            </SelectTrigger>
            <SelectContent
              className="mission-select-content"
              position="popper"
              align="start"
              sideOffset={6}
            >
              <SelectItem className="mission-select-item" value="Design partner">
                Canny design partner
              </SelectItem>
              <SelectItem className="mission-select-item" value="Builder">
                Builder
              </SelectItem>
              <SelectItem className="mission-select-item" value="Maintainer">
                Open-source maintainer
              </SelectItem>
              <SelectItem className="mission-select-item" value="Researcher">
                Product or migration researcher
              </SelectItem>
              <SelectItem className="mission-select-item" value="Funder">
                Sponsor
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="form-row">
        <label>
          Current feedback tool
          <input name="currentTool" type="text" maxLength={80} defaultValue="Canny" />
        </label>
        <div className="form-field">
          <label id="team-size-label">Feedback workspace size</label>
          <Select name="teamSize" defaultValue="Not sure">
            <SelectTrigger
              className="mission-select-trigger"
              aria-labelledby="team-size-label"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              className="mission-select-content"
              position="popper"
              align="start"
              sideOffset={6}
            >
              <SelectItem className="mission-select-item" value="Not sure">
                Not sure
              </SelectItem>
              <SelectItem className="mission-select-item" value="1–5 admins">
                1–5 admins
              </SelectItem>
              <SelectItem className="mission-select-item" value="6–20 admins">
                6–20 admins
              </SelectItem>
              <SelectItem className="mission-select-item" value="21+ admins">
                21+ admins
              </SelectItem>
              <SelectItem className="mission-select-item" value="Open-source community">
                Open-source community
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="form-field">
        <label id="migration-window-label">When could you test a migration?</label>
        <Select name="migrationWindow">
          <SelectTrigger
            className="mission-select-trigger"
            aria-labelledby="migration-window-label"
          >
            <SelectValue placeholder="Select a window" />
          </SelectTrigger>
          <SelectContent
            className="mission-select-content"
            position="popper"
            align="start"
            sideOffset={6}
          >
            <SelectItem className="mission-select-item" value="Within 30 days">
              Within 30 days
            </SelectItem>
            <SelectItem className="mission-select-item" value="Within 90 days">
              Within 90 days
            </SelectItem>
            <SelectItem className="mission-select-item" value="This year">
              This year
            </SelectItem>
            <SelectItem className="mission-select-item" value="Research only">
              Research only
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
          placeholder="Export size, must-keep data, technical experience, or the piece you could own."
        />
      </label>

      <label className="honeypot" aria-hidden="true">
        Website
        <input name="website" type="text" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="consent-row">
        <input name="interviewConsent" type="checkbox" />
        <span>I can join a focused 30-minute Canny migration interview.</span>
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
        {state.status === "submitting" ? "Submitting…" : "Apply to Mission 01"}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
