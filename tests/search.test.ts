import { describe, expect, it } from "vitest";
import { DEFAULT_FOLDERS } from "../src/shared/folders";
import {
  folderFromQuery,
  folderSearchQuery,
  routeSearchQuery,
  searchTerms,
  userSearchText
} from "../src/gmail/search";

const [p0, p1] = DEFAULT_FOLDERS;

describe("folder search queries", () => {
  it("adds the folder label behind the typed text", () => {
    expect(folderSearchQuery("invoice from:acme", p0!, DEFAULT_FOLDERS)).toBe(
      'invoice from:acme label:"TRIAGE-URGENT"'
    );
    expect(folderSearchQuery("", p0!, DEFAULT_FOLDERS)).toBe('label:"TRIAGE-URGENT"');
  });

  it("hides the folder label from what the user sees", () => {
    const query = folderSearchQuery("invoice", p1!, DEFAULT_FOLDERS);
    expect(userSearchText(query, DEFAULT_FOLDERS)).toBe("invoice");
    expect(folderFromQuery(query, DEFAULT_FOLDERS)?.id).toBe("important");
  });

  it("switches folders instead of stacking labels", () => {
    const inP0 = folderSearchQuery("invoice", p0!, DEFAULT_FOLDERS);
    expect(folderSearchQuery(inP0, p1!, DEFAULT_FOLDERS)).toBe('invoice label:"TRIAGE-IMPORTANT"');
  });

  it("recognizes Gmail's lowercased and hyphenated label forms", () => {
    expect(folderFromQuery("label:triage-urgent", DEFAULT_FOLDERS)?.id).toBe("urgent");
    const nested = [{ id: "ops", name: "Ops", parentId: null, order: 1, gmailLabel: "Mercato/P0 Urgent" }];
    expect(folderFromQuery("label:mercato-p0-urgent", nested)?.id).toBe("ops");
  });

  it("keeps OR searches scoped to the folder", () => {
    expect(folderSearchQuery("acme OR globex", p0!, DEFAULT_FOLDERS)).toBe(
      '(acme OR globex) label:"TRIAGE-URGENT"'
    );
  });

  it("leaves malformed queries untouched", () => {
    expect(searchTerms('subject:"open')).toBeNull();
    expect(userSearchText('subject:"open', DEFAULT_FOLDERS)).toBe('subject:"open');
  });

  it("maps native routes to queries", () => {
    expect(routeSearchQuery("inbox/:page", {})).toBe("in:inbox");
    expect(routeSearchQuery("search/:query/:page", { query: "acme" })).toBe("acme");
    expect(routeSearchQuery("inbox/:threadID", {})).toBeNull();
  });
});
