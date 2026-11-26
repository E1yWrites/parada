import { File, Paths } from "expo-file-system";
import { api } from "@/lib/api/client";

/**
 * First-run tutorial after sign-up. It shows when a driver signs in with no
 * active vehicle and has not finished or skipped it on this installation.
 * The marker is per account (a hash of the email, so no address is written
 * to disk) and lives in the document directory like the onboarding marker.
 */
export type TutorialStoreLike = {
  read: (key: string) => Promise<boolean>;
  write: (key: string) => Promise<void>;
};

/** djb2 — a stable, non-cryptographic file-name key; not a secret. */
export function tutorialKey(email: string): string {
  let hash = 5381;
  for (const ch of email.trim().toLowerCase()) {
    hash = ((hash << 5) + hash + ch.charCodeAt(0)) >>> 0;
  }
  return `parada.tutorial-done.${hash.toString(36)}`;
}

const fileStore: TutorialStoreLike = {
  async read(key) {
    return new File(Paths.document, key).exists;
  },
  async write(key) {
    const file = new File(Paths.document, key);
    if (!file.exists) file.create();
    await file.write(new Date().toISOString());
  },
};

let store: TutorialStoreLike = fileStore;

/** Tests may substitute a store (null restores the document-directory one). */
export function configureTutorialStore(next: TutorialStoreLike | null): void {
  store = next ?? fileStore;
}

/** Never blocks sign-in: any failure means "go straight to the app". */
export async function shouldShowTutorial(email: string): Promise<boolean> {
  try {
    if (await store.read(tutorialKey(email))) return false;
    const vehicles = await api.vehicles();
    return !vehicles.some((vehicle) => vehicle.status === "ACTIVE");
  } catch {
    return false;
  }
}

export async function markTutorialDone(email: string): Promise<void> {
  try {
    await store.write(tutorialKey(email));
  } catch {
    // Best effort: worst case the tutorial offers itself once more.
  }
}
