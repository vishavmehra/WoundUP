// Types for tools/lib/glb-validate.mjs, so tests/ (TypeScript, strict) can import it. The manifest is read loosely on purpose.
export interface ManifestEntry {
  id: string;
  [field: string]: unknown;
}
export interface Finding {
  level: 'FAIL' | 'WARN';
  id: string;
  msg: string;
}
export interface GlbResult {
  id: string;
  label: 'GLB' | 'legacy M0 file';
  file: string;
  sha256: string;
  bytes: number;
  status: unknown;
  verdict: 'PASS' | 'WARN' | 'FAIL';
  findings: Finding[];
  passed: string[];
  skipped: { id: string; why: string }[];
  metrics: Record<string, unknown> & { geometryHash?: string; nearKey?: string; imageHashes?: string[] };
}
export interface ValidateContext {
  materialLibrary: string[];
  color0Severity?: 'FAIL' | 'WARN';
  legacy?: boolean;
  file?: string;
}
export interface CrossOptions {
  root?: string;
  manifestWide?: boolean;
}
export interface CrossResult {
  findings: Finding[];
  uniqueGeometryByLabel: Record<string, number>;
  assetIdReferences: number | null;
}
export const LIMITS: Readonly<Record<string, number>>;
export const ALLOWED_EXTENSIONS: string[];
export const CHECK_ORDER: string[];
export function parseContainer(buf: Uint8Array): { errs: string[]; json: unknown; bin: Uint8Array | null };
export function loadThree(): Promise<unknown>;
export function validateGlb(input: Uint8Array, entry: ManifestEntry, ctx: ValidateContext): Promise<GlbResult>;
export function crossChecks(results: GlbResult[], manifest: { assets?: ManifestEntry[] }, opts?: CrossOptions): CrossResult;
