import { DbtModelMetadata } from '../dbt/types';

export interface LineageHop {
  relationName: string;
  columnName: string;
  kind: 'dbtModel' | 'dbtSource' | 'cte' | 'table';
}

export interface ResolvedColumn {
  name: string;
  dataType?: string;
  description?: string;
  tests: string[];
  originModel?: DbtModelMetadata;
  originColumnName?: string;
  lineageChain: LineageHop[];
}

export interface ResolvedRelation {
  name: string;
  alias: string;
  kind: 'dbtModel' | 'dbtSource' | 'cte' | 'rawTable';
  dbtModel?: DbtModelMetadata;
  columns: Map<string, ResolvedColumn>;
}

export interface RegionScope {
  cteName: string | null;
  startOffset: number;
  endOffset: number;
  relationsByAlias: Map<string, ResolvedRelation>;
  defaultRelation?: ResolvedRelation;
}

export interface JinjaRefMatch {
  startOffset: number;
  endOffset: number;
  kind: 'ref' | 'source';
  modelName: string;
  sourceName?: string;
  dbtModel?: DbtModelMetadata;
}

export interface CteDefinitionSpan {
  name: string;
  nameStartOffset: number;
  nameEndOffset: number;
  headerStartOffset: number;
  openParenOffset: number;
  closeParenOffset: number;
}

export interface DocumentLineage {
  cteDefinitions: Map<string, CteDefinitionSpan>;
  cteRelations: Map<string, ResolvedRelation>;
  scopes: RegionScope[];
  jinjaMatches: JinjaRefMatch[];
  getScopeAtOffset(offset: number): RegionScope;
  resolvePrefixRelation(prefix: string, offset: number): ResolvedRelation | undefined;
}