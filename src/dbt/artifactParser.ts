import {
  DbtColumnMetadata,
  DbtMetadataIndex,
  DbtModelMetadata,
  DbtResourceType,
  RawCatalogJson,
  RawCatalogNode,
  RawManifestJson,
  RawManifestNode
} from './types';

const SUPPORTED_NODE_TYPES = new Set<string>(['model', 'seed', 'snapshot']);

export function createEmptyMetadataIndex(): DbtMetadataIndex {
  return {
    byUniqueId: new Map<string, DbtModelMetadata>(),
    modelsByName: new Map<string, DbtModelMetadata>(),
    sourcesByKey: new Map<string, DbtModelMetadata>(),
    relationsByIdentifier: new Map<string, DbtModelMetadata>()
  };
}

function cleanPatchPath(rawPatchPath?: string): string | undefined {
  if (!rawPatchPath) {
    return undefined;
  }
  const separatorIdx = rawPatchPath.indexOf('://');
  return separatorIdx !== -1 ? rawPatchPath.slice(separatorIdx + 3) : rawPatchPath;
}

function upsertColumn(
  model: DbtModelMetadata,
  rawColumnName: string,
  dataType?: string,
  description?: string
): DbtColumnMetadata {
  const normalizedKey = rawColumnName.toLowerCase();
  let col = model.columns.get(normalizedKey);

  if (!col) {
    col = {
      name: rawColumnName,
      dataType: dataType || undefined,
      description: description || undefined,
      tests: [],
      modelName: model.name,
      modelUniqueId: model.uniqueId
    };
    model.columns.set(normalizedKey, col);
  } else {
    if (dataType && !col.dataType) {
      col.dataType = dataType;
    }
    if (description && !col.description) {
      col.description = description;
    }
  }

  return col;
}

function registerManifestEntry(
  index: DbtMetadataIndex,
  uniqueId: string,
  node: RawManifestNode,
  resourceType: DbtResourceType,
  projectRoot: string
): void {
  const name = node.name;
  if (!name) {
    return;
  }

  const physicalIdentifier = node.alias || node.identifier || name;
  const modelMeta: DbtModelMetadata = {
    uniqueId,
    name,
    resourceType,
    sourceName: node.source_name,
    database: node.database,
    schema: node.schema,
    alias: physicalIdentifier,
    description: node.description || undefined,
    originalFilePath: node.original_file_path,
    patchPath: cleanPatchPath(node.patch_path),
    projectRoot,
    columns: new Map<string, DbtColumnMetadata>()
  };

  if (node.columns) {
    for (const [colKey, rawCol] of Object.entries(node.columns)) {
      const colName = rawCol.name || colKey;
      upsertColumn(modelMeta, colName, rawCol.data_type, rawCol.description);
    }
  }

  index.byUniqueId.set(uniqueId, modelMeta);
  index.relationsByIdentifier.set(physicalIdentifier.toLowerCase(), modelMeta);
  index.relationsByIdentifier.set(name.toLowerCase(), modelMeta);

  if (resourceType === 'source' && node.source_name) {
    const sourceKey = `${node.source_name.toLowerCase()}.${name.toLowerCase()}`;
    index.sourcesByKey.set(sourceKey, modelMeta);
  } else {
    index.modelsByName.set(name.toLowerCase(), modelMeta);
  }
}

function attachManifestTests(index: DbtMetadataIndex, nodes: Record<string, RawManifestNode>): void {
  for (const node of Object.values(nodes)) {
    if (node.resource_type !== 'test' || !node.test_metadata?.name) {
      continue;
    }

    const testName = node.test_metadata.name;
    const columnName = node.column_name || node.test_metadata.kwargs?.column_name;
    if (!columnName) {
      continue;
    }

    const targetNodeIds: string[] = [];
    if (node.attached_node) {
      targetNodeIds.push(node.attached_node);
    } else if (node.depends_on?.nodes) {
      targetNodeIds.push(...node.depends_on.nodes);
    }

    for (const targetId of targetNodeIds) {
      const targetModel = index.byUniqueId.get(targetId);
      if (!targetModel) {
        continue;
      }

      const col = upsertColumn(targetModel, columnName);
      if (!col.tests.includes(testName)) {
        col.tests.push(testName);
      }
    }
  }
}

export function mergeManifestIntoIndex(
  index: DbtMetadataIndex,
  rawManifestText: string,
  projectRoot: string
): void {
  const manifest = JSON.parse(rawManifestText) as RawManifestJson;

  if (manifest.nodes) {
    for (const [uniqueId, node] of Object.entries(manifest.nodes)) {
      const rType = node.resource_type;
      if (rType && SUPPORTED_NODE_TYPES.has(rType)) {
        registerManifestEntry(index, uniqueId, node, rType as DbtResourceType, projectRoot);
      }
    }
  }

  if (manifest.sources) {
    for (const [uniqueId, sourceNode] of Object.entries(manifest.sources)) {
      registerManifestEntry(index, uniqueId, sourceNode, 'source', projectRoot);
    }
  }

  if (manifest.nodes) {
    attachManifestTests(index, manifest.nodes);
  }
}

function mergeCatalogEntries(
  index: DbtMetadataIndex,
  entries: Record<string, RawCatalogNode>,
  fallbackResourceType: DbtResourceType,
  projectRoot: string
): void {
  for (const [uniqueId, catalogNode] of Object.entries(entries)) {
    let modelMeta = index.byUniqueId.get(uniqueId);

    // If catalog.json exists without a matching manifest entry, create a fallback entry
    if (!modelMeta && catalogNode.metadata?.name) {
      const parts = uniqueId.split('.');
      const entityName = parts[parts.length - 1] || catalogNode.metadata.name;
      const sourceName = fallbackResourceType === 'source' && parts.length >= 3 ? parts[parts.length - 2] : undefined;

      modelMeta = {
        uniqueId,
        name: entityName,
        resourceType: fallbackResourceType,
        sourceName,
        database: catalogNode.metadata.database,
        schema: catalogNode.metadata.schema,
        alias: catalogNode.metadata.name,
        projectRoot,
        columns: new Map<string, DbtColumnMetadata>()
      };

      index.byUniqueId.set(uniqueId, modelMeta);
      index.relationsByIdentifier.set(catalogNode.metadata.name.toLowerCase(), modelMeta);
      index.relationsByIdentifier.set(entityName.toLowerCase(), modelMeta);

      if (fallbackResourceType === 'source' && sourceName) {
        index.sourcesByKey.set(`${sourceName.toLowerCase()}.${entityName.toLowerCase()}`, modelMeta);
      } else {
        index.modelsByName.set(entityName.toLowerCase(), modelMeta);
      }
    }

    if (!modelMeta || !catalogNode.columns) {
      continue;
    }

    for (const [colKey, rawCatalogCol] of Object.entries(catalogNode.columns)) {
      const colName = rawCatalogCol.name || colKey;
      const col = upsertColumn(
        modelMeta,
        colName,
        rawCatalogCol.type,
        rawCatalogCol.comment
      );
      // Catalog physical data type takes priority when present
      if (rawCatalogCol.type) {
        col.dataType = rawCatalogCol.type;
      }
    }
  }
}

export function mergeCatalogIntoIndex(
  index: DbtMetadataIndex,
  rawCatalogText: string,
  projectRoot: string
): void {
  const catalog = JSON.parse(rawCatalogText) as RawCatalogJson;

  if (catalog.nodes) {
    mergeCatalogEntries(index, catalog.nodes, 'model', projectRoot);
  }

  if (catalog.sources) {
    mergeCatalogEntries(index, catalog.sources, 'source', projectRoot);
  }
}