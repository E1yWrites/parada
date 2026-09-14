import { File, Paths } from "expo-file-system";

/**
 * First-launch onboarding flag. Lives as a small marker file in the app's
 * document directory, which is created on install and removed on uninstall on
 * both platforms — exactly the "show once per installation" lifetime. It is
 * deliberately NOT in SecureStore: the iOS keychain survives reinstalls, and
 * onboarding is not a secret.
 */
const MARKER_NAME = "parada.onboarding-completed";

export type OnboardingStoreLike = {
  read: () => Promise<boolean>;
  write: () => Promise<void>;
  clear: () => Promise<void>;
};

function marker(): File {
  return new File(Paths.document, MARKER_NAME);
}

const fileStore: OnboardingStoreLike = {
  async read() {
    return marker().exists;
  },
  async write() {
    const file = marker();
    if (!file.exists) {
      file.create();
    }
    file.write(new Date().toISOString());
  },
  async clear() {
    const file = marker();
    if (file.exists) {
      file.delete();
    }
  },
};

let store: OnboardingStoreLike = fileStore;

/** Tests may substitute a store (null restores the document-directory one). */
export function configureOnboardingStore(next: OnboardingStoreLike | null): void {
  store = next ?? fileStore;
}

/** True once the user finished or skipped onboarding on this installation. */
export async function isOnboardingCompleted(): Promise<boolean> {
  try {
    return await store.read();
  } catch {
    // An unreadable marker must not trap the user in onboarding forever, nor
    // silently skip it: treat it as "not completed" so it can be re-recorded.
    return false;
  }
}

export async function markOnboardingCompleted(): Promise<void> {
  try {
    await store.write();
  } catch {
    // Best effort: the user still proceeds to login; the marker is retried on
    // the next completion.
  }
}

/** Only for a legitimate reset path (e.g. tests); the app never calls this from UI. */
export async function resetOnboarding(): Promise<void> {
  await store.clear();
}
