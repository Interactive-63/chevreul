// Developed by Interactive 63 (https://interactive63.com)
//
// The about panel: opens the dialog from the roll. Its wording lives in index.html, and its close button is a
// method="dialog" form, so the browser handles closing, Esc and returning focus.
import { byId } from './dom';

/** Connects the About button to its dialog. */
export function mountAbout(): void {
  const dialog = byId<HTMLDialogElement>('about');
  byId('open-about').addEventListener('click', () => dialog.showModal());
}
