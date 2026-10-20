/** Small DOM helpers for the menu and the edit toolbar. */

/** An element with properties (textContent, className, type, value…) and children. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const node: HTMLElementTagNameMap[K] = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  format(value: number): string;
  onInput(value: number): void;
  /** extra element shown next to the value (e.g. an "auto" button) */
  extra?: HTMLElement;
  /** up means more; the value and `note` sit beside the slider */
  vertical?: boolean;
  /** small text under the value of a vertical slider */
  note?: string;
  disabled?: boolean;
  /**
   * A finger or mouse started (true) or ended (false) dragging this slider; its row has the
   * `dragging` class meanwhile. Keyboard changes never call it.
   */
  onDrag?(dragging: boolean): void;
}

/** A labeled range input; the filled part follows the value through `--fill`. */
export function slider(o: SliderOptions) {
  const output = el("output");
  const input = el("input", { type: "range", min: String(o.min), max: String(o.max), step: String(o.step ?? 1), disabled: o.disabled ?? false });
  if (o.vertical) input.classList.add("nj-vertical");
  const show = (v: number) => {
    input.value = String(v);
    output.textContent = o.format(v);
    input.style.setProperty("--fill", `${((v - o.min) / (o.max - o.min)) * 100}%`);
  };
  show(o.value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    show(v);
    o.onInput(v);
  });
  const label = el("span", { textContent: o.label });
  const row = o.vertical
    ? el("label", { className: "nj-row nj-vrow" }, [input, el("span", { className: "nj-vmeta" }, [label, output, ...(o.note ? [el("small", { textContent: o.note })] : [])])])
    : el("label", { className: "nj-row" }, [el("div", { className: "nj-row-head" }, [label, el("span", { className: "nj-row-value" }, o.extra ? [output, o.extra] : [output])]), input]);
  if (o.onDrag) {
    input.addEventListener("pointerdown", () => {
      row.classList.add("dragging");
      o.onDrag!(true);
      const end = () => {
        removeEventListener("pointerup", end);
        removeEventListener("pointercancel", end);
        row.classList.remove("dragging");
        o.onDrag!(false);
      };
      addEventListener("pointerup", end);
      addEventListener("pointercancel", end);
    });
  }
  return { el: row, set: show, input };
}

export function button(label: string, onClick: () => void, className = "") {
  const b = el("button", { type: "button", textContent: label, className });
  b.addEventListener("click", onClick);
  return b;
}

/** A button with an icon (inline SVG markup) above or beside its label. */
export function iconButton(icon: string, label: string, onClick: () => void, className = "") {
  const b = el("button", { type: "button", className }, [el("span", { className: "nj-icon", innerHTML: icon, ariaHidden: "true" }), label]);
  b.addEventListener("click", onClick);
  return b;
}

export function toggle(label: string, on: boolean, onChange: (on: boolean) => void) {
  const input = el("input", { type: "checkbox", checked: on });
  input.addEventListener("change", () => onChange(input.checked));
  return { el: el("label", { className: "nj-row nj-check" }, [input, el("span", { textContent: label })]), input };
}

/** An on/off switch row with a title and a hint (or the reason it is unavailable). */
export function switchRow(o: { label: string; hint: string; on: boolean; disabled?: boolean; onChange(on: boolean): void }) {
  const input = el("input", { type: "checkbox", role: "switch", checked: o.on, disabled: o.disabled ?? false, className: "nj-switch" });
  input.addEventListener("change", () => o.onChange(input.checked));
  return { el: el("label", { className: "nj-switch-row" }, [el("span", {}, [el("strong", { textContent: o.label }), el("small", { textContent: o.hint })]), input]), input };
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  note?: string;
  tag?: string;
}

/** One choice among a few, as native radio inputs (arrow keys and screen readers work). */
export function choices<T extends string>(o: { name: string; label: string; options: Choice<T>[]; value: T; className?: string; disabled?: boolean; onChange(value: T): void }) {
  const group = el("div", { className: `nj-choices ${o.className ?? ""}`, role: "radiogroup", ariaLabel: o.label });
  for (const option of o.options) {
    const input = el("input", { type: "radio", name: o.name, value: option.value, checked: option.value === o.value, disabled: o.disabled ?? false });
    input.addEventListener("change", () => input.checked && o.onChange(option.value));
    const title = el("strong", { textContent: option.label }, option.tag ? [el("span", { className: "nj-tag", textContent: option.tag })] : []);
    group.append(el("label", { className: "nj-choice" }, [input, el("span", {}, [title, ...(option.note ? [el("small", { textContent: option.note })] : [])])]));
  }
  return group;
}

/** percent slider over a 0…1 value */
export const pct = (v: number) => Math.round(v * 100);
