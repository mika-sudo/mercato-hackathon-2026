import type { Folder } from "./contracts";

/** Used until the classifier API returns its own taxonomy. */
export const DEFAULT_FOLDERS: Folder[] = [
  { id: "p0-urgent", name: "P0: Urgent", parentId: null, order: 10, gmailLabel: "Mercato/P0 Urgent" },
  { id: "p1-important", name: "P1: Important", parentId: null, order: 20, gmailLabel: "Mercato/P1 Important" },
  {
    id: "p2-not-important",
    name: "P2: Not important",
    parentId: null,
    order: 30,
    gmailLabel: "Mercato/P2 Not important"
  },
  { id: "obvious-junk", name: "Obvious Junk", parentId: null, order: 40, gmailLabel: "Mercato/Obvious Junk" }
];
