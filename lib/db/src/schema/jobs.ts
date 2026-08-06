import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  backgroundJobStatusEnum,
  jobAttemptStatusEnum,
} from "./enums";
import { merchants } from "./merchants";

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    merchantId: text("merchant_id").references(() => merchants.id, {
      onDelete: "cascade",
    }),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    priority: integer("priority").notNull().default(0),
    status: backgroundJobStatusEnum("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    availableAt: timestamp("available_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    typeDedupeUnique: uniqueIndex("background_jobs_type_dedupe_unique").on(
      table.type,
      table.dedupeKey,
    ),
    claimIndex: index("background_jobs_claim_idx").on(
      table.status,
      table.availableAt,
      table.priority,
      table.createdAt,
    ),
    merchantStatusIndex: index("background_jobs_merchant_status_idx").on(
      table.merchantId,
      table.status,
      table.createdAt,
    ),
    attemptsNonnegative: check(
      "background_jobs_attempts_nonnegative",
      sql`${table.attempts} >= 0`,
    ),
    maxAttemptsPositive: check(
      "background_jobs_max_attempts_positive",
      sql`${table.maxAttempts} > 0`,
    ),
    attemptsWithinLimit: check(
      "background_jobs_attempts_within_limit",
      sql`${table.attempts} <= ${table.maxAttempts}`,
    ),
    processingHasLock: check(
      "background_jobs_processing_has_lock",
      sql`(${table.status} <> 'processing') OR (${table.lockedAt} IS NOT NULL AND ${table.lockedBy} IS NOT NULL)`,
    ),
    nonprocessingHasNoLock: check(
      "background_jobs_nonprocessing_has_no_lock",
      sql`(${table.status} = 'processing') OR (${table.lockedAt} IS NULL AND ${table.lockedBy} IS NULL)`,
    ),
    completedHasTimestamp: check(
      "background_jobs_completed_has_timestamp",
      sql`(${table.status} <> 'completed') OR ${table.completedAt} IS NOT NULL`,
    ),
    deadLetterHasTimestamp: check(
      "background_jobs_dead_letter_has_timestamp",
      sql`(${table.status} <> 'dead_letter') OR ${table.deadLetteredAt} IS NOT NULL`,
    ),
  }),
);

export const jobAttempts = pgTable(
  "job_attempts",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => backgroundJobs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    workerId: text("worker_id").notNull(),
    status: jobAttemptStatusEnum("status").notNull(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => ({
    jobAttemptUnique: uniqueIndex("job_attempts_job_number_unique").on(
      table.jobId,
      table.attemptNumber,
    ),
    jobStartedIndex: index("job_attempts_job_started_idx").on(
      table.jobId,
      table.startedAt,
    ),
    statusStartedIndex: index("job_attempts_status_started_idx").on(
      table.status,
      table.startedAt,
    ),
    attemptPositive: check(
      "job_attempts_attempt_positive",
      sql`${table.attemptNumber} > 0`,
    ),
    validTimeRange: check(
      "job_attempts_valid_time_range",
      sql`${table.finishedAt} IS NULL OR ${table.finishedAt} >= ${table.startedAt}`,
    ),
    finishedStatusHasTimestamp: check(
      "job_attempts_finished_status_has_timestamp",
      sql`(${table.status} = 'processing') OR ${table.finishedAt} IS NOT NULL`,
    ),
  }),
);

export const jobDeadLetters = pgTable(
  "job_dead_letters",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => backgroundJobs.id, { onDelete: "cascade" }),
    occurrence: integer("occurrence").notNull().default(1),
    reasonCode: text("reason_code").notNull(),
    reasonMessage: text("reason_message").notNull(),
    attempts: integer("attempts").notNull(),
    payloadSnapshot: jsonb("payload_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    requeuedAt: timestamp("requeued_at", { withTimezone: true }),
    requeuedByAccountId: text("requeued_by_account_id"),
  },
  (table) => ({
    jobOccurrenceUnique: uniqueIndex(
      "job_dead_letters_job_occurrence_unique",
    ).on(table.jobId, table.occurrence),
    createdIndex: index("job_dead_letters_created_idx").on(table.createdAt),
    attemptsPositive: check(
      "job_dead_letters_attempts_positive",
      sql`${table.attempts} > 0`,
    ),
    occurrencePositive: check(
      "job_dead_letters_occurrence_positive",
      sql`${table.occurrence} > 0`,
    ),
  }),
);

export type BackgroundJob = typeof backgroundJobs.$inferSelect;
export type JobAttempt = typeof jobAttempts.$inferSelect;
export type JobDeadLetter = typeof jobDeadLetters.$inferSelect;
