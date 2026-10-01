import { afterEach, describe, expect, it, vi } from "vitest";
import type { FolderControllerState } from "../src/content/controller";
import { FolderShellView, type MailNavigator } from "../src/content/folder-shell";
import type { MailRoute } from "../src/gmail/adapter";
import { DEFAULT_FOLDERS } from "../src/shared/folders";

function stateWith(openThreadId: string | null, threads = 0): FolderControllerState {
  return {
    folders: DEFAULT_FOLDERS,
    folderCounts: { important: { threads, unread: 0 } },
    categoryByThread: {},
    loading: { folders: false, categories: false },
    error: null,
    snapshot: { mailboxEmail: "me@example.com", openThreadId, visibleThreadIds: [] }
  };
}

function gmailToolbar(): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.setAttribute("gh", "mtb");
  toolbar.getClientRects = () => [new DOMRect(0, 0, 100, 40)] as unknown as DOMRectList;
  const buttons = document.createElement("div");
  buttons.className = "G-tF";
  toolbar.append(buttons);
  document.body.append(toolbar);
  return toolbar;
}

function setup(route: MailRoute) {
  localStorage.setItem("mercato-shell-visible", "1");
  const toolbar = gmailToolbar();
  let state = stateWith(null);
  let current = route;
  const navigator: MailNavigator = {
    currentRoute: () => current,
    search: vi.fn(async () => undefined),
    openLabel: vi.fn(async () => undefined),
    openInbox: vi.fn(async () => undefined),
    replaceSearch: vi.fn(),
    visibleRows: () => []
  };
  const shell = new FolderShellView({ getState: () => state }, navigator);
  shell.mount();
  return {
    toolbar,
    navigator,
    shell,
    box: (id: string) => document.querySelector<HTMLButtonElement>(`[data-mercato-folder-id="${id}"]`)!,
    setState(next: FolderControllerState) {
      state = next;
      shell.render(state);
    },
    goTo(next: MailRoute) {
      current = next;
      shell.render(state);
    }
  };
}

const urgentLabel: MailRoute = { list: true, search: false, query: 'label:"TRIAGE-URGENT"' };

describe("FolderShellView", () => {
  afterEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  it("keeps its boxes across renders and switches folders even with an email open", () => {
    const view = setup({ list: false, search: false, query: null });
    const before = view.box("important");
    view.setState(stateWith("a1b2c3", 7));
    expect(view.box("important")).toBe(before);
    expect(view.box("important").querySelector(".mercato-folder-count")!.textContent).toBe("7");

    view.box("important").click();
    expect(view.navigator.openLabel).toHaveBeenCalledWith("TRIAGE-IMPORTANT");
    expect(view.navigator.search).not.toHaveBeenCalled();
    view.shell.destroy();
  });

  it("selects the clicked box at once and shows it loading until Gmail switches", () => {
    const view = setup(urgentLabel);
    expect(view.box("urgent").getAttribute("aria-pressed")).toBe("true");

    view.box("junk").click();
    expect(view.box("junk").getAttribute("aria-pressed")).toBe("true");
    expect(view.box("junk").getAttribute("aria-busy")).toBe("true");
    expect(view.box("urgent").getAttribute("aria-pressed")).toBe("false");

    view.goTo({ list: true, search: false, query: 'label:"TRIAGE-JUNK"' });
    expect(view.box("junk").getAttribute("aria-pressed")).toBe("true");
    expect(view.box("junk").hasAttribute("aria-busy")).toBe(false);
    view.shell.destroy();
  });

  it("handles clicks that Gmail's toolbar block intercepts over a box", () => {
    const view = setup(urgentLabel);
    view.box("important").getBoundingClientRect = () => new DOMRect(500, 60, 120, 30);

    view.toolbar.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
    expect(view.navigator.openLabel).not.toHaveBeenCalled();

    view.toolbar.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 560, clientY: 75 }));
    expect(view.navigator.openLabel).toHaveBeenCalledWith("TRIAGE-IMPORTANT");
    view.shell.destroy();
  });
});
