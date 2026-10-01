const SEARCH_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>';
const CLEAR_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';

export class SearchBarView {
  readonly element: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private readonly scope: HTMLSpanElement;
  private readonly clear: HTMLButtonElement;
  private routeText: string | null = null;

  constructor(
    private readonly onSearch: (text: string) => void,
    doc: Document = window.document
  ) {
    const element = doc.createElement("div");
    element.dataset.mercatoSearch = "1";
    element.setAttribute("role", "search");

    const submit = doc.createElement("button");
    submit.type = "button";
    submit.className = "mercato-search-icon";
    submit.setAttribute("aria-label", "Run search");
    submit.innerHTML = SEARCH_ICON;
    submit.addEventListener("click", () => this.onSearch(this.input.value));

    const scope = doc.createElement("span");
    scope.className = "mercato-search-scope";

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "mercato-search-input";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Mercato mail search");
    input.addEventListener("keydown", (event) => {
      // Keep Gmail's global shortcuts from reacting to typing in our box.
      event.stopPropagation();
      if (event.key === "Enter") {
        event.preventDefault();
        this.onSearch(input.value);
      } else if (event.key === "Escape") {
        input.blur();
      }
    });
    input.addEventListener("keypress", (event) => event.stopPropagation());
    input.addEventListener("keyup", (event) => event.stopPropagation());
    input.addEventListener("input", () => this.syncClear());

    const clear = doc.createElement("button");
    clear.type = "button";
    clear.className = "mercato-search-clear";
    clear.setAttribute("aria-label", "Clear search");
    clear.innerHTML = CLEAR_ICON;
    clear.addEventListener("click", () => {
      input.value = "";
      this.syncClear();
      this.onSearch("");
    });

    element.append(submit, scope, input, clear);
    this.element = element;
    this.input = input;
    this.scope = scope;
    this.clear = clear;
    this.syncClear();
  }

  get text(): string {
    return this.input.value;
  }

  /** `routeText` null means the current page is not a search (e.g. an open email). */
  sync(routeText: string | null, folderName: string | null): void {
    if (routeText !== null && routeText !== this.routeText) {
      this.routeText = routeText;
      // Only replace the input when the route changed, so typing is never clobbered.
      this.input.value = routeText;
      this.syncClear();
    }
    this.scope.textContent = folderName ?? "";
    this.scope.style.display = folderName ? "" : "none";
    this.input.placeholder = folderName ? `Search ${folderName}` : "Search mail";
  }

  private syncClear(): void {
    this.clear.style.visibility = this.input.value ? "visible" : "hidden";
  }
}
