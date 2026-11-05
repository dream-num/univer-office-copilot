import type { FileType, Location } from '@univer-copilot/shared';

export type VersionSnapshot = {
  unitId: string;
  type: FileType;
  revision: number;
  data: Record<string, unknown>;
};
export type VersionComparisonPage = {
  total: number;
  hasMore: boolean;
  approximate: boolean;
  items: {
    id: string;
    label: string;
    kind: 'insert' | 'delete' | 'update';
    details: { field: string; before: string; after: string }[];
  }[];
};
export type PreparedVersionComparison = { query(offset?: number): VersionComparisonPage };

export type EditorHandle = {
  flush(): Promise<void>;
  openHistory(): Promise<void>;
  compareVersions(before: VersionSnapshot, after: VersionSnapshot): PreparedVersionComparison;
  dispose(): void;
  selection(): Location | null;
  locate(location: Location): void;
};
