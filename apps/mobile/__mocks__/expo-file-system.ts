/** In-memory stand-in for the SDK 57 `File` / `Paths` API used by lib/onboarding. */
const files = new Map<string, string>();

export const __files = files;
export const __reset = () => files.clear();

export class Directory {
  readonly uri: string;
  constructor(...parts: string[]) {
    this.uri = parts.join("/");
  }
}

export const Paths = {
  document: new Directory("file:///mock-documents"),
  cache: new Directory("file:///mock-cache"),
};

export class File {
  readonly uri: string;
  constructor(...parts: (string | Directory)[]) {
    this.uri = parts.map((p) => (typeof p === "string" ? p : p.uri)).join("/");
  }
  get exists(): boolean {
    return files.has(this.uri);
  }
  create(): void {
    if (!files.has(this.uri)) files.set(this.uri, "");
  }
  write(content: string | Uint8Array): void {
    files.set(this.uri, typeof content === "string" ? content : Buffer.from(content).toString("base64"));
  }
  async text(): Promise<string> {
    return files.get(this.uri) ?? "";
  }
  delete(): void {
    files.delete(this.uri);
  }
}
