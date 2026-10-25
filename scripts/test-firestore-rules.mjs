import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const environment = { ...process.env };

if (process.platform === "darwin" && existsSync("/usr/libexec/java_home")) {
  try {
    const javaHome = execFileSync("/usr/libexec/java_home", ["-v", "21+"], {
      encoding: "utf8",
    }).trim();

    environment.JAVA_HOME = javaHome;
    environment.PATH = `${path.join(javaHome, "bin")}:${environment.PATH ?? ""}`;
  } catch {
    // Let the Firebase CLI provide its actionable Java version error below.
  }
}

const firebaseBinary = path.join(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "firebase.cmd" : "firebase",
);

const result = spawnSync(
  firebaseBinary,
  [
    "emulators:exec",
    "--only",
    "firestore",
    "pnpm exec vitest run --config vitest.rules.config.mjs",
  ],
  {
    cwd: projectRoot,
    env: environment,
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
