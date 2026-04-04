import { z } from 'zod'

/** Schema for creating a new monitor. */
export const createMonitorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name is required')
    .max(200, 'name must be 200 characters or fewer'),
  url: z
    .string()
    .trim()
    .min(1, 'url is required')
    .max(2048, 'url must be 2048 characters or fewer')
    .url('url must be a valid URL'),
  groupSlug: z
    .string()
    .trim()
    .max(100, 'groupSlug must be 100 characters or fewer')
    .optional(),
  expectedStatus: z
    .number()
    .int('expectedStatus must be an integer')
    .min(100, 'expectedStatus must be between 100 and 599')
    .max(599, 'expectedStatus must be between 100 and 599')
    .default(200),
  alertEmails: z
    .array(z.string().email('each alert email must be a valid email address'))
    .max(10, 'maximum 10 alert emails')
    .default([]),
  isActive: z.boolean().default(true),
  healthCheckEnabled: z.boolean().default(false),
  healthCheckPath: z
    .string()
    .trim()
    .max(500, 'healthCheckPath must be 500 characters or fewer')
    .default('/health'),
  isPublic: z.boolean().default(true),
})

/** Schema for updating an existing monitor (all fields optional). */
export const updateMonitorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name cannot be empty')
    .max(200, 'name must be 200 characters or fewer')
    .optional(),
  url: z
    .string()
    .trim()
    .min(1, 'url cannot be empty')
    .max(2048, 'url must be 2048 characters or fewer')
    .url('url must be a valid URL')
    .optional(),
  groupSlug: z
    .string()
    .trim()
    .max(100, 'groupSlug must be 100 characters or fewer')
    .optional(),
  expectedStatus: z
    .number()
    .int('expectedStatus must be an integer')
    .min(100, 'expectedStatus must be between 100 and 599')
    .max(599, 'expectedStatus must be between 100 and 599')
    .optional(),
  alertEmails: z
    .array(z.string().email('each alert email must be a valid email address'))
    .max(10, 'maximum 10 alert emails')
    .optional(),
  isActive: z.boolean().optional(),
  healthCheckEnabled: z.boolean().optional(),
  healthCheckPath: z
    .string()
    .trim()
    .max(500, 'healthCheckPath must be 500 characters or fewer')
    .optional(),
  isPublic: z.boolean().optional(),
})

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name is required')
    .max(100, 'name must be 100 characters or fewer'),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase alphanumeric with hyphens')
    .max(100, 'slug must be 100 characters or fewer')
    .optional(),
  brand: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'primary must be a hex color'),
  }).optional(),
  isActive: z.boolean().default(true),
})

export const updateGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name cannot be empty')
    .max(100, 'name must be 100 characters or fewer')
    .optional(),
  brand: z.object({
    primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'primary must be a hex color'),
  }).optional()
    .nullable(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().url().optional().nullable(),
  logoKey: z.string().optional().nullable(),
})

/** Extract the first human-readable error message from a Zod parse failure. */
export function firstZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message ?? 'Validation failed'
}

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>
