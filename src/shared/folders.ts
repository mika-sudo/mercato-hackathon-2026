import type { Folder } from "./contracts";

/**
 * Ids match the classifier's triage labels (`GET /triage`), and Gmail labels match the ones the
 * backend applies. Used until the API answers, and as display names for its categories.
 */
export const DEFAULT_FOLDERS: Folder[] = [
  { id: "urgent", name: "P0: Urgent", parentId: null, order: 10, gmailLabel: "TRIAGE-URGENT" },
  { id: "important", name: "P1: Important", parentId: null, order: 20, gmailLabel: "TRIAGE-IMPORTANT" },
  { id: "unimportant", name: "P2: Not important", parentId: null, order: 30, gmailLabel: "TRIAGE-UNIMPORTANT" },
  { id: "junk", name: "Obvious Junk", parentId: null, order: 40, gmailLabel: "TRIAGE-JUNK" }
];
