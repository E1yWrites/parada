import fs from "fs";
import os from "os";
import path from "path";

const { isLocalDevApiUrl, readEnvValue, main } = require("../scripts/set-lan-ip");

describe("set-lan-ip: which EXPO_PUBLIC_API_URL values it may rewrite", () => {
  it.each([
    "http://localhost:4100",
    "http://127.0.0.1:4100",
    "http://[::1]:4100",
    "http://10.0.2.2:4100",
    "http://192.168.1.100:4100",
    "http://172.20.0.5:4100",
    "http://169.254.3.4:4100/",
    "http://192.168.1.100",
  ])("rewrites local dev URL %s", (url) => {
    expect(isLocalDevApiUrl(url)).toBe(true);
  });

  it.each([
    "https://api.example.com",
    "https://192.168.1.10:4100",
    "http://api.example.com:4100",
    "http://8.8.8.8:4100",
    "http://172.32.0.1:4100",
    "http://192.168.1.10:4100/api",
  ])("keeps deliberate URL %s", (url) => {
    expect(isLocalDevApiUrl(url)).toBe(false);
  });

  it("reads quoted CRLF values and ignores commented-out keys", () => {
    const env = '# EXPO_PUBLIC_API_URL=http://1.2.3.4:9\r\nEXPO_PUBLIC_API_URL="https://api.example.com"\r\n';
    expect(readEnvValue(env, "EXPO_PUBLIC_API_URL")).toBe("https://api.example.com");
    expect(readEnvValue(env, "REACT_NATIVE_PACKAGER_HOSTNAME")).toBeNull();
  });
});

describe("set-lan-ip main()", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "set-lan-ip-"));
    jest.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const read = (name: string) => fs.readFileSync(path.join(dir, name), "utf8");

  it("keeps an https ONLINE URL but still pins the packager host", () => {
    fs.writeFileSync(path.join(dir, ".env"), "EXPO_PUBLIC_API_URL=https://api.example.com\n");
    main({ dir, override: "192.168.1.50" });
    expect(read(".env")).toBe("EXPO_PUBLIC_API_URL=https://api.example.com\n");
    expect(read(".env.local")).toBe("REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.50\n");
  });

  it("rewrites a loopback URL to the LAN address and keeps its port", () => {
    fs.writeFileSync(path.join(dir, ".env"), "# api\nEXPO_PUBLIC_API_URL=http://localhost:4200\n");
    main({ dir, override: "192.168.1.50" });
    expect(read(".env")).toBe("# api\nEXPO_PUBLIC_API_URL=http://192.168.1.50:4200\n");
  });
});
