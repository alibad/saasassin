import type { Metadata } from "next";

import { OpsLogin } from "@/components/ops-login";
import { OpsLogout } from "@/components/ops-logout";
import { isOpsAuthenticated } from "@/lib/ops-auth";
import { getOpsSnapshot } from "@/lib/ops-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mission control",
  robots: { index: false, follow: false },
};

function displayDate(value: string) {
  if (value === "Pending") return value;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Qatar",
  }).format(new Date(value));
}

export default async function OpsPage() {
  const authenticated = await isOpsAuthenticated();

  if (!authenticated) {
    return (
      <main className="ops-shell">
        <div className="shell">
          <section className="ops-login-card">
            <p className="eyebrow">Restricted operations</p>
            <h1>Mission control.</h1>
            <p>
              Applicant details stay behind a server-verified session and are never
              shipped to the public Firebase client.
            </p>
            <OpsLogin />
          </section>
        </div>
      </main>
    );
  }

  const snapshot = await getOpsSnapshot();

  return (
    <main className="ops-shell">
      <div className="shell">
        <header className="ops-heading">
          <div>
            <p className="eyebrow">Mission 01 operations</p>
            <h1>Recruitment queue.</h1>
            <p>Latest 100 applications. Counts reflect the records shown below.</p>
          </div>
          <OpsLogout />
        </header>

        <section className="ops-metrics" aria-label="Recruitment metrics">
          <div>
            <strong>{snapshot.totals.applications}</strong>
            <span>applications</span>
          </div>
          <div>
            <strong>{snapshot.totals.designPartners}</strong>
            <span>design partners</span>
          </div>
          <div>
            <strong>{snapshot.totals.builders}</strong>
            <span>builders</span>
          </div>
          <div>
            <strong>{snapshot.totals.interviews}</strong>
            <span>interview volunteers</span>
          </div>
        </section>

        <section className="ops-panel">
          <div className="ops-panel-header">
            <h2>Application inbox</h2>
            <span className="ops-kicker">
              {snapshot.configured ? "Live from Firestore" : "Firebase unavailable"}
            </span>
          </div>
          {snapshot.records.length ? (
            <div className="ops-table-wrap">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Applicant</th>
                    <th>Role</th>
                    <th>Current tool</th>
                    <th>Migration window</th>
                    <th>Interview</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.records.map((record) => (
                    <tr key={record.id}>
                      <td>{displayDate(record.createdAt)}</td>
                      <td>
                        <strong>{record.name}</strong>
                        <br />
                        <a href={`mailto:${record.email}`}>{record.email}</a>
                        <br />
                        <span>{record.company}</span>
                      </td>
                      <td>{record.role}</td>
                      <td>{record.currentTool}</td>
                      <td>{record.migrationWindow}</td>
                      <td>{record.interviewConsent ? "Yes" : "No"}</td>
                      <td>{record.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ops-empty">No applications are in the queue yet.</p>
          )}
        </section>
      </div>
    </main>
  );
}
