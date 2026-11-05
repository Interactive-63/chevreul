// Developed by Interactive 63 (https://interactive63.com)
//
// Browser entry point: loads the fonts and styles, restores the saved palette, and mounts each part of the interface.
import '@fontsource/young-serif/400.css';
import '@fontsource-variable/literata/opsz.css';
import '@fontsource/martian-mono/400.css';
import '@fontsource/martian-mono/600.css';
import './styles.css';
import { createMixClient, startMixWorker } from './app/mixer';
import { readPalette, writePalette } from './app/palette-store';
import { loadSwatches } from './app/paints';
import { createStore } from './app/state';
import { mountAbout } from './ui/about';
import { mountSetup } from './ui/setup';
import { mountStage } from './ui/stage';
import { mountTarget } from './ui/target';

const swatches = loadSwatches();
const saved = readPalette(new Set(swatches.map(({ paint }) => paint.id)));
const mixer = createMixClient(startMixWorker);
const store = createStore(saved.palette, {
  save: writePalette,
  cancelMix: () => mixer.cancel(),
});

mountStage(store, mixer, swatches);
mountTarget(store, mixer);
mountSetup(store, swatches);
mountAbout();
