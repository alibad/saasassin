import { describe, expect, it } from "vitest";

import {
  EmulatorConfigurationError,
  resolveClientAuthEmulator,
  resolveServerEmulators,
} from "../src/lib/firebase/emulators";

const hosts = { authHost: "127.0.0.1:9177", firestoreHost: "127.0.0.1:8177" };

describe("server emulator wiring", () => {
  it("stays off when no emulator host is set", () => {
    expect(resolveServerEmulators({ nodeEnv: "development", projectId: "saasassin-net", authHost: undefined, firestoreHost: undefined })).toBeNull();
    expect(resolveServerEmulators({ nodeEnv: "development", projectId: "demo-x", authHost: "", firestoreHost: " " })).toBeNull();
  });

  it("never activates in a production build", () => {
    expect(resolveServerEmulators({ nodeEnv: "production", projectId: "demo-x", ...hosts })).toBeNull();
    expect(resolveServerEmulators({ nodeEnv: "production", projectId: "saasassin-net", ...hosts })).toBeNull();
  });

  it("targets both emulators for a demo- project", () => {
    expect(resolveServerEmulators({ nodeEnv: "development", projectId: "demo-performance", ...hosts })).toEqual({
      projectId: "demo-performance",
      ...hosts,
    });
  });

  it("refuses a real project id or a half-configured environment", () => {
    expect(() => resolveServerEmulators({ nodeEnv: "development", projectId: "saasassin-net", ...hosts })).toThrow(EmulatorConfigurationError);
    expect(() => resolveServerEmulators({ nodeEnv: "development", projectId: undefined, ...hosts })).toThrow(/demo-/);
    expect(() => resolveServerEmulators({ nodeEnv: "development", projectId: "demo-x", authHost: hosts.authHost, firestoreHost: undefined })).toThrow(/both/);
    expect(() => resolveServerEmulators({ nodeEnv: "development", projectId: "demo-x", authHost: undefined, firestoreHost: hosts.firestoreHost })).toThrow(/both/);
  });
});

describe("browser Auth emulator wiring", () => {
  it("stays off without a host and in production", () => {
    expect(resolveClientAuthEmulator({ nodeEnv: "development", projectId: "saasassin-net", authHost: undefined })).toBeNull();
    expect(resolveClientAuthEmulator({ nodeEnv: "production", projectId: "demo-x", authHost: hosts.authHost })).toBeNull();
  });

  it("returns an http URL for a demo- project and refuses a real one", () => {
    expect(resolveClientAuthEmulator({ nodeEnv: "development", projectId: "demo-x", authHost: hosts.authHost })).toBe("http://127.0.0.1:9177");
    expect(resolveClientAuthEmulator({ nodeEnv: "development", projectId: "demo-x", authHost: "http://localhost:9177" })).toBe("http://localhost:9177");
    expect(() => resolveClientAuthEmulator({ nodeEnv: "development", projectId: "saasassin-net", authHost: hosts.authHost })).toThrow(EmulatorConfigurationError);
  });
});
