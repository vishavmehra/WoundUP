// Which GLBs of the catalogue exist yet. The Well's and the Belfry's files (ADR-048) are listed in `PENDING_MODEL_PATHS` until the asset agents
// deliver them; the suites that read the real files cover what is delivered and say so about the rest (see tests/content/pending-models.test.ts).
import type { MachineBlueprint } from '../../src/content/blueprints';
import { MODEL_PATHS, requirePart } from '../../src/content/parts';

export const delivered = (assetId: string): boolean => Object.prototype.hasOwnProperty.call(MODEL_PATHS, assetId);

/** True when the housing and every part of the intended build have a GLB. */
export const blueprintDelivered = (bp: MachineBlueprint): boolean => delivered(bp.housing.assetId) && Object.values(bp.intended).every((id) => delivered(requirePart(id).visual.assetId));
