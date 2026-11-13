/**
 * Local Firebase emulator wiring, for development and demo recordings only.
 *
 * The browser Auth client and the Admin SDK switch to the Auth and Firestore
 * emulators only when ALL of these hold:
 * - the build is not a production build;
 * - explicit emulator hosts are set;
 * - the project id starts with `demo-`, a prefix Firebase reserves for projects
 *   that can never exist in the cloud.
 *
 * With the emulator variables unset this module returns `null` and nothing
 * changes. A half-configured environment (one emulator host without the other,
 * or a real project id) throws instead of quietly mixing emulator and
 * production traffic.
 */

export const DEMO_PROJECT_PREFIX = "demo-";

export type ServerEmulatorEnvironment = {
  nodeEnv: string | undefined;
  projectId: string | undefined;
  authHost: string | undefined;
  firestoreHost: string | undefined;
};

export type ServerEmulatorTarget = {
  projectId: string;
  authHost: string;
  firestoreHost: string;
};

export type ClientEmulatorEnvironment = {
  nodeEnv: string | undefined;
  projectId: string | undefined;
  authHost: string | undefined;
};

export class EmulatorConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmulatorConfigurationError";
  }
}

function requireDemoProject(projectId: string | undefined) {
  if (!projectId?.startsWith(DEMO_PROJECT_PREFIX)) {
    throw new EmulatorConfigurationError(
      `Firebase emulator hosts are set, but the project id "${projectId ?? ""}" does not start with "${DEMO_PROJECT_PREFIX}". Refusing to mix emulator and production configuration.`,
    );
  }
  return projectId;
}

/** Server side (Admin SDK): both Auth and Firestore emulators, or neither. */
export function resolveServerEmulators(env: ServerEmulatorEnvironment): ServerEmulatorTarget | null {
  if (env.nodeEnv === "production") return null;
  const authHost = env.authHost?.trim() ?? "";
  const firestoreHost = env.firestoreHost?.trim() ?? "";
  if (!authHost && !firestoreHost) return null;
  if (!authHost || !firestoreHost) {
    throw new EmulatorConfigurationError(
      "Set both FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST, or neither.",
    );
  }
  return { projectId: requireDemoProject(env.projectId), authHost, firestoreHost };
}

/** Browser side (Auth client): the URL to pass to connectAuthEmulator, or null. */
export function resolveClientAuthEmulator(env: ClientEmulatorEnvironment): string | null {
  if (env.nodeEnv === "production") return null;
  const authHost = env.authHost?.trim() ?? "";
  if (!authHost) return null;
  requireDemoProject(env.projectId);
  return authHost.startsWith("http://") ? authHost : `http://${authHost}`;
}
