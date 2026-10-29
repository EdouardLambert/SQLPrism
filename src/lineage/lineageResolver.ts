import { DbtTargetIndexer } from '../dbt/dbtIndexer';
import { DbtModelMetadata } from '../dbt/types';
import { sanitizeSql } from '../parser';
import {
  CteDefinitionSpan,
  DocumentLineage,
  JinjaRefMatch,
  LineageHop,
  RegionScope,
  ResolvedColumn,
  ResolvedRelation
} from './types';

const SQL_RESERVED_WORDS = new Set([
  'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'full',
  'outer', 'cross', 'natural', 'on', 'using', 'group', 'order', 'by',
  'having', 'limit', 'offset', 'fetch', 'union', 'all', 'intersect',
  'except', 'minus', 'with', 'recursive', 'as', 'distinct', 'into',
  'values', 'set', 'update', 'delete', 'insert', 'create', 'table',
  'view', 'temp', 'temporary', 'when', 'then', 'else', 'end', 'case',
  'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'between',
  'exists', 'cast', 'try_cast', 'safe_cast', 'over', 'partition',
  'qualify', 'window', 'lateral', 'unnest', 'pivot', 'unpivot'
]);

const JINJA_PLACEHOLDER_PREFIX = '__JINJA_';

function findMatchingCloseParen(text: string, openParenOffset: number): number {
  let depth = 0;
  for (let i = openParenOffset; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function createRelationFromDbtModel(model: DbtModelMetadata, alias: string): ResolvedRelation {
  const columns = new Map<string, ResolvedColumn>();
  const kind = model.resourceType === 'source' ? 'dbtSource' : 'dbtModel';
  const displayName =
    model.resourceType === 'source' && model.sourceName
      ? `${model.sourceName}.${model.name}`
      : model.name;

  for (const [colKey, colMeta] of model.columns.entries()) {
    const initialHop: LineageHop = {
      relationName: displayName,
      columnName: colMeta.name,
      kind
    };

    columns.set(colKey, {
      name: colMeta.name,
      dataType: colMeta.dataType,
      description: colMeta.description,
      tests: [...colMeta.tests],
      originModel: model,
      originColumnName: colMeta.name,
      lineageChain: [initialHop]
    });
  }

  return {
    name: displayName,
    alias,
    kind,
    dbtModel: model,
    columns
  };
}

function cloneRelationWithAlias(base: ResolvedRelation, alias: string): ResolvedRelation {
  return {
    ...base,
    alias,
    columns: new Map(base.columns)
  };
}

function extractJinjaMatches(rawSql: string, indexer: DbtTargetIndexer): Map<number, JinjaRefMatch> {
  const mapByStartOffset = new Map<number, JinjaRefMatch>();
  const jinjaRegex = /\{\{[\s\S]*?\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = jinjaRegex.exec(rawSql)) !== null) {
    const blockText = match[0];
    const startOffset = match.index;
    const endOffset = startOffset + blockText.length;

    const refMatch = blockText.match(
      /\bref\s*\(\s*['"]([^'"]+)['"](?:\s*,\s*['"]([^'"]+)['"])?\s*\)/
    );
    if (refMatch) {
      const modelName = refMatch[2] || refMatch[1];
      const dbtModel = indexer.getModelByRef(modelName);
      mapByStartOffset.set(startOffset, {
        startOffset,
        endOffset,
        kind: 'ref',
        modelName,
        dbtModel
      });
      continue;
    }

    const sourceMatch = blockText.match(
      /\bsource\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/
    );
    if (sourceMatch) {
      const sourceName = sourceMatch[1];
      const tableName = sourceMatch[2];
      const dbtModel = indexer.getSource(sourceName, tableName);
      mapByStartOffset.set(startOffset, {
        startOffset,
        endOffset,
        kind: 'source',
        sourceName,
        modelName: tableName,
        dbtModel
      });
    }
  }

  return mapByStartOffset;
}

function detectAllCteSpans(sanitized: string): CteDefinitionSpan[] {
  const cteSpans: CteDefinitionSpan[] = [];
  const recordedOpenParens = new Set<number>();
  const withStartRegex = /\bWITH(?:\s+RECURSIVE)?\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
  let withMatch: RegExpExecArray | null;

  while ((withMatch = withStartRegex.exec(sanitized)) !== null) {
    const firstCteName = withMatch[1];
    if (SQL_RESERVED_WORDS.has(firstCteName.toLowerCase())) {
      continue;
    }

    const nameRelIdx = withMatch[0].search(new RegExp(`\\b${firstCteName}\\b`));
    const nameStartOffset = withMatch.index + nameRelIdx;
    const nameEndOffset = nameStartOffset + firstCteName.length;
    const openParenOffset = withMatch.index + withMatch[0].length - 1;
    const closeParenOffset = findMatchingCloseParen(sanitized, openParenOffset);

    if (closeParenOffset === -1 || recordedOpenParens.has(openParenOffset)) {
      continue;
    }

    recordedOpenParens.add(openParenOffset);
    cteSpans.push({
      name: firstCteName,
      nameStartOffset,
      nameEndOffset,
      headerStartOffset: withMatch.index,
      openParenOffset,
      closeParenOffset
    });

    let cursor = closeParenOffset + 1;
    while (cursor < sanitized.length) {
      const remaining = sanitized.slice(cursor);
      const nextCteMatch = remaining.match(/^\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/i);
      if (!nextCteMatch) {
        break;
      }

      const nextCteName = nextCteMatch[1];
      if (SQL_RESERVED_WORDS.has(nextCteName.toLowerCase())) {
        break;
      }

      const nextNameRelIdx = nextCteMatch[0].search(new RegExp(`\\b${nextCteName}\\b`));
      const nextNameStart = cursor + nextNameRelIdx;
      const nextNameEnd = nextNameStart + nextCteName.length;
      const nextOpenParen = cursor + nextCteMatch[0].length - 1;
      const nextCloseParen = findMatchingCloseParen(sanitized, nextOpenParen);

      if (nextCloseParen === -1) {
        break;
      }

      if (!recordedOpenParens.has(nextOpenParen)) {
        recordedOpenParens.add(nextOpenParen);
        cteSpans.push({
          name: nextCteName,
          nameStartOffset: nextNameStart,
          nameEndOffset: nextNameEnd,
          headerStartOffset: cursor,
          openParenOffset: nextOpenParen,
          closeParenOffset: nextCloseParen
        });
      }

      cursor = nextCloseParen + 1;
    }
  }

  return cteSpans;
}

function extractTopLevelSelectClause(regionText: string): string | null {
  let depth = 0;
  let selectBodyStart = -1;

  for (let i = 0; i < regionText.length; i++) {
    const ch = regionText[i];
    if (ch === '(') {
      depth++;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) {
        depth--;
      }
      continue;
    }

    if (depth === 0 && (i === 0 || !/[a-zA-Z0-9_]/.test(regionText[i - 1]))) {
      const slice = regionText.slice(i);

      if (selectBodyStart === -1) {
        const selectMatch = slice.match(/^SELECT(?:\s+DISTINCT)?\b/i);
        if (selectMatch) {
          selectBodyStart = i + selectMatch[0].length;
          i += selectMatch[0].length - 1;
        }
      } else {
        const stopMatch = slice.match(/^(?:FROM|WHERE|GROUP\s+BY|HAVING|QUALIFY|ORDER\s+BY|LIMIT|UNION|INTERSECT|EXCEPT)\b/i);
        if (stopMatch) {
          return regionText.slice(selectBodyStart, i);
        }
      }
    }
  }

  return selectBodyStart !== -1 ? regionText.slice(selectBodyStart) : null;
}

function splitTopLevelCommaItems(selectClause: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let segmentStart = 0;

  for (let i = 0; i < selectClause.length; i++) {
    const ch = selectClause[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      if (depth > 0) {
        depth--;
      }
    } else if (ch === ',' && depth === 0) {
      items.push(selectClause.slice(segmentStart, i).trim());
      segmentStart = i + 1;
    }
  }

  const tail = selectClause.slice(segmentStart).trim();
  if (tail.length > 0) {
    items.push(tail);
  }

  return items;
}

function extractInferredCastType(expr: string): string | undefined {
  const doubleColonMatch = expr.match(/::\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\s*\([^()]*\))?)\s*$/);
  if (doubleColonMatch) {
    return doubleColonMatch[1].trim().toUpperCase();
  }

  const castMatch = expr.match(/\b(?:CAST|TRY_CAST|SAFE_CAST)\s*\([\s\S]*?\bAS\s+([a-zA-Z_][a-zA-Z0-9_]*(?:\s*\([^()]*\))?)\s*\)\s*$/i);
  if (castMatch) {
    return castMatch[1].trim().toUpperCase();
  }

  return undefined;
}

function buildProjectedColumn(
  outputName: string,
  cteName: string,
  sourceCol: ResolvedColumn | undefined,
  inferredType?: string
): ResolvedColumn {
  const nextHop: LineageHop = {
    relationName: cteName,
    columnName: outputName,
    kind: 'cte'
  };

  if (sourceCol) {
    return {
      name: outputName,
      dataType: inferredType || sourceCol.dataType,
      description: sourceCol.description,
      tests: [...sourceCol.tests],
      originModel: sourceCol.originModel,
      originColumnName: sourceCol.originColumnName,
      lineageChain: [...sourceCol.lineageChain, nextHop]
    };
  }

  return {
    name: outputName,
    dataType: inferredType,
    tests: [],
    lineageChain: [nextHop]
  };
}

function parseProjectedCteColumns(
  cteName: string,
  regionText: string,
  scope: RegionScope
): Map<string, ResolvedColumn> {
  const projected = new Map<string, ResolvedColumn>();
  const selectClause = extractTopLevelSelectClause(regionText);
  if (!selectClause) {
    return projected;
  }

  const uniqueRelations = new Map<string, ResolvedRelation>();
  for (const rel of scope.relationsByAlias.values()) {
    uniqueRelations.set(rel.alias.toLowerCase(), rel);
  }

  const findColumnInScope = (prefix: string | undefined, colName: string): ResolvedColumn | undefined => {
    const colKey = colName.toLowerCase();
    if (prefix) {
      const targetRel = scope.relationsByAlias.get(prefix.toLowerCase());
      return targetRel?.columns.get(colKey);
    }
    if (scope.defaultRelation) {
      const fromDefault = scope.defaultRelation.columns.get(colKey);
      if (fromDefault) {
        return fromDefault;
      }
    }
    for (const rel of uniqueRelations.values()) {
      const candidate = rel.columns.get(colKey);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  };

  const items = splitTopLevelCommaItems(selectClause);

  for (const rawItem of items) {
    const item = rawItem.trim();
    if (!item) {
      continue;
    }

    // 1. Unqualified wildcard: SELECT *
    if (item === '*') {
      for (const rel of uniqueRelations.values()) {
        for (const [colKey, col] of rel.columns.entries()) {
          if (!projected.has(colKey)) {
            projected.set(colKey, buildProjectedColumn(col.name, cteName, col));
          }
        }
      }
      continue;
    }

    // 2. Qualified wildcard: SELECT alias.*
    const tableWildcardMatch = item.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.\*$/);
    if (tableWildcardMatch) {
      const prefix = tableWildcardMatch[1].toLowerCase();
      const rel = scope.relationsByAlias.get(prefix);
      if (rel) {
        for (const [colKey, col] of rel.columns.entries()) {
          if (!projected.has(colKey)) {
            projected.set(colKey, buildProjectedColumn(col.name, cteName, col));
          }
        }
      }
      continue;
    }

    // 3. Standard projection item with optional explicit/implicit alias
    let exprPart = item;
    let outputAlias: string | undefined;

    const explicitAsMatch = item.match(/^([\s\S]+?)\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)$/i);
    if (explicitAsMatch && !SQL_RESERVED_WORDS.has(explicitAsMatch[2].toLowerCase())) {
      exprPart = explicitAsMatch[1].trim();
      outputAlias = explicitAsMatch[2];
    } else {
      const implicitAliasMatch = item.match(/^([\s\S]+?[a-zA-Z0-9_)])\s+([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (implicitAliasMatch && !SQL_RESERVED_WORDS.has(implicitAliasMatch[2].toLowerCase())) {
        exprPart = implicitAliasMatch[1].trim();
        outputAlias = implicitAliasMatch[2];
      }
    }

    const inferredCastType = extractInferredCastType(exprPart);
    const strippedExpr = exprPart.replace(/::\s*[a-zA-Z_][a-zA-Z0-9_]*(?:\s*\([^()]*\))?\s*$/, '').trim();

    // Direct column reference: alias.col or col
    const directRefMatch = strippedExpr.match(/^(?:([a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)$/);
    if (directRefMatch) {
      const prefix = directRefMatch[1];
      const sourceColName = directRefMatch[2];
      const finalColName = outputAlias || sourceColName;
      const sourceCol = findColumnInScope(prefix, sourceColName);

      projected.set(
        finalColName.toLowerCase(),
        buildProjectedColumn(finalColName, cteName, sourceCol, inferredCastType)
      );
      continue;
    }

    // Complex expression (e.g. COALESCE(a.price, 0) AS net_price):
    // Trace the first referenced table.column inside the expression if available
    if (outputAlias) {
      let matchedSourceCol: ResolvedColumn | undefined;
      const innerQualRef = exprPart.match(/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/);
      if (innerQualRef) {
        matchedSourceCol = findColumnInScope(innerQualRef[1], innerQualRef[2]);
      }

      projected.set(
        outputAlias.toLowerCase(),
        buildProjectedColumn(outputAlias, cteName, matchedSourceCol, inferredCastType)
      );
    }
  }

  return projected;
}

export function resolveDocumentLineage(
  rawSql: string,
  indexer: DbtTargetIndexer
): DocumentLineage {
  const sanitized = sanitizeSql(rawSql);
  const jinjaByOffset = extractJinjaMatches(rawSql, indexer);
  const cteSpans = detectAllCteSpans(sanitized);

  const cteDefinitions = new Map<string, CteDefinitionSpan>();
  for (const span of cteSpans) {
    cteDefinitions.set(span.name.toLowerCase(), span);
  }

  const cteRelations = new Map<string, ResolvedRelation>();
  const scopes: RegionScope[] = [];

  const analyzeRegion = (
    regionText: string,
    regionStartOffset: number,
    regionEndOffset: number,
    cteName: string | null
  ): RegionScope => {
    const relationsByAlias = new Map<string, ResolvedRelation>();
    let defaultRelation: ResolvedRelation | undefined;

    const registerRelation = (rel: ResolvedRelation, alias?: string) => {
      const effectiveAlias = alias || rel.alias;
      const cloned = cloneRelationWithAlias(rel, effectiveAlias);
      relationsByAlias.set(effectiveAlias.toLowerCase(), cloned);
      relationsByAlias.set(rel.name.toLowerCase(), cloned);
      if (!defaultRelation) {
        defaultRelation = cloned;
      }
    };

    const fromJoinRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)|\s+([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
    let fjMatch: RegExpExecArray | null;

    while ((fjMatch = fromJoinRegex.exec(regionText)) !== null) {
      const rawTarget = fjMatch[1];
      const explicitAlias = fjMatch[2];
      const implicitAlias = fjMatch[3];

      const prefixMatch = fjMatch[0].match(/^\b(?:FROM|JOIN)\s+/i);
      const targetRelStart = fjMatch.index + (prefixMatch ? prefixMatch[0].length : 0);
      const targetAbsStart = regionStartOffset + targetRelStart;

      let candidateAlias: string | undefined = explicitAlias || implicitAlias;
      if (candidateAlias) {
        const lowerAlias = candidateAlias.toLowerCase();
        if (SQL_RESERVED_WORDS.has(lowerAlias) || candidateAlias.startsWith(JINJA_PLACEHOLDER_PREFIX)) {
          fromJoinRegex.lastIndex = targetRelStart + rawTarget.length;
          candidateAlias = undefined;
        }
      }

      // Case 1: Jinja {{ ref(...) }} or {{ source(...) }}
      if (rawTarget.startsWith(JINJA_PLACEHOLDER_PREFIX)) {
        const jinjaRef = jinjaByOffset.get(targetAbsStart);
        if (jinjaRef?.dbtModel) {
          const aliasToUse = candidateAlias || jinjaRef.dbtModel.name;
          const rel = createRelationFromDbtModel(jinjaRef.dbtModel, aliasToUse);
          registerRelation(rel, candidateAlias);
        } else if (jinjaRef) {
          const fallbackName = jinjaRef.modelName;
          const aliasToUse = candidateAlias || fallbackName;
          registerRelation(
            {
              name: fallbackName,
              alias: aliasToUse,
              kind: jinjaRef.kind === 'source' ? 'dbtSource' : 'dbtModel',
              columns: new Map()
            },
            candidateAlias
          );
        }
        continue;
      }

      const targetParts = rawTarget.split('.');
      const baseTableName = targetParts[targetParts.length - 1];
      const lowerBaseName = baseTableName.toLowerCase();

      if (SQL_RESERVED_WORDS.has(lowerBaseName)) {
        continue;
      }

      // Case 2: Reference to an already-resolved local CTE
      const existingCteRel = cteRelations.get(lowerBaseName);
      if (existingCteRel) {
        registerRelation(existingCteRel, candidateAlias || existingCteRel.name);
        continue;
      }

      // Case 3: Direct table/model reference in dbt index
      const indexedModel = indexer.getRelationByName(rawTarget);
      if (indexedModel) {
        const rel = createRelationFromDbtModel(indexedModel, candidateAlias || baseTableName);
        registerRelation(rel, candidateAlias);
        continue;
      }

      // Case 4: Unknown raw physical table
      const aliasToUse = candidateAlias || baseTableName;
      registerRelation(
        {
          name: rawTarget,
          alias: aliasToUse,
          kind: 'rawTable',
          columns: new Map()
        },
        candidateAlias
      );
    }

    const scope: RegionScope = {
      cteName,
      startOffset: regionStartOffset,
      endOffset: regionEndOffset,
      relationsByAlias,
      defaultRelation
    };

    if (cteName) {
      const projectedColumns = parseProjectedCteColumns(cteName, regionText, scope);
      cteRelations.set(cteName.toLowerCase(), {
        name: cteName,
        alias: cteName,
        kind: 'cte',
        columns: projectedColumns
      });
    }

    return scope;
  };

  // Bottom-up analysis: innermost CTEs first, masking each analyzed CTE body
  const workingSqlChars = sanitized.split('');
  const ctesByInnermostFirst = [...cteSpans].sort(
    (a, b) => (a.closeParenOffset - a.openParenOffset) - (b.closeParenOffset - b.openParenOffset)
  );

  for (const cte of ctesByInnermostFirst) {
    const bodyStart = cte.openParenOffset + 1;
    const bodyEnd = cte.closeParenOffset;
    const bodyText = workingSqlChars.slice(bodyStart, bodyEnd).join('');

    const cteScope = analyzeRegion(bodyText, bodyStart, bodyEnd, cte.name);
    scopes.push(cteScope);

    for (let i = cte.headerStartOffset; i <= cte.closeParenOffset; i++) {
      if (workingSqlChars[i] !== '\n' && workingSqlChars[i] !== '\r') {
        workingSqlChars[i] = ' ';
      }
    }
  }

  const outerSql = workingSqlChars.join('');
  const outerScope = analyzeRegion(outerSql, 0, sanitized.length, null);

  return {
    cteDefinitions,
    cteRelations,
    scopes: [...scopes, outerScope],
    jinjaMatches: Array.from(jinjaByOffset.values()),
    getScopeAtOffset(offset: number): RegionScope {
      // Because `scopes` is ordered from smallest (innermost CTE) to largest (outer query),
      // the first scope containing `offset` is always the most specific enclosing scope.
      for (const s of scopes) {
        if (offset >= s.startOffset && offset <= s.endOffset) {
          return s;
        }
      }
      return outerScope;
    },
    resolvePrefixRelation(prefix: string, offset: number): ResolvedRelation | undefined {
      const lowerPrefix = prefix.toLowerCase();
      const activeScope = this.getScopeAtOffset(offset);

      return (
        activeScope.relationsByAlias.get(lowerPrefix) ??
        cteRelations.get(lowerPrefix)
      );
    }
  };
}