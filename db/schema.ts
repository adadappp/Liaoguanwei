import { integer, sqliteTable, text, index, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
export const sources = sqliteTable("data_sources", {
  id: text("id").primaryKey(), name: text("name").notNull(), url: text("url").notNull(),
  license: text("license").notNull(), status: text("status").notNull(), notes: text("notes").notNull(), checkedAt: text("checked_at").notNull(),
});
export const taxonomy = sqliteTable("job_taxonomy", {
  id: text("id").primaryKey(), parentId: text("parent_id"), name: text("name").notNull(), description: text("description").notNull(),
});
export const jobs = sqliteTable("job_documents", {
  id: text("id").primaryKey(), url: text("url").notNull(), title: text("title").notNull(), company: text("company").notNull(),
  city: text("city").notNull(), experience: text("experience").notNull(), family: text("family").notNull(), branch: text("branch").notNull(),
  sourceId: text("source_id").notNull(), body: text("body").notNull(), bodyHash: text("body_hash").notNull(),
  extraction: text("extraction_json").notNull(), extractionVersion: integer("extraction_version").notNull().default(1),
  state: text("state").notNull(), publishedAt: text("published_at"), firstSeenAt: text("first_seen_at").notNull(),
  verifiedAt: text("verified_at").notNull(), lastAttemptAt: text("last_attempt_at"), nextReviewAt: text("next_review_at").notNull(),
  stableRounds: integer("stable_rounds").notNull().default(0), failures: integer("failures").notNull().default(0),
}, table => [uniqueIndex("job_url_unique").on(table.url), index("job_lookup").on(table.family, table.city, table.state), index("job_review").on(table.nextReviewAt)]);
export const revisions = sqliteTable("job_revisions", {
  id: text("id").primaryKey(), jobId: text("job_id").notNull().references(() => jobs.id), bodyHash: text("body_hash").notNull(),
  body: text("body").notNull(), extraction: text("extraction_json").notNull(), verifiedAt: text("verified_at").notNull(),
}, table => [uniqueIndex("revision_content_unique").on(table.jobId, table.bodyHash)]);
export const leads = sqliteTable("import_leads", {
  id: text("id").primaryKey(), sourceId: text("source_id").notNull().references(() => sources.id), url: text("url").notNull(),
  title: text("title").notNull(), company: text("company").notNull(), city: text("city").notNull(),
  state: text("state").notNull(), importedAt: text("imported_at").notNull(), lastAttemptAt: text("last_attempt_at"), notes: text("notes").notNull(),
}, table => [uniqueIndex("lead_url_unique").on(table.url)]);
export const queries = sqliteTable("search_topics", {
  id: text("id").primaryKey(), role: text("role").notNull(), city: text("city").notNull(), experience: text("experience").notNull(),
  family: text("family").notNull(), hits: integer("hits").notNull().default(0), lastSeenAt: text("last_seen_at").notNull(),
  lastSearchAt: text("last_search_at"), nextSearchAt: text("next_search_at"), leaseUntil: text("lease_until"), leaseToken: text("lease_token"),
  roleIntent: text("role_intent_json"),
});
export const queryJobs = sqliteTable("query_job_matches", {
  topicId: text("topic_id").notNull().references(() => queries.id, {onDelete:"cascade"}),
  jobId: text("job_id").notNull().references(() => jobs.id, {onDelete:"cascade"}),
  matchedAt: text("matched_at").notNull(),
}, table => [primaryKey({columns:[table.topicId,table.jobId]}),index("query_job_matches_job").on(table.jobId)]);
export const feedback = sqliteTable("user_feedback", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), jobId: text("job_id").references(() => jobs.id),
  topicId: text("topic_id").references(() => queries.id), kind: text("kind").notNull(), message: text("message").notNull(),
  status: text("status").notNull(), resolution: text("resolution").notNull().default(""), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, table => [index("feedback_owner").on(table.userId, table.createdAt), index("feedback_review").on(table.status, table.jobId)]);
export const runs = sqliteTable("update_runs", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), status: text("status").notNull(), startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"), details: text("details_json").notNull(),
});
export const budgets = sqliteTable("request_budgets", {
  id: text("id").primaryKey(), used: integer("used").notNull().default(0), updatedAt: text("updated_at").notNull(),
});
export const leases = sqliteTable("maintenance_leases", {
  id: text("id").primaryKey(), token: text("token").notNull(), until: text("until_at").notNull(),
});
export const interviewQuestions=sqliteTable("interview_questions",{
  id:text("id").primaryKey(),question:text("question").notNull(),originalQuestion:text("original_question").notNull(),answer:text("answer").notNull(),
  skills:text("skills_json").notNull(),roles:text("roles_json").notNull(),difficulty:text("difficulty").notNull(),
  sourceUrl:text("source_url").notNull(),sourceTitle:text("source_title").notNull(),sourceKind:text("source_kind").notNull(),reportQuote:text("report_quote").notNull(),license:text("license").notNull(),sourceHash:text("source_hash").notNull(),
  verifiedAt:text("verified_at").notNull(),createdAt:text("created_at").notNull(),
},table=>[index("interview_verified").on(table.verifiedAt)]);
export const interviewTopics=sqliteTable("interview_topics",{
  id:text("id").primaryKey(),role:text("role").notNull(),skills:text("skills_json").notNull(),jobIds:text("job_ids_json").notNull(),updatedAt:text("updated_at").notNull(),nextSearchAt:text("next_search_at"),
});
export const interviewLinks=sqliteTable("interview_question_links",{
  topicId:text("topic_id").notNull().references(()=>interviewTopics.id,{onDelete:"cascade"}),questionId:text("question_id").notNull().references(()=>interviewQuestions.id,{onDelete:"cascade"}),
},table=>[primaryKey({columns:[table.topicId,table.questionId]})]);
