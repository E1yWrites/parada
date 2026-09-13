import { act, render, screen, waitFor } from "@testing-library/react";
import { Providers } from "@/components/providers/providers";
import { useAuth } from "@/components/providers/auth-provider";
import { ApiError } from "@/lib/api/client";

const mockRouter = { replace: jest.fn(), refresh: jest.fn() };

jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

jest.mock("@/lib/api/client", () => {
  const { ApiError } = jest.requireActual("@/lib/api/client");
  return {
    ApiError,
    api: { me: jest.fn(), login: jest.fn(), logout: jest.fn() },
  };
});

const api = jest.requireMock("@/lib/api/client").api;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

let auth: ReturnType<typeof useAuth> | null = null;
function Probe() {
  auth = useAuth();
  return <span data-testid="user">{auth.user ? auth.user.email : "null"}</span>;
}

const admin = { id: "a1", name: "Ops", email: "admin@parada.local", role: "ADMIN" };
const otherAdmin = { id: "a2", name: "Ops 2", email: "ops2@parada.local", role: "ADMIN" };

beforeEach(() => {
  jest.clearAllMocks();
  FakeEventSource.instances = [];
  auth = null;
  (global as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
});

describe("admin realtime connection follows the admin session", () => {
  it("opens the relay only after sign-in (a pre-login EventSource would fail on 401 and never retry) and closes it on sign-out", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Not authenticated.", 401));
    (api.login as jest.Mock).mockResolvedValue(admin);
    (api.logout as jest.Mock).mockResolvedValue(undefined);

    render(
      <Providers>
        <Probe />
      </Providers>
    );
    await waitFor(() => expect(auth?.loading).toBe(false));
    expect(FakeEventSource.instances).toHaveLength(0);

    await act(async () => {
      await auth!.signIn("admin@parada.local", "AdminPass123!");
    });
    await waitFor(() => expect(screen.getByTestId("user").textContent).toBe("admin@parada.local"));
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    expect(FakeEventSource.instances[0]!.url).toBe("/api/realtime");
    expect(FakeEventSource.instances[0]!.closed).toBe(false);

    await act(async () => {
      await auth!.signOut();
    });
    await waitFor(() => expect(FakeEventSource.instances[0]!.closed).toBe(true));
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("re-opens the relay for a different administrator on the same browser session", async () => {
    (api.me as jest.Mock).mockRejectedValue(new ApiError("UNAUTHORIZED", "Not authenticated.", 401));
    (api.logout as jest.Mock).mockResolvedValue(undefined);
    (api.login as jest.Mock).mockResolvedValueOnce(admin).mockResolvedValueOnce(otherAdmin);

    render(
      <Providers>
        <Probe />
      </Providers>
    );
    await waitFor(() => expect(auth?.loading).toBe(false));

    await act(async () => {
      await auth!.signIn("admin@parada.local", "AdminPass123!");
    });
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    await act(async () => {
      await auth!.signOut();
    });
    await act(async () => {
      await auth!.signIn("ops2@parada.local", "AdminPass123!");
    });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
    expect(FakeEventSource.instances[1]!.closed).toBe(false);
  });

  it("never opens the relay for a non-admin account", async () => {
    (api.me as jest.Mock).mockResolvedValue({ ...admin, role: "USER" });

    render(
      <Providers>
        <Probe />
      </Providers>
    );
    await waitFor(() => expect(auth?.loading).toBe(false));
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});
