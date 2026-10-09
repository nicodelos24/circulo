export type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'html') node.innerHTML = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function on<K extends keyof HTMLElementEventMap>(
  target: EventTarget,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, handler as EventListener, options);
  return () => target.removeEventListener(type, handler as EventListener, options);
}

/** Botón con estado activo, para la barra de transporte. */
export function toggleButton(
  label: string,
  className: string,
  onToggle: (active: boolean) => void,
): { element: HTMLButtonElement; setActive(active: boolean): void; setLabel(label: string): void } {
  const button = el('button', { class: className, type: 'button' });
  const setLabel = (text: string) => {
    button.textContent = text;
  };
  setLabel(label);
  let active = false;
  const setActive = (value: boolean) => {
    active = value;
    button.classList.toggle('is-active', value);
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    setActive(!active);
    onToggle(active);
  });
  return { element: button, setActive, setLabel };
}

export function toastContainer(): HTMLElement {
  let container = document.querySelector<HTMLElement>('.toasts');
  if (!container) {
    container = el('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(container);
  }
  return container;
}

export function toast(message: string, ms = 2200): void {
  const node = el('div', { class: 'toast', text: message });
  toastContainer().append(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 260);
  }, ms);
}

/** Hoja inferior que sube desde el borde inferior sin bloquear el tablero. */
export function sheet(id: string, title: string): { root: HTMLElement; body: HTMLElement; open(): void; close(): void; toggle(): void } {
  const body = el('div', { class: 'sheet-body' });
  const close = el('button', { class: 'sheet-close', type: 'button', 'aria-label': 'Cerrar' }, ['✕']);
  const root = el('section', { class: 'sheet', id, 'aria-hidden': 'true' }, [
    el('header', { class: 'sheet-head' }, [el('h2', { text: title }), close]),
    body,
  ]);
  document.body.append(root);
  let isOpen = false;
  const apply = () => {
    root.classList.toggle('is-open', isOpen);
    root.setAttribute('aria-hidden', String(!isOpen));
  };
  close.addEventListener('click', () => {
    isOpen = false;
    apply();
  });
  root.addEventListener('pointerdown', (event) => {
    if (event.target === root) {
      isOpen = false;
      apply();
    }
  });
  return {
    root,
    body,
    open() {
      isOpen = true;
      apply();
    },
    close() {
      isOpen = false;
      apply();
    },
    toggle() {
      isOpen = !isOpen;
      apply();
    },
  };
}

export function segmented<T extends string>(
  options: { value: T; label: string }[],
  active: T,
  onChange: (value: T) => void,
): { element: HTMLElement; setActive(value: T): void } {
  const buttons = new Map<T, HTMLButtonElement>();
  const element = el('div', { class: 'segmented', role: 'tablist' });
  for (const option of options) {
    const button = el('button', {
      class: 'segmented-item',
      type: 'button',
      role: 'tab',
      'data-value': option.value,
    }, [option.label]);
    button.addEventListener('click', () => onChange(option.value));
    buttons.set(option.value, button);
    element.append(button);
  }
  const setActive = (value: T) => {
    for (const [key, button] of buttons) button.classList.toggle('is-active', key === value);
  };
  setActive(active);
  return { element, setActive };
}
