import { z } from "zod";

export const emailSchema = z.string().email().max(320);
export const gmailIdSchema = z
  .string()
  .regex(/^[0-9a-f]+$/i)
  .min(6)
  .max(64);

export const folderSchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(128),
    parentId: z.string().min(1).max(128).nullable(),
    order: z.number().int().min(0).max(100_000),
    color: z.string().min(1).max(32).optional(),
    icon: z.string().min(1).max(64).optional(),
    gmailLabel: z.string().min(1).max(225).optional()
  })
  .strict();

export const threadCategorySchema = z
  .object({
    gmailThreadId: gmailIdSchema,
    folderId: z.string().min(1).max(128).nullable(),
    source: z.enum(["classifier", "user"]),
    confidence: z.number().min(0).max(1).optional(),
    updatedAt: z.string().datetime()
  })
  .strict();

export const foldersResponseSchema = z.object({
  folders: z.array(folderSchema)
});

export const categoriesResponseSchema = z.object({
  categories: z.array(threadCategorySchema)
});

export const classifyResponseSchema = z.object({
  category: threadCategorySchema
});

export const setFolderResponseSchema = z.object({
  category: threadCategorySchema
});

export const apiErrorSchema = z
  .object({
    code: z.string().min(1).max(64),
    message: z.string().min(1).max(1024),
    status: z.number().int().min(100).max(599).optional()
  })
  .strict();

export type Folder = z.infer<typeof folderSchema>;
export type ThreadCategory = z.infer<typeof threadCategorySchema>;
export type FoldersResponse = z.infer<typeof foldersResponseSchema>;
export type CategoriesResponse = z.infer<typeof categoriesResponseSchema>;
export type ClassifyResponse = z.infer<typeof classifyResponseSchema>;
export type SetFolderResponse = z.infer<typeof setFolderResponseSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
