// Developed by Interactive 63 (https://interactive63.com)
//
// The photo side of the working area: a drop area until a photo is open, then the picture with a pin and magnifier.
// The pin moves by click, drag or arrow keys, and the target becomes the average of the pixels under it.
// The photo stays in memory only, so a reload returns to the colour box.
import { PAPER, rgbToHex, SOOT } from '../app/format';
import { decodePhoto, SAMPLE_RADIUS, sampleArea } from '../app/photo';
import type { PhotoPick, Store } from '../app/state';
import { element } from './dom';

// Source pixels shown across the magnifier, and its drawn size. CSS scales it down on a phone.
const LOUPE_SPAN = 15;
const LOUPE_SIZE = 112;
// Gap between the pin and the magnifier, and the margin kept from the picture's edge.
const LOUPE_GAP = 18;
const LOUPE_MARGIN = 4;
// Source pixels moved by one arrow key press.
const KEY_STEP = 8;

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Decodes a chosen file into the store, or raises the file notice. */
async function openFile(file: File, store: Store): Promise<void> {
  try {
    store.setPhoto(await decodePhoto(file));
    if (store.getState().notice === 'photo') store.dismissNotice();
  } catch {
    store.showNotice('photo');
  }
}

/** Shows the area a photo can be dropped on or chosen from. */
function showDrop(work: HTMLElement, store: Store): void {
  const area = element(
    'label',
    'm-[clamp(0.625rem,2vw,1.125rem)] flex min-w-0 flex-1 flex-col items-start justify-end gap-2 border-2 border-dashed border-canvas p-[clamp(0.875rem,3vw,1.75rem)] transition-colors duration-150 focus-within:outline-2 focus-within:outline-paper hover:bg-bare data-over:bg-bare',
  );
  const input = element('input', 'sr-only');
  input.type = 'file';
  input.accept = 'image/*';
  area.append(
    element('h2', 'max-w-[18ch] font-display text-[clamp(1.625rem,3.5vw,2.5rem)] leading-tight text-balance', 'Drop a photo here'),
    element('p', 'max-w-[44ch]', 'Or choose one from this device. Photos stay on your device and are never uploaded.'),
    element('span', 'tool inline-flex items-center bg-paper text-soot', 'Choose a photo'),
    input,
  );
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void openFile(file, store);
  });
  area.addEventListener('dragover', (event) => {
    event.preventDefault();
    area.toggleAttribute('data-over', true);
  });
  area.addEventListener('dragleave', () => area.toggleAttribute('data-over', false));
  area.addEventListener('drop', (event) => {
    event.preventDefault();
    area.toggleAttribute('data-over', false);
    const file = event.dataTransfer?.files[0];
    if (file) void openFile(file, store);
  });
  work.replaceChildren(area);
}

/** Shows the open photo with its pin and magnifier. Returns a function that stops watching for resizes. */
function showPicture(work: HTMLElement, store: Store, photo: PhotoPick): () => void {
  const box = element('div', 'absolute inset-0 touch-none overflow-hidden');
  const picture = element('canvas', 'absolute inset-0 block size-full cursor-crosshair');
  picture.tabIndex = 0;
  picture.setAttribute('role', 'application');
  picture.setAttribute('aria-label', 'Photo. Click or use the arrow keys to choose a colour.');
  const pin = element('div', 'pointer-events-none absolute -mt-2.25 -ml-2.25 size-4.5 border-2 border-paper outline-2 outline-soot');
  const loupe = element('canvas', 'pointer-events-none absolute size-22 border-3 border-paper outline-2 outline-soot [image-rendering:pixelated] sm:size-28');
  loupe.width = LOUPE_SIZE;
  loupe.height = LOUPE_SIZE;
  const bar = element('div', 'pointer-events-none absolute inset-x-2.5 top-2.5 flex items-start justify-between gap-1.5');
  const privacy = element('small', 'bg-soot px-2 py-1.5 font-mono text-[0.6875rem] leading-tight', 'Photos stay on your device');
  const change = element('button', 'tool pointer-events-auto bg-soot text-paper enabled:hover:bg-ink', 'Change photo');
  change.type = 'button';
  bar.append(privacy, change);
  box.append(picture, pin, loupe, bar);
  work.replaceChildren(box);

  const { canvas: source, pixels } = photo;
  let view = { scale: 1, x: 0, y: 0 };
  let pinned = photo.pin;

  /** Places the pin and magnifier over the picture and redraws the magnifier. */
  function drawMarkers(x: number, y: number): void {
    const pinX = view.x + x * view.scale;
    const pinY = view.y + y * view.scale;
    const size = loupe.offsetWidth;
    pin.style.left = `${pinX}px`;
    pin.style.top = `${pinY}px`;
    const beyondEdge = pinX + LOUPE_GAP + size > box.clientWidth;
    loupe.style.left = `${beyondEdge ? pinX - LOUPE_GAP - size : pinX + LOUPE_GAP}px`;
    loupe.style.top = `${Math.max(LOUPE_MARGIN, Math.min(box.clientHeight - size - LOUPE_MARGIN, pinY - size / 2))}px`;

    const context = loupe.getContext('2d');
    if (!context) return;
    const half = LOUPE_SPAN >> 1;
    context.imageSmoothingEnabled = false;
    context.fillStyle = SOOT;
    context.fillRect(0, 0, LOUPE_SIZE, LOUPE_SIZE);
    context.drawImage(source, x - half, y - half, LOUPE_SPAN, LOUPE_SPAN, 0, 0, LOUPE_SIZE, LOUPE_SIZE);
    const cell = LOUPE_SIZE / LOUPE_SPAN;
    const side = (SAMPLE_RADIUS * 2 + 1) * cell;
    context.strokeStyle = PAPER;
    context.strokeRect((LOUPE_SIZE - side) / 2, (LOUPE_SIZE - side) / 2, side, side);
  }

  /** Moves the pin to a source pixel and sets the target from the area under it. */
  function pick(rawX: number, rawY: number): void {
    const x = Math.max(0, Math.min(source.width - 1, Math.round(rawX)));
    const y = Math.max(0, Math.min(source.height - 1, Math.round(rawY)));
    pinned = { x, y };
    drawMarkers(x, y);
    const rgb = sampleArea(pixels, x, y, SAMPLE_RADIUS);
    if (rgb) store.pickFromPhoto(x, y, rgbToHex(rgb));
  }

  /** Scales the picture to fit without cropping, and restores the pin. A new photo starts with the pin in the centre. */
  function fit(): void {
    const width = picture.clientWidth;
    const height = picture.clientHeight;
    if (!width || !height) return;
    picture.width = width;
    picture.height = height;
    const scale = Math.min(width / source.width, height / source.height);
    view = { scale, x: (width - source.width * scale) / 2, y: (height - source.height * scale) / 2 };
    const context = picture.getContext('2d');
    if (context) {
      context.fillStyle = SOOT;
      context.fillRect(0, 0, width, height);
      context.drawImage(source, view.x, view.y, source.width * scale, source.height * scale);
    }
    if (pinned) drawMarkers(pinned.x, pinned.y);
    else pick(source.width / 2, source.height / 2);
  }

  /** Converts a pointer position to a pixel on the source picture and picks there. */
  function pickAtPointer(event: PointerEvent): void {
    const bounds = picture.getBoundingClientRect();
    pick((event.clientX - bounds.left - view.x) / view.scale, (event.clientY - bounds.top - view.y) / view.scale);
  }

  picture.addEventListener('pointerdown', (event) => {
    picture.setPointerCapture(event.pointerId);
    pickAtPointer(event);
  });
  picture.addEventListener('pointermove', (event) => {
    if (event.buttons) pickAtPointer(event);
  });
  picture.addEventListener('keydown', (event) => {
    const step = ARROWS[event.key];
    if (!step || !pinned) return;
    event.preventDefault();
    pick(pinned.x + step[0] * KEY_STEP, pinned.y + step[1] * KEY_STEP);
  });
  change.addEventListener('click', () => store.setPhoto(null));

  const resizes = new ResizeObserver(fit);
  resizes.observe(box);
  return () => resizes.disconnect();
}

/** Fills the working area with the photo side, and returns a function that cleans up when it is replaced. */
export function showPhotoPane(work: HTMLElement, store: Store): () => void {
  const { photo } = store.getState();
  if (photo) return showPicture(work, store, photo);
  showDrop(work, store);
  return () => {};
}
