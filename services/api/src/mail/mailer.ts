import nodemailer, { type Transporter } from "nodemailer";

/** A plain-text message. Verification codes / reset tokens travel in `text`. */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outbound-mail boundary. The account flows (registration verification, email
 * / phone change, password reset) only ever talk to this interface, so the
 * provider is a deployment choice:
 *
 *   - `SmtpMailer`    any SMTP-compatible service, configured from env
 *   - `ConsoleMailer` development only: prints the message to stdout
 *   - `MemoryMailer`  tests: captures messages so a suite can read the code
 *
 * Nothing here ever reports success it did not get from the transport.
 */
export interface Mailer {
  /** Human-readable transport name, surfaced by /health for operators. */
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** Test transport: stores everything it is asked to send. */
export class MemoryMailer implements Mailer {
  readonly name = "memory";
  readonly sent: MailMessage[] = [];
  /** When set, `send` rejects with it — for "delivery failed" scenarios. */
  failWith: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }

  /** Most recent message to `to` (case-insensitive), or null. */
  lastTo(to: string): MailMessage | null {
    const wanted = to.trim().toLowerCase();
    for (let i = this.sent.length - 1; i >= 0; i -= 1) {
      if (this.sent[i]!.to.toLowerCase() === wanted) return this.sent[i]!;
    }
    return null;
  }
}

/**
 * Development transport: the message is delivered to the process stdout so a
 * developer can read the code without an SMTP account. Refused in production
 * by `createMailerFromEnv`, which is the only thing that constructs it.
 */
export class ConsoleMailer implements Mailer {
  readonly name = "console";
  constructor(private readonly out: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {}

  async send(message: MailMessage): Promise<void> {
    this.out(
      [
        "[mail:console] ---------------------------------------------",
        `[mail:console] To:      ${message.to}`,
        `[mail:console] Subject: ${message.subject}`,
        "[mail:console]",
        ...message.text.split("\n").map((line) => `[mail:console] ${line}`),
        "[mail:console] ---------------------------------------------",
      ].join("\n")
    );
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

export class SmtpMailer implements Mailer {
  readonly name = "smtp";
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig, transporter?: Transporter) {
    this.from = config.from;
    this.transporter =
      transporter ??
      nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined,
      });
  }

  async send(message: MailMessage): Promise<void> {
    // nodemailer resolves only when the SMTP server accepted the message;
    // any rejection propagates to the caller (no fake delivery).
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

export interface MailEnv {
  /** `memory` is the deterministic test transport; never valid in production. */
  transport: "smtp" | "console" | "memory";
  smtp: SmtpConfig | null;
}

/** Builds the configured transport. Throws when production has no SMTP. */
export function createMailerFromEnv(env: MailEnv, nodeEnv: string): Mailer {
  if (env.transport === "smtp") {
    if (!env.smtp) {
      throw new Error("MAIL_TRANSPORT=smtp requires SMTP_HOST and MAIL_FROM.");
    }
    return new SmtpMailer(env.smtp);
  }
  if (nodeEnv === "production") {
    throw new Error(
      `MAIL_TRANSPORT=${env.transport} is not allowed in production. Configure SMTP_HOST / SMTP_PORT / MAIL_FROM.`
    );
  }
  return env.transport === "memory" ? new MemoryMailer() : new ConsoleMailer();
}
