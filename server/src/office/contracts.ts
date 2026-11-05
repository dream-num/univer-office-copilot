import type {
  FileType,
  DocumentFlavor,
  FileExportFormat,
  FileVersion,
  Location,
  OfficeAction,
  OfficeFile,
} from '@univer-copilot/shared';

export type OfficeResult = {
  summary: string;
  content?: unknown;
  location?: Location;
  revision?: number;
  changesetId?: string;
  checked?: boolean;
  documentState?: unknown;
};
export type OfficeCommit = {
  unitId: string;
  actorId: string;
  revision: number;
  changesetId: string;
  runId?: string;
  operationId?: string;
};
export type OfficeWorkerAction =
  | OfficeAction
  | CompiledSlideAction
  | { kind: 'read-snapshot' }
  | { kind: 'restore'; revision: number; expectedRevision: number };
export type CompiledSlideAction = {
  kind: 'slide.compiled';
  page: number;
  program: string;
  diagnostics: {
    viewport: { width: number; height: number };
    lints: string[];
    textMeasure: string;
  };
};
export type OfficeVisualTarget = {
  kind: 'preview' | 'lint';
  pages?: number[];
  range?: string;
  sheetName?: string;
  region?: { left: number; top: number; width: number; height: number };
  elementIds?: string[];
  padding?: number;
  scale?: number;
};
export type OfficeVisualResult = {
  report?: unknown;
  images?: {
    url: string;
    width: number;
    height: number;
    page?: number;
    layoutAnalysis?: unknown;
  }[];
};
export type OfficeInitialData = { data: Record<string, unknown>; documentState?: unknown };
export type OfficeImport = OfficeInitialData & {
  type: FileType;
  name: string;
  documentFlavor?: DocumentFlavor;
};
export interface OfficeGateway {
  create(file: OfficeFile, actorId: string, initial?: OfficeInitialData): Promise<void>;
  inspect(file: OfficeFile, actorId: string): Promise<unknown>;
  revision(file: OfficeFile, actorId: string): Promise<number>;
  snapshot(file: OfficeFile, actorId: string): Promise<Record<string, unknown>>;
  api(input: { symbols?: string[]; terms?: string[]; unit: FileType }): unknown;
  resources(input: {
    action: 'registries' | 'find' | 'read';
    queries?: string[];
    handle?: string;
  }): Promise<unknown>;
  visual(
    file: OfficeFile,
    actorId: string,
    target: OfficeVisualTarget,
  ): Promise<OfficeVisualResult>;
  readImage(unitId: string, imageId: string): Promise<Uint8Array>;
  execute(
    file: OfficeFile,
    actorId: string,
    runId: string,
    operationId: string,
    action: OfficeAction,
    signal: AbortSignal,
  ): Promise<OfficeResult>;
  versions(file: OfficeFile, actorId: string): Promise<FileVersion[]>;
  preview(file: OfficeFile, actorId: string, revision: number): Promise<unknown>;
  restore(
    file: OfficeFile,
    actorId: string,
    revision: number,
    expectedRevision: number,
  ): Promise<number>;
  import(data: Uint8Array, filename: string, type?: FileType): Promise<OfficeImport>;
  export(
    file: OfficeFile,
    actorId: string,
    format?: FileExportFormat,
  ): Promise<{ bytes: Uint8Array; contentType: string; extension: string }>;
  close(): Promise<void>;
}
