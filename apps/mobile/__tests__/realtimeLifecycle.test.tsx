import { act, render, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";
import MockEventSource from "react-native-sse";
import { AppProviders } from "@/src/providers/AppProviders";
import { useSession } from "@/src/providers/SessionProvider";
import { api } from "@/lib/api/client";

jest.mock("@/lib/api/client", () => {
  const actual = jest.requireActual("@/lib/api/client");
  return {
    ...actual,
    api: { me: jest.fn(), login: jest.fn(), logout: jest.fn(), changePassword: jest.fn() },
  };
});

// Defined inline for babel-plugin-jest-hoist (see realtime.test.ts).
jest.mock("react-native-sse", () => {
  class FakeEventSource {
    static instances: FakeEventSource[] = [];
    url: string;
    options: { headers?: Record<string, string> };
    closed = false;
    constructor(url: string, options: { headers?: Record<string, string> }) {
      this.url = url;
      this.options = options;
      FakeEventSource.instances.push(this);
    }
    addEventListener() {}
    removeAllEventListeners() {}
    close() {
      this.closed = true;
    }
  }
  return { __esModule: true, default: FakeEventSource };
});

type Instance = { url: string; options: { headers?: Record<string, string> }; closed: boolean };
const MockES = MockEventSource as unknown as { instances: Instance[] };

const alex = { id: "u1", name: "Alex", email: "alex@parada.test", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" };
const sam = { id: "u2", name: "Sam", email: "sam@parada.test", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z" };

let session: ReturnType<typeof useSession> | null = null;
function Probe() {
  session = useSession();
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  MockES.instances = [];
  session = null;
  (SecureStore as typeof SecureStore & { __reset: () => void }).__reset();
});

describe("realtime connection follows the signed-in session", () => {
  it("does not open a stream while signed out, opens it with the token after sign-in, and closes it on sign-out", async () => {
    (api.me as jest.Mock).mockRejectedValue(new Error("no token"));
    (api.login as jest.Mock).mockResolvedValue({ user: alex, token: "tok-alex" });
    (api.logout as jest.Mock).mockResolvedValue(undefined);

    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    await waitFor(() => expect(session?.isLoading).toBe(false));

    // Signed out: no bearer token exists yet, so no stream may be opened —
    // a stream created now would carry no Authorization header for its
    // whole lifetime and keep reconnecting unauthenticated.
    expect(MockES.instances).toHaveLength(0);

    await act(async () => {
      await session!.signIn("alex@parada.test", "password123");
    });
    await waitFor(() => expect(MockES.instances).toHaveLength(1));
    expect(MockES.instances[0]!.url).toMatch(/\/realtime\/stream$/);
    expect(MockES.instances[0]!.options.headers?.Authorization).toBe("Bearer tok-alex");
    expect(MockES.instances[0]!.closed).toBe(false);

    await act(async () => {
      await session!.signOut();
    });
    await waitFor(() => expect(MockES.instances[0]!.closed).toBe(true));
    expect(MockES.instances).toHaveLength(1);
  });

  it("re-opens the stream under the new account when a different user signs in on the same device", async () => {
    (api.me as jest.Mock).mockRejectedValue(new Error("no token"));
    (api.logout as jest.Mock).mockResolvedValue(undefined);
    (api.login as jest.Mock)
      .mockResolvedValueOnce({ user: alex, token: "tok-alex" })
      .mockResolvedValueOnce({ user: sam, token: "tok-sam" });

    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    await waitFor(() => expect(session?.isLoading).toBe(false));

    await act(async () => {
      await session!.signIn("alex@parada.test", "password123");
    });
    await waitFor(() => expect(MockES.instances).toHaveLength(1));
    await act(async () => {
      await session!.signOut();
    });
    await act(async () => {
      await session!.signIn("sam@parada.test", "password123");
    });

    await waitFor(() => expect(MockES.instances).toHaveLength(2));
    expect(MockES.instances[0]!.closed).toBe(true);
    expect(MockES.instances[1]!.options.headers?.Authorization).toBe("Bearer tok-sam");
    expect(MockES.instances[1]!.closed).toBe(false);
  });

  it("re-opens the stream with the fresh token after a password change (the server drops the old stream)", async () => {
    (api.me as jest.Mock).mockRejectedValue(new Error("no token"));
    (api.login as jest.Mock).mockResolvedValueOnce({ user: alex, token: "tok-alex" });
    (api.changePassword as jest.Mock).mockResolvedValueOnce({ user: alex, token: "tok-alex-2" });

    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );
    await waitFor(() => expect(session?.isLoading).toBe(false));
    await act(async () => {
      await session!.signIn("alex@parada.test", "password123");
    });
    await waitFor(() => expect(MockES.instances).toHaveLength(1));
    expect(MockES.instances[0]!.options.headers?.Authorization).toBe("Bearer tok-alex");

    await act(async () => {
      await session!.changePassword("password123", "password456");
    });

    await waitFor(() => expect(MockES.instances).toHaveLength(2));
    expect(MockES.instances[0]!.closed).toBe(true);
    expect(MockES.instances[1]!.options.headers?.Authorization).toBe("Bearer tok-alex-2");
    expect(MockES.instances[1]!.closed).toBe(false);
    expect(session!.token).toBe("tok-alex-2");
  });

  it("opens the stream on launch when a stored token is still valid", async () => {
    await SecureStore.setItemAsync("parada.session.token", "tok-stored");
    (api.me as jest.Mock).mockResolvedValue(alex);

    render(
      <AppProviders>
        <Probe />
      </AppProviders>,
    );

    await waitFor(() => expect(MockES.instances).toHaveLength(1));
    expect(MockES.instances[0]!.options.headers?.Authorization).toBe("Bearer tok-stored");
  });
});
