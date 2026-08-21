import { z } from "zod";

export const SourceErrorCode = z.enum([
  "network",
  "timeout",
  "http_status",
  "redirect",
  "content_type",
  "too_small",
  "too_large",
  "shrink",
  "missing_marker",
  "invalid_utf8",
  "missing_selector",
  "conversion_failed",
  "missing_snapshot",
  "write_failed",
]);

const ResultBase = z.object({
  provider: z.string(),
  slug: z.string(),
  url: z.string().url(),
  attempts: z.number().int().nonnegative(),
});

const SuccessResult = ResultBase.extend({
  status: z.enum(["unchanged", "changed"]),
  before_bytes: z.number().int().nonnegative(),
  after_bytes: z.number().int().nonnegative(),
  before_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  after_sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

const ErrorResult = ResultBase.extend({
  status: z.literal("error"),
  error_code: SourceErrorCode,
  error_message: z.string().min(1).max(500),
}).strict();

export const SourceResultSchema = z.union([SuccessResult, ErrorResult]);
export const SourceReportSchema = z
  .object({
    version: z.literal(1),
    started_at: z.string().datetime(),
    results: z.array(SourceResultSchema),
  })
  .strict();

export type SourceErrorCode = z.infer<typeof SourceErrorCode>;
export type SourceResult = z.infer<typeof SourceResultSchema>;
export type SourceReport = z.infer<typeof SourceReportSchema>;
