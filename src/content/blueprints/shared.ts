// Small helpers the three blueprint files share.
import { isFastener, partIdsForAsset, partIdsOfFamily } from '../parts/catalogue';
import type { TrayEntry } from './types';

/** The part id of an asset (one per asset today). Throws on a typo, so a wrong id fails at import, not in the headset. */
export function partId(assetId: string): string {
  const ids = partIdsForAsset(assetId);
  if (ids.length !== 1) throw new Error(`asset "${assetId}" has ${ids.length} part definitions, expected 1`);
  return ids[0];
}

/** Gear sockets take any spur gear: a wrong size has to be placeable so it can run wrong (PRODUCT_SPEC §9). A different module jams. */
export const SPUR_GEAR_IDS: readonly string[] = partIdsOfFamily('spur_gear');

/**
 * Tray of a first build: what the intended assembly needs, counted per part id in first-seen order, then the decoys. Hardware is never in a tray: it
 * arrives in its stage's bag and is handed out by the caddy (INTRICATE_ASSEMBLY_DESIGN §3.5), so the tray stays the machine's big parts.
 */
export function trayOf(intended: Readonly<Record<string, string>>, decoys: readonly string[] = []): TrayEntry[] {
  const counts = new Map<string, number>();
  for (const id of Object.values(intended)) if (!isFastener(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [
    ...[...counts].map(([id, quantity]): TrayEntry => ({ partId: id, quantity })),
    ...decoys.map((id): TrayEntry => ({ partId: id, quantity: 1, decoy: true })),
  ];
}
