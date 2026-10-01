import { z } from "zod";
import { apiErrorSchema, emailSchema, gmailIdSchema } from "./contracts";

export const CHANNEL = "mercato.gmail.v1" as const;

const ids = z
  .array(gmailIdSchema)
  .min(1)
  .max(50)
  .refine((values) => new Set(values).size === values.length, "gmailThreadIds must be unique.");

const base = { channel: z.literal(CHANNEL) };

export const requestSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("folders.list"), mailboxEmail: emailSchema }).strict(),
  z.object({ ...base, kind: z.literal("folders.counts"), mailboxEmail: emailSchema }).strict(),
  z
    .object({
      ...base,
      kind: z.literal("threads.categories"),
      mailboxEmail: emailSchema,
      gmailThreadIds: ids
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("thread.classify"),
      mailboxEmail: emailSchema,
      gmailThreadId: gmailIdSchema
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.literal("thread.setFolder"),
      mailboxEmail: emailSchema,
      gmailThreadId: gmailIdSchema,
      folderId: z.string().min(1).max(128).nullable()
    })
    .strict()
]);

export type Request = z.infer<typeof requestSchema>;
type WithoutChannel<T> = T extends unknown ? Omit<T, "channel"> : never;
export type ClientRequest = WithoutChannel<Request>;

export type Reply<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type ApiError = z.infer<typeof apiErrorSchema>;

export class ExtensionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ExtensionError";
  }
}

export function publicError(error: unknown): ApiError {
  if (error instanceof ExtensionError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.status ? { status: error.status } : {})
    };
  }
  return {
    code: "UNAVAILABLE",
    message: "The extension could not complete this request. Refresh to try again."
  };
}

export function isGmailUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return (
      url.origin === "https://mail.google.com" &&
      !url.username &&
      !url.password &&
      /^\/mail(?:\/|$)/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
