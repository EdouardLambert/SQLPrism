export type DbtResourceType = 'model' | 'seed' | 'snapshot' | 'source';

export interface DbtColumnMetadata {
  name: string;
  dataType?: string;
  description?: string;
  tests: string[];
  modelName: string;
  modelUniqueId: string;
}

export interface DbtModelMetadata {
  uniqueId: string;
  name: string;
  resourceType: DbtResourceType;
  sourceName?: string;
  database?: string;
  schema?: string;
  alias?: string;
  description?: string;
  originalFilePath?: string;
  patchPath?: string;
  projectRoot: string;
  columns: Map<string, DbtColumnMetadata>;
}

export interface DbtMetadataIndex {
  byUniqueId: Map<string, DbtModelMetadata>;
  modelsByName: Map<string, DbtModelMetadata>;
  sourcesByKey: Map<string, DbtModelMetadata>;
  relationsByIdentifier: Map<string, DbtModelMetadata>;
}

// Partial raw structures for dbt manifest.json
export interface RawManifestColumn {
  name?: string;
  description?: string;
  data_type?: string;
}

export interface RawManifestNode {
  unique_id?: string;
  name?: string;
  resource_type?: string;
  source_name?: string;
  database?: string;
  schema?: string;
  alias?: string;
  identifier?: string;
  description?: string;
  original_file_path?: string;
  patch_path?: string;
  columns?: Record<string, RawManifestColumn>;
  column_name?: string;
  attached_node?: string;
  depends_on?: {
    nodes?: string[];
  };
  test_metadata?: {
    name?: string;
    kwargs?: {
      column_name?: string;
    };
  };
}

export interface RawManifestJson {
  nodes?: Record<string, RawManifestNode>;
  sources?: Record<string, RawManifestNode>;
}

// Partial raw structures for dbt catalog.json
export interface RawCatalogColumn {
  name?: string;
  type?: string;
  index?: number;
  comment?: string;
}

export interface RawCatalogNode {
  unique_id?: string;
  metadata?: {
    type?: string;
    database?: string;
    schema?: string;
    name?: string;
  };
  columns?: Record<string, RawCatalogColumn>;
}

export interface RawCatalogJson {
  nodes?: Record<string, RawCatalogNode>;
  sources?: Record<string, RawCatalogNode>;
}