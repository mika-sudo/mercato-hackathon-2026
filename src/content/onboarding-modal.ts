import {
  PERSONAS,
  PERSONA_IDS,
  STRICTNESS,
  STRICTNESS_IDS,
  defaultAnswers,
  withPersona,
  type OnboardingAnswers,
  type PersonaId,
  type Strictness
} from "../shared/onboarding";

const BUILD_STEPS = ["Reading your inbox", "Analyzing your preferences", "Building your personal rules"];
/** The whole sequence, including the pause on the finished list. */
const BUILD_MS = 4000;
const BUILD_DONE_MS = 400;
const BUILD_STEP_MS = (BUILD_MS - BUILD_DONE_MS) / BUILD_STEPS.length;

const STYLES = `
  :host { all: initial; }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(6, 7, 9, 0.72);
    font-family: "Google Sans", Roboto, Arial, sans-serif;
  }
  .dialog {
    box-sizing: border-box;
    width: min(540px, 100%);
    max-height: calc(100vh - 48px);
    overflow: auto;
    border: 1px solid #2c2f36;
    border-radius: 14px;
    background: #16181d;
    color: #e8eaed;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }
  @media (prefers-reduced-motion: no-preference) {
    .dialog { animation: rise 180ms ease-out; }
  }
  @keyframes rise { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
  form { display: grid; gap: 16px; padding: 20px 22px 22px; }
  legend { margin-bottom: 8px; padding: 0; color: #9aa0a6; font-size: 12px; }
  fieldset { min-width: 0; margin: 0; padding: 0; border: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    height: 30px;
    padding: 0 14px;
    border: 1px solid #353841;
    border-radius: 999px;
    background: transparent;
    color: #d7dae0;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }
  .chip:hover { border-color: #5a5e68; }
  .chip:focus-visible, .seg button:focus-visible, .build:focus-visible {
    outline: 2px solid #b9a7ff;
    outline-offset: 2px;
  }
  .chip[data-tone="persona"][aria-checked="true"] {
    border-color: #34d3a6; background: #34d3a6; color: #06261d; font-weight: 600;
  }
  .chip[data-tone="urgent"][aria-pressed="true"] {
    border-color: #ff6a4d; background: #ff6a4d; color: #2b0b04; font-weight: 600;
  }
  .chip[data-tone="junk"][aria-pressed="true"] { border-color: #4a4e58; background: #4a4e58; color: #ffffff; }
  .chip[data-tone="delegates"][aria-pressed="true"] { border-color: #b9a7ff; background: #2a2540; color: #e4dcff; }
  .hint { margin: 8px 0 0; color: #7f858d; font-size: 12px; }
  .footer { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px; }
  .seg { display: inline-flex; padding: 4px; border: 1px solid #2c2f36; border-radius: 999px; background: #0d0e11; }
  .seg button {
    height: 30px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #c4c7cc;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .seg button[aria-checked="true"] { background: #c4b5fd; color: #1b1433; font-weight: 600; }
  .build {
    height: 42px;
    padding: 0 24px;
    border: 0;
    border-radius: 999px;
    background: #34d3a6;
    color: #06261d;
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
  }
  .build:hover { background: #4be0b6; }
  .building {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 28px;
    padding: 32px 36px;
  }
  .steps { display: grid; gap: 18px; margin: 0; padding: 0; list-style: none; }
  .step {
    display: flex;
    align-items: center;
    gap: 14px;
    color: #ffffff;
    font-size: 18px;
    font-weight: 500;
    transition: color 200ms ease;
  }
  .step[data-state="pending"] { color: #5f646b; }
  .icon {
    box-sizing: border-box;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }
  .step[data-state="pending"] .icon { border: 2.5px solid #33363d; }
  .step[data-state="active"] .icon { border: 2.5px solid #2c4a42; border-top-color: #34d3a6; }
  .step[data-state="done"] .icon { background: #34d3a6; color: #06261d; font-size: 13px; font-weight: 700; }
  .step[data-state="done"] .icon::before { content: "✓"; }
  .progress { height: 4px; overflow: hidden; border-radius: 2px; background: #2c2f36; }
  .bar { width: 0; height: 100%; background: #34d3a6; animation: fill linear forwards; }
  @keyframes fill { to { width: 100%; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pop { from { transform: scale(0.5); } }
  @media (prefers-reduced-motion: no-preference) {
    .step[data-state="active"] .icon { animation: spin 900ms linear infinite; }
    .step[data-state="done"] .icon { animation: pop 200ms ease-out; }
  }
`;

type ChoiceField = "urgent" | "junk" | "delegates";

interface Parts {
  root: ShadowRoot;
  dialog: HTMLElement;
  form: HTMLFormElement;
  personas: HTMLElement;
  hint: HTMLElement;
  urgent: HTMLElement;
  junk: HTMLElement;
  delegates: HTMLElement;
  strictness: HTMLElement;
}

/** The setup questions that turn answers into prompt v1. */
export class OnboardingModal {
  private host: HTMLDivElement | null = null;
  private parts: Parts | null = null;
  private answers: OnboardingAnswers = defaultAnswers();
  /** Set while the build sequence plays; closing then finishes the build instead of cancelling. */
  private building: OnboardingAnswers | null = null;
  private settle: ((answers: OnboardingAnswers | null) => void) | null = null;
  private returnFocus: HTMLElement | null = null;

  constructor(private readonly doc: Document = window.document) {}

  get isOpen(): boolean {
    return this.host !== null;
  }

  /** Resolves with the answers once the build sequence ends, or null if closed before building. */
  open(initial: OnboardingAnswers | null): Promise<OnboardingAnswers | null> {
    this.close(null);
    this.answers = initial
      ? { ...initial, urgent: [...initial.urgent], junk: [...initial.junk], delegates: [...initial.delegates] }
      : defaultAnswers();
    this.returnFocus = this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;
    const promise = new Promise<OnboardingAnswers | null>((resolve) => {
      this.settle = resolve;
    });
    this.mount();
    return promise;
  }

  close(result: OnboardingAnswers | null = null): void {
    if (!this.host) return;
    const answers = result ?? this.building;
    this.host.remove();
    this.host = null;
    this.parts = null;
    this.building = null;
    const settle = this.settle;
    this.settle = null;
    this.returnFocus?.focus();
    this.returnFocus = null;
    settle?.(answers);
  }

  private mount(): void {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = "") => {
      const node = this.doc.createElement(tag);
      if (className) node.className = className;
      if (text) node.textContent = text;
      return node;
    };

    const host = el("div");
    host.dataset.talosOnboarding = "1";
    // Gmail binds keyboard shortcuts on the document; typing here must not reach them.
    for (const type of ["keydown", "keypress", "keyup"] as const) {
      host.addEventListener(type, (event) => {
        event.stopPropagation();
        if (type === "keydown" && event.key === "Escape") {
          event.preventDefault();
          this.close(null);
        }
      });
    }
    const root = host.attachShadow({ mode: "open" });
    const style = el("style");
    style.textContent = STYLES;

    const backdrop = el("div", "backdrop");
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) this.close(null);
    });
    const dialog = el("div", "dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Set up Talos");

    const form = el("form");
    form.noValidate = true;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.build();
    });

    const group = (legendText: string, radio: boolean) => {
      const fieldset = el("fieldset");
      fieldset.append(el("legend", "", legendText));
      const chips = el("div", "chips");
      if (radio) chips.setAttribute("role", "radiogroup");
      fieldset.append(chips);
      return { fieldset, chips };
    };
    const personas = group("Which sounds like you?", true);
    const hint = el("p", "hint");
    personas.fieldset.append(hint);
    const urgent = group("What can't wait?", false);
    const junk = group("Never show me", false);
    const delegates = group("Someone handles this for me", false);

    const strictnessField = el("fieldset");
    strictnessField.append(el("legend", "", "How strict?"));
    const strictness = el("div", "seg");
    strictness.setAttribute("role", "radiogroup");
    strictnessField.append(strictness);
    const build = el("button", "build", "Build my inbox");
    build.type = "submit";
    const footer = el("div", "footer");
    footer.append(strictnessField, build);

    form.append(personas.fieldset, urgent.fieldset, junk.fieldset, delegates.fieldset, footer);
    dialog.append(form);
    backdrop.append(dialog);
    root.append(style, backdrop);

    this.host = host;
    this.parts = {
      root,
      dialog,
      form,
      personas: personas.chips,
      hint,
      urgent: urgent.chips,
      junk: junk.chips,
      delegates: delegates.chips,
      strictness
    };
    this.render();
    this.doc.body.append(host);
    personas.chips.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }

  /** Checks off the "what's happening" lines one at a time, then resolves with the answers. */
  private async build(): Promise<void> {
    const parts = this.parts;
    if (!parts || this.building) return;
    const answers = this.answers;
    this.building = answers;

    const view = this.doc.createElement("div");
    view.className = "building";
    view.setAttribute("role", "status");
    view.setAttribute("aria-live", "polite");
    view.style.minHeight = `${parts.form.offsetHeight}px`;
    const steps = this.doc.createElement("ol");
    steps.className = "steps";
    const items = BUILD_STEPS.map((text) => {
      const item = this.doc.createElement("li");
      item.className = "step";
      item.dataset.state = "pending";
      const icon = this.doc.createElement("span");
      icon.className = "icon";
      icon.setAttribute("aria-hidden", "true");
      item.append(icon, text);
      return item;
    });
    steps.append(...items);
    const progress = this.doc.createElement("div");
    progress.className = "progress";
    const bar = this.doc.createElement("div");
    bar.className = "bar";
    bar.style.animationDuration = `${BUILD_STEPS.length * BUILD_STEP_MS}ms`;
    progress.append(bar);
    view.append(steps, progress);
    parts.dialog.replaceChildren(view);

    for (const [index, item] of items.entries()) {
      items[index - 1]?.setAttribute("data-state", "done");
      item.dataset.state = "active";
      await this.wait(BUILD_STEP_MS);
      if (this.building !== answers) return;
    }
    items.at(-1)?.setAttribute("data-state", "done");
    await this.wait(BUILD_DONE_MS);
    if (this.building === answers) this.close(answers);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private render(): void {
    const parts = this.parts;
    if (!parts || this.building) return;
    const persona = PERSONAS[this.answers.persona];
    parts.hint.textContent = persona.summary;

    this.renderChips(
      parts.personas,
      "persona",
      PERSONA_IDS.map((id) => ({ id, label: PERSONAS[id].label })),
      [this.answers.persona],
      (id) => {
        if (id === this.answers.persona) return;
        this.answers = withPersona(this.answers, id as PersonaId);
        this.render();
      }
    );
    for (const field of ["urgent", "junk", "delegates"] as const) {
      this.renderChips(parts[field], field, persona[field], this.answers[field], (id) => this.toggle(field, id));
    }
    this.renderChips(
      parts.strictness,
      "strictness",
      STRICTNESS_IDS.map((id) => ({ id, label: STRICTNESS[id].label })),
      [this.answers.strictness],
      (id) => {
        this.answers = { ...this.answers, strictness: id as Strictness };
        this.render();
      }
    );
  }

  private toggle(field: ChoiceField, id: string): void {
    const current = this.answers[field];
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    this.answers = { ...this.answers, [field]: next };
    this.render();
  }

  private renderChips(
    container: HTMLElement,
    tone: "persona" | ChoiceField | "strictness",
    items: Array<{ id: string; label: string }>,
    selected: string[],
    onPick: (id: string) => void
  ): void {
    const radio = tone === "persona" || tone === "strictness";
    const active = this.parts?.root.activeElement;
    const focusedId = active instanceof HTMLElement && container.contains(active) ? active.dataset.choice : undefined;
    const buttons = items.map((item) => {
      const button = this.doc.createElement("button");
      button.type = "button";
      if (tone !== "strictness") button.className = "chip";
      button.dataset.tone = tone;
      button.dataset.choice = item.id;
      button.textContent = item.label;
      const on = String(selected.includes(item.id));
      if (radio) {
        button.setAttribute("role", "radio");
        button.setAttribute("aria-checked", on);
      } else {
        button.setAttribute("aria-pressed", on);
      }
      button.addEventListener("click", () => onPick(item.id));
      return button;
    });
    container.replaceChildren(...buttons);
    buttons.find((button) => button.dataset.choice === focusedId)?.focus();
  }
}
