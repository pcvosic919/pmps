import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { roles, skillLevels, opportunityStatuses, srStatuses, wbsVersionStatuses } from "../shared/types";

// 1. Users table
export const usersTable = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    password: text("password"), // can be null for OAuth
    department: text("department"),
    title: text("title"),
    role: text("role", { enum: roles }).notNull().default("user"),
    roles: text("roles", { mode: 'json' }).$type<string[]>().default([]).notNull(),
    provider: text("provider", { enum: ["manual", "oauth", "entra"] }).notNull().default("manual"),
    providerId: text("provider_id"),
    isActive: integer("is_active", { mode: 'boolean' }).notNull().default(true),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
    updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 2. Skill Categories
export const skillCategoriesTable = sqliteTable("skill_categories", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull().unique(),
    description: text("description"),
});

// 3. User Skills
export const userSkillsTable = sqliteTable("user_skills", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    categoryId: integer("category_id").notNull().references(() => skillCategoriesTable.id),
    level: text("level", { enum: skillLevels }).notNull(),
});

// 4. Cost Rates
export const costRatesTable = sqliteTable("cost_rates", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
    dailyRate: real("daily_rate").notNull(),
    hourlyRate: real("hourly_rate").notNull(),
    currency: text("currency").notNull().default("TWD"),
    updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 5. Opportunities
export const opportunitiesTable = sqliteTable("opportunities", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    customerName: text("customer_name").notNull(),
    estimatedValue: real("estimated_value").notNull(),
    status: text("status", { enum: opportunityStatuses }).notNull().default("new"),
    expectedCloseDate: integer("expected_close_date", { mode: 'timestamp' }),
    ownerId: integer("owner_id").notNull().references(() => usersTable.id), // business handler
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 6. Opportunity Members
export const opportunityMembersTable = sqliteTable("opportunity_members", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    memberRole: text("member_role", { enum: ["owner", "assignee", "watcher"] }).notNull().default("assignee"),
});

// 7. Presales Assignments
export const presalesAssignmentsTable = sqliteTable("presales_assignments", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id),
    techId: integer("tech_id").notNull().references(() => usersTable.id),
    estimatedHours: real("estimated_hours").notNull(),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 8. Presales Timesheets
export const presalesTimesheetsTable = sqliteTable("presales_timesheets", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id").notNull().references(() => opportunitiesTable.id),
    techId: integer("tech_id").notNull().references(() => usersTable.id),
    workDate: integer("work_date", { mode: 'timestamp' }).notNull(),
    hours: real("hours").notNull(),
    description: text("description").notNull(),
    costAmount: real("cost_amount").notNull(),
    settlementId: integer("settlement_id"), // references presales_settlements
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 9. Presales Settlements
export const presalesSettlementsTable = sqliteTable("presales_settlements", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monthStr: text("month_str").notNull().unique(), // YYYY-MM
    totalCost: real("total_cost").notNull(),
    status: text("status", { enum: ["draft", "finalized"] }).notNull().default("draft"),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 10. Service Requests
export const serviceRequestsTable = sqliteTable("service_requests", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    opportunityId: integer("opportunity_id").references(() => opportunitiesTable.id),
    title: text("title").notNull(),
    contractAmount: real("contract_amount").notNull(),
    pmId: integer("pm_id").notNull().references(() => usersTable.id),
    status: text("status", { enum: srStatuses }).notNull().default("new"),
    marginEstimate: real("margin_estimate").notNull().default(0), // percentage
    marginWarning: integer("margin_warning", { mode: 'boolean' }).notNull().default(false),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 11. SR Members
export const srMembersTable = sqliteTable("sr_members", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    srId: integer("sr_id").notNull().references(() => serviceRequestsTable.id),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    memberRole: text("member_role", { enum: ["owner", "assignee", "watcher"] }).notNull().default("assignee"),
});

// 12. SR Attachments
export const srAttachmentsTable = sqliteTable("sr_attachments", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    srId: integer("sr_id").notNull().references(() => serviceRequestsTable.id),
    fileName: text("file_name").notNull(),
    fileKey: text("file_key").notNull(),
    fileUrl: text("file_url").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: text("mime_type").notNull(),
    uploadedById: integer("user_id").notNull().references(() => usersTable.id),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 14. WBS Versions
export const wbsVersionsTable = sqliteTable("wbs_versions", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    srId: integer("sr_id").notNull().references(() => serviceRequestsTable.id),
    versionNumber: integer("version_number").notNull(),
    status: text("status", { enum: wbsVersionStatuses }).notNull().default("draft"),
    rejectionReason: text("rejection_reason"),
    submittedBy: integer("submitted_by").references(() => usersTable.id),
    reviewedBy: integer("reviewed_by").references(() => usersTable.id),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 13. WBS Items
export const wbsItemsTable = sqliteTable("wbs_items", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    versionId: integer("version_id").notNull().references(() => wbsVersionsTable.id),
    title: text("title").notNull(),
    estimatedHours: real("estimated_hours").notNull(),
    actualHours: real("actual_hours").notNull().default(0),
    startDate: integer("start_date", { mode: 'timestamp' }),
    endDate: integer("end_date", { mode: 'timestamp' }),
    assigneeId: integer("assignee_id").references(() => usersTable.id),
});

// 15. Project Timesheets
export const projectTimesheetsTable = sqliteTable("project_timesheets", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    wbsItemId: integer("wbs_item_id").notNull().references(() => wbsItemsTable.id),
    techId: integer("tech_id").notNull().references(() => usersTable.id),
    workDate: integer("work_date", { mode: 'timestamp' }).notNull(),
    hours: real("hours").notNull(),
    description: text("description").notNull(),
    costAmount: real("cost_amount").notNull(),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 16. Change Requests
export const changeRequestsTable = sqliteTable("change_requests", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    srId: integer("sr_id").notNull().references(() => serviceRequestsTable.id),
    wbsItemId: integer("wbs_item_id").references(() => wbsItemsTable.id), // applies to a specific WBS item or whole SR
    requesterId: integer("requester_id").notNull().references(() => usersTable.id),
    reason: text("reason").notNull(),
    hoursAdjustment: real("hours_adjustment").notNull().default(0),
    amountAdjustment: real("amount_adjustment").notNull().default(0),
    status: text("status", { enum: ["pending_business", "pending_manager", "approved", "rejected"] }).notNull().default("pending_business"),
    rejectionReason: text("rejection_reason"),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 17. Notifications
export const notificationsTable = sqliteTable("notifications", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    type: text("type", { enum: ["warning", "info", "todo", "approval"] }).notNull(),
    message: text("message").notNull(),
    isRead: integer("is_read", { mode: 'boolean' }).notNull().default(false),
    actionUrl: text("action_url"),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 18. Monthly Settlements (Project based)
export const monthlySettlementsTable = sqliteTable("monthly_settlements", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    monthStr: text("month_str").notNull().unique(), // YYYY-MM
    totalCost: real("total_cost").notNull(),
    status: text("status", { enum: ["draft", "finalized"] }).notNull().default("draft"),
    createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});

// 19. System Settings
export const systemSettingsTable = sqliteTable("system_settings", {
    key: text("key").primaryKey(),
    value: text("value").notNull(),
    category: text("category").notNull().default("general"),
    valueType: text("value_type", { enum: ["string", "number", "boolean", "json"] }).notNull().default("string"),
    description: text("description"),
});

// 20. Custom Fields & Values
export const customFieldsTable = sqliteTable("custom_fields", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", { enum: ["opportunity", "sr", "wbs", "cr"] }).notNull(),
    name: text("name").notNull(),
    fieldType: text("field_type", { enum: ["text", "number", "select", "multiselect", "date", "switch", "url"] }).notNull(),
    options: text("options", { mode: 'json' }).$type<string[]>(), // enum options for select
    isRequired: integer("is_read", { mode: 'boolean' }).notNull().default(false),
});

export const customFieldValuesTable = sqliteTable("custom_field_values", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fieldId: integer("field_id").notNull().references(() => customFieldsTable.id),
    entityId: integer("entity_id").notNull(), // Dynamic linkage based on customFields.entityType
    value: text("value"),
});
