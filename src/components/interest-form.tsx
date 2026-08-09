"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

type SubmissionState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function InterestForm({ target, targetName }: { target: string; targetName: string }) {
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
        company: data.get("company"),
        consent: data.get("consent") === "on",
        target,
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setState({
        status: "error",
        message: result.error ?? "The submission could not be stored.",
      });
      return;
    }

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
    <form className="interest-form" onSubmit={submitInterest}>
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

      <label>
        How do you want to contribute?
        <select name="role" defaultValue="" required>
          <option value="" disabled>
            Select a role
          </option>
          <option value="Builder">Builder</option>
          <option value="Maintainer">Open-source maintainer</option>
          <option value="Design partner">Potential design partner</option>
          <option value="Funder">Funder or sponsor</option>
          <option value="Researcher">Researcher or product lead</option>
        </select>
      </label>

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
        Company
        <input name="company" type="text" tabIndex={-1} autoComplete="off" />
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
