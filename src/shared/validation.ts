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
  group: z
    .string()
    .trim()
    .max(100, 'group must be 100 characters or fewer')
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
  group: z
    .string()
    .trim()
    .max(100, 'group must be 100 characters or fewer')
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
})

/** Extract the first human-readable error message from a Zod parse failure. */
export function firstZodError(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue?.message ?? 'Validation failed'
}

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>
