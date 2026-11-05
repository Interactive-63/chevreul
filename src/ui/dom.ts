// Developed by Interactive 63 (https://interactive63.com)
//
// Small DOM helpers shared by the screens. Text always goes in through textContent, so a typed value is never parsed
// as markup.

// Thin paint layers kept on a floor, as older ones would be hidden by its height anyway.
const FLOOR_LIMIT = 10;

/** Finds an element the application shell guarantees. A missing one is a build fault, so it throws. */
export function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`The page has no element with the id ${id}.`);
  return element as T;
}

/** Creates an element with classes and optional text. */
export function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

/** Waits for any CSS animations on an element. With reduced motion there are none, so this returns at once. */
export async function animationsDone(target: HTMLElement): Promise<void> {
  await Promise.allSettled(target.getAnimations().map((animation) => animation.finished));
}

/** Adds a thin strip of paint to a floor, keeping only the most recent layers. */
export function stackLayer(floor: HTMLElement, hex: string): void {
  const layer = element('i', 'block h-0.75 flex-none');
  layer.style.backgroundColor = hex;
  floor.prepend(layer);
  while (floor.children.length > FLOOR_LIMIT) floor.lastElementChild?.remove();
}
