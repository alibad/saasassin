"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";

export function OpsLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/ops/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessKey: formData.get("accessKey") }),
    });

    if (!response.ok) {
      setSubmitting(false);
      setError("That access key was not accepted.");
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form className="ops-login-form" onSubmit={submit}>
      <label>
        Operations access key
        <input
          name="accessKey"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="primary-button" type="submit" disabled={submitting}>
        {submitting ? "Verifying…" : "Open mission control"}
        <ArrowRight aria-hidden="true" size={17} />
      </button>
    </form>
  );
}
