import * as SessionStore from "expo-secure-store";

const SECURE_KEY = "parada.session.token";

export type SecureStoreLike = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

let vault: SecureStoreLike = SessionStore;

/**
 * Install an alternate keystore backend. Production always uses
 * expo-secure-store; tests may substitute an in-memory implementation.
 */
export function configureSecureStore(store: SecureStoreLike): void {
  vault = store;
}

export async function getToken(): Promise<string | null> {
  return vault.getItemAsync(SECURE_KEY);
}

export async function setToken(token: string): Promise<void> {
  await vault.setItemAsync(SECURE_KEY, token);
}

export async function clearToken(): Promise<void> {
  await vault.deleteItemAsync(SECURE_KEY);
}

type AuthInvalidationListener = () => void;

const listeners = new Set<AuthInvalidationListener>();

/** Subscribe to global session-invalidation events (fires on 401). */
export function onAuthInvalidated(listener: AuthInvalidationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Broadcast that the stored token is no longer valid (clears it locally). */
export async function notifyAuthInvalidated(): Promise<void> {
  await clearToken();
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // A failing listener must never block invalidation propagation.
    }
  });
}