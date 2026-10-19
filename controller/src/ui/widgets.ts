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
}

export function slider(o: SliderOptions) {
  const output = el("output");
  const input = el("input", { type: "range", min: String(o.min), max: String(o.max), step: String(o.step ?? 1) });
  const show = (v: number) => {
    input.value = String(v);
    output.textContent = o.format(v);
  };
  show(o.value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    output.textContent = o.format(v);
    o.onInput(v);
  });
  const head = el("div", { className: "nj-row-head" }, [el("span", { textContent: o.label }), el("span", { className: "nj-row-value" }, o.extra ? [output, o.extra] : [output])]);
  return { el: el("label", { className: "nj-row" }, [head, input]), set: show, input };
}

export function button(label: string, onClick: () => void, className = "") {
  const b = el("button", { type: "button", textContent: label, className });
  b.addEventListener("click", onClick);
  return b;
}

export function toggle(label: string, on: boolean, onChange: (on: boolean) => void) {
  const input = el("input", { type: "checkbox", checked: on });
  input.addEventListener("change", () => onChange(input.checked));
  return { el: el("label", { className: "nj-row nj-check" }, [input, el("span", { textContent: label })]), input };
}

/** percent slider over a 0…1 value */
export const pct = (v: number) => Math.round(v * 100);
