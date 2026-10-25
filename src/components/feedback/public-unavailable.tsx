import Link from "next/link";

import styles from "./feedback.module.css";

export function PublicUnavailable({ message }: { message: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.panel}>
          <p className={styles.eyebrow}>SaaSassin Feedback</p>
          <h1 className={styles.title}>Temporarily unavailable</h1>
          <p className={styles.lede}>{message}</p>
          <p className="mt-4"><Link className="underline" href="/apps/feedback">Go to SaaSassin Feedback</Link></p>
        </div>
      </div>
    </main>
  );
}
