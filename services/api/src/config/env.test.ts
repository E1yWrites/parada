import "dotenv/config";

const BASE = {
  DATABASE_URL: "postgresql://parada:changeme@127.0.0.1:5442/parada_test_api?schema=public",
  JWT_SECRET: "test-secret-key-for-testing-only-32chars",
};

describe("loadEnv — camera API key production enforcement", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ...BASE };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("throws when NODE_ENV is production and CAMERA_API_KEY is unset", () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["CAMERA_API_KEY"];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnv } = require("./env");
    expect(() => loadEnv()).toThrow(/CAMERA_API_KEY/);
  });

  it("does not throw in production when CAMERA_API_KEY is set", () => {
    process.env["NODE_ENV"] = "production";
    process.env["CAMERA_API_KEY"] = "a-real-secret";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnv } = require("./env");
    expect(() => loadEnv()).not.toThrow();
  });

  it("does not require CAMERA_API_KEY outside production", () => {
    process.env["NODE_ENV"] = "development";
    delete process.env["CAMERA_API_KEY"];
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnv } = require("./env");
    expect(() => loadEnv()).not.toThrow();
  });

  // A blank CAMERA_API_KEY (as shipped in .env.example) previously loaded as
  // "" rather than null. "" is non-null, so eventsRouter enforced a key that no
  // caller could match and every camera event was rejected with 401 — while the
  // production guard still passed because "" is falsy. Blank means unset.
  it.each(["", "   "])("treats a blank CAMERA_API_KEY (%p) as unset", (blank) => {
    process.env["NODE_ENV"] = "development";
    process.env["CAMERA_API_KEY"] = blank;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnv } = require("./env");
    expect(loadEnv().cameraApiKey).toBeNull();
  });

  it("trims a configured CAMERA_API_KEY", () => {
    process.env["NODE_ENV"] = "development";
    process.env["CAMERA_API_KEY"] = "  a-real-secret  ";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnv } = require("./env");
    expect(loadEnv().cameraApiKey).toBe("a-real-secret");
  });

  it("still refuses to start in production when CAMERA_API_KEY is blank", () => {
    process.env["NODE_ENV"] = "production";
    process.env["CAMERA_API_KEY"] = "   ";
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadEnv } = require("./env");
    expect(() => loadEnv()).toThrow(/CAMERA_API_KEY/);
  });
});
