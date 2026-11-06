import { z } from 'zod';

/**
 * Client-side validation (UX). Every rule here is enforced again on the
 * server by the RPC layer — these schemas are never the security boundary.
 */
export const profileSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter your name').max(80, 'Keep it under 80 characters'),
  phone: z
    .string()
    .trim()
    .max(32, 'That number looks too long')
    .regex(/^[+()\d\s-]*$/, 'Use digits, spaces, + ( ) or -')
    .optional(),
});
export type ProfileForm = z.infer<typeof profileSchema>;

export const groupSchema = z.object({
  name: z.string().trim().min(1, 'Give your group a name').max(60, 'Keep it under 60 characters'),
  type: z.enum(['home', 'trip', 'couple', 'work', 'other']),
  currency: z.string().regex(/^[A-Z]{3}$/),
  icon: z.string().min(1),
});
export type GroupForm = z.infer<typeof groupSchema>;

export const expenseSchema = z.object({
  groupId: z.string().min(1, 'Choose a group'),
  amount: z.number().int().positive('Enter an amount greater than zero'),
  description: z.string().trim().min(1, 'Add a description').max(120, 'Keep it under 120 characters'),
  paidBy: z.string().min(1, 'Choose who paid'),
  notes: z.string().max(1000).optional(),
});

export const settlementSchema = z.object({
  amount: z.number().int().positive('Enter an amount greater than zero'),
  reference: z.string().max(64, 'Reference is too long').optional(),
});
