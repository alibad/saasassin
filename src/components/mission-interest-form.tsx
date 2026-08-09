"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { captureAnalytics } from "@/lib/analytics";

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
        <label>
          How will you help?
          <select name="role" defaultValue="" required>
            <option value="" disabled>
              Select a role
            </option>
            <option value="Design partner">Canny design partner</option>
            <option value="Builder">Builder</option>
            <option value="Maintainer">Open-source maintainer</option>
            <option value="Researcher">Product or migration researcher</option>
            <option value="Funder">Sponsor</option>
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          Current feedback tool
          <input name="currentTool" type="text" maxLength={80} defaultValue="Canny" />
        </label>
        <label>
          Feedback workspace size
          <select name="teamSize" defaultValue="">
            <option value="">Not sure</option>
            <option value="1–5 admins">1–5 admins</option>
            <option value="6–20 admins">6–20 admins</option>
            <option value="21+ admins">21+ admins</option>
            <option value="Open-source community">Open-source community</option>
          </select>
        </label>
      </div>

      <label>
        When could you test a migration?
        <select name="migrationWindow" defaultValue="">
          <option value="">Select a window</option>
          <option value="Within 30 days">Within 30 days</option>
          <option value="Within 90 days">Within 90 days</option>
          <option value="This year">This year</option>
          <option value="Research only">Research only</option>
        </select>
      </label>

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
