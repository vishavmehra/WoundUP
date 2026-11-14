import './emulator.css';
// The package's own self-contained build: its React, three and pointer-event code stay inside the emulator chunk, so the game's
// shared chunks (which would otherwise absorb them) do not grow. Types come from the package root (devui-build.d.ts).
import { DevUI } from '@iwer/devui/build/iwer-devui.module.min.js';
import { metaQuest3, XRDevice } from 'iwer';
import { detectXrSupport } from '../xr-entry.js';
import { isHeadsetBrowser } from './guard.js';
import { mountHelpCard } from './help-card.js';

export interface BrowserHeadset {
  readonly device: XRDevice;
}

let started: Promise<BrowserHeadset> | undefined;

/**
 * "Play in your browser": installs IWER's emulated Meta Quest 3 (the runtime the IWSDK dev server injects on localhost) with
 * hands as the primary input and IWER's own control panel, over a plain warm backdrop (emulator.css). The game's normal
 * "Enter mixed reality" flow then runs against it unchanged. It only ever installs on a browser with no immersive WebXR and
 * never on a headset, whatever the caller asks. Idempotent: the emulator is installed once per page.
 */
export function startBrowserHeadset(): Promise<BrowserHeadset> {
  started ??= install().catch((error: unknown) => {
    started = undefined; // a failed install can be tried again
    throw error;
  });
  return started;
}

async function install(): Promise<BrowserHeadset> {
  if (isHeadsetBrowser(navigator.userAgent)) throw new Error('This browser is a headset and has its own mixed reality.');
  if ((await detectXrSupport()) !== 'none') throw new Error('This browser already supports WebXR, so there is nothing to emulate.');

  const room = document.createElement('div');
  room.className = 'wu-emu-room';
  const device = new XRDevice(metaQuest3, { canvasContainer: room });
  device.primaryInputMode = 'hand'; // before the panel, which reads it; the game is hands-only (CLAUDE.md §4)
  device.installRuntime({ forceInstall: true }); // desktop Chrome has a navigator.xr without a device, and IWER skips installing over it unless forced
  try {
    device.installDevUI(DevUI); // builds its own WebGL view, which can fail where the page's own context did not
    room.append(mountHelpCard());
  } catch (error) {
    device.uninstallRuntime(); // a half-installed headset would leave the page claiming WebXR it cannot deliver
    throw error;
  }

  // Same hook the dev runtime has, only for ?debug pages (QA drives the emulated hands through it).
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { IWER_DEVICE: device });
  return { device };
}
