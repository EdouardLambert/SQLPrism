import { SHADES_PER_FAMILY, SLOTS_PER_FAMILY } from './palette';

export interface HighlightMatch {
  startOffset: number;
  endOffset: number;
  colorSlotIndex: number;
}

export interface CteBlock {
  name: string;
  familyIndex: number;
  nameStartOffset: number;
  closeParenOffset: number;
}

export interface ParseResult {
  matches: HighlightMatch[];
  cteBlocks: CteBlock[];
}

const SQL_RESERVED_KEYWORDS = new Set([
  'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'full',
  'outer', 'cross', 'natural', 'on', 'using', 'group', 'order', 'by',
  'having', 'limit', 'offset', 'fetch', 'union', 'all', 'intersect',
  'except', 'minus', 'with', 'recursive', 'as', 'distinct', 'into',
  'values', 'set', 'update', 'delete', 'insert', 'create', 'table',
  'view', 'temp', 'temporary', 'when', 'then', 'else', 'end', 'case',
  'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'between',
  'exists', 'cast', 'over', 'partition', 'qualify', 'window', 'lateral',
  'unnest', 'pivot', 'unpivot', 'sample', 'tablesample', 'for', 'asc',
  'desc', 'nulls', 'first', 'last', 'true', 'false'
]);

const JINJA_PLACEHOLDER_PREFIX = '__JINJA_';

/**
 * Replaces comments, string literals, and Jinja blocks with same-length placeholders
 * so character offsets remain 100% identical to the source document.
 */
export function sanitizeSql(rawSql: string): string {
  const tokenRegex = /\/\*[\s\S]*?\*\/|--[^\r\n]*|'(?:''|[^'])*'|\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;

  return rawSql.replace(tokenRegex, (match) => {
    if (match.startsWith('{{')) {
      if (match.length >= JINJA_PLACEHOLDER_PREFIX.length) {
        return JINJA_PLACEHOLDER_PREFIX.padEnd(match.length, '_');
      }
      return ' '.repeat(match.length);
    }
    return match.replace(/[^\r\n]/g, ' ');
  });
}

/**
 * Finds the exact offset of the matching closing parenthesis ')' for an opening '(' at openParenOffset.
 */
function findMatchingCloseParen(sanitized: string, openParenOffset: number): number {
  let depth = 0;
  for (let i = openParenOffset; i < sanitized.length; i++) {
    const ch = sanitized[i];
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

function getBaseSlot(familyIndex: number): number {
  return familyIndex * SLOTS_PER_FAMILY;
}

function getShadeSlot(familyIndex: number, shadeCounter: number): number {
  return familyIndex * SLOTS_PER_FAMILY + 1 + (shadeCounter % SHADES_PER_FAMILY);
}

export function parseSqlDocument(rawSql: string, familyCount: number): ParseResult {
  const sanitized = sanitizeSql(rawSql);
  const matches: HighlightMatch[] = [];
  const cteBlocks: CteBlock[] = [];
  const recordedSpans = new Set<string>();

  // Maps lowercase CTE name -> familyIndex (0 .. familyCount - 1)
  const cteFamilyMap = new Map<string, number>();
  let nextFamilyCounter = 0;

  const getOrAssignCteFamily = (cteName: string): number => {
    const key = cteName.toLowerCase();
    let familyIdx = cteFamilyMap.get(key);
    if (familyIdx === undefined) {
      familyIdx = nextFamilyCounter % familyCount;
      cteFamilyMap.set(key, familyIdx);
      nextFamilyCounter++;
    }
    return familyIdx;
  };

  const addMatch = (startOffset: number, endOffset: number, colorSlotIndex: number) => {
    const spanKey = `${startOffset}:${endOffset}`;
    if (!recordedSpans.has(spanKey)) {
      recordedSpans.add(spanKey);
      matches.push({ startOffset, endOffset, colorSlotIndex });
    }
  };

  // Step 1: Detect all CTE declarations and their exact parenthesis spans
  interface InternalCteSpan {
    name: string;
    familyIndex: number;
    headerStartOffset: number;
    nameStartOffset: number;
    nameEndOffset: number;
    openParenOffset: number;
    closeParenOffset: number;
  }

  const cteSpans: InternalCteSpan[] = [];
  const withStartRegex = /\bWITH(?:\s+RECURSIVE)?\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
  let withMatch: RegExpExecArray | null;

  while ((withMatch = withStartRegex.exec(sanitized)) !== null) {
    const firstCteName = withMatch[1];
    if (SQL_RESERVED_KEYWORDS.has(firstCteName.toLowerCase())) {
      continue;
    }

    const nameRelIdx = withMatch[0].search(new RegExp(`\\b${firstCteName}\\b`));
    const nameStartOffset = withMatch.index + nameRelIdx;
    const nameEndOffset = nameStartOffset + firstCteName.length;
    const openParenOffset = withMatch.index + withMatch[0].length - 1;
    const closeParenOffset = findMatchingCloseParen(sanitized, openParenOffset);

    if (closeParenOffset === -1) {
      continue;
    }

    const familyIndex = getOrAssignCteFamily(firstCteName);
    cteSpans.push({
      name: firstCteName,
      familyIndex,
      headerStartOffset: withMatch.index,
      nameStartOffset,
      nameEndOffset,
      openParenOffset,
      closeParenOffset
    });

    // Follow chained CTEs: ", next_cte AS ("
    let cursor = closeParenOffset + 1;
    while (cursor < sanitized.length) {
      const remaining = sanitized.slice(cursor);
      const nextCteMatch = remaining.match(/^\s*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/i);
      if (!nextCteMatch) {
        break;
      }

      const nextCteName = nextCteMatch[1];
      if (SQL_RESERVED_KEYWORDS.has(nextCteName.toLowerCase())) {
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

      const nextFamilyIndex = getOrAssignCteFamily(nextCteName);
      cteSpans.push({
        name: nextCteName,
        familyIndex: nextFamilyIndex,
        headerStartOffset: cursor,
        nameStartOffset: nextNameStart,
        nameEndOffset: nextNameEnd,
        openParenOffset: nextOpenParen,
        closeParenOffset: nextCloseParen
      });

      cursor = nextCloseParen + 1;
    }

    withStartRegex.lastIndex = cursor;
  }

  // Record CTE headers and CTE blocks for left-border decoration
  for (const cte of cteSpans) {
    addMatch(cte.nameStartOffset, cte.nameEndOffset, getBaseSlot(cte.familyIndex));
    cteBlocks.push({
      name: cte.name,
      familyIndex: cte.familyIndex,
      nameStartOffset: cte.nameStartOffset,
      closeParenOffset: cte.closeParenOffset
    });
  }

  /**
   * Helper to parse a specific SQL slice (either inside a CTE body or in the outer query)
   */
  const parseRegion = (regionText: string, regionStartOffset: number, enclosingCteFamily: number | null) => {
    const localSlotMap = new Map<string, number>();
    let localShadeCounter = 0;

    const assignLocalEntitySlot = (entityName: string): number => {
      const lower = entityName.toLowerCase();

      // If this entity is a known CTE, always preserve the CTE's own base color
      const existingCteFamily = cteFamilyMap.get(lower);
      if (existingCteFamily !== undefined) {
        return getBaseSlot(existingCteFamily);
      }

      const existingLocalSlot = localSlotMap.get(lower);
      if (existingLocalSlot !== undefined) {
        return existingLocalSlot;
      }

      let slot: number;
      if (enclosingCteFamily !== null) {
        // Inside a CTE: assign a derived shade of the enclosing CTE's base color
        slot = getShadeSlot(enclosingCteFamily, localShadeCounter);
        localShadeCounter++;
      } else {
        // Outside any CTE (main query table not matching a CTE): assign a derived shade of the next family
        const fallbackFamily = nextFamilyCounter % familyCount;
        slot = getShadeSlot(fallbackFamily, localShadeCounter);
        localShadeCounter++;
      }

      localSlotMap.set(lower, slot);
      return slot;
    };

    // Pass A: FROM / JOIN targets and their aliases within this region
    const fromJoinRegex = /\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_.]*)(?:\s+AS\s+([a-zA-Z_][a-zA-Z0-9_]*)|\s+([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
    let fjMatch: RegExpExecArray | null;

    while ((fjMatch = fromJoinRegex.exec(regionText)) !== null) {
      const rawTarget = fjMatch[1];
      const explicitAlias = fjMatch[2];
      const implicitAlias = fjMatch[3];

      const isJinjaTarget = rawTarget.startsWith(JINJA_PLACEHOLDER_PREFIX);
      const targetParts = rawTarget.split('.');
      const baseTableName = targetParts[targetParts.length - 1];

      const keywordMatch = fjMatch[0].match(/^\b(?:FROM|JOIN)\s+/i);
      const targetRelStart = fjMatch.index + (keywordMatch ? keywordMatch[0].length : 0);
      const targetAbsStart = regionStartOffset + targetRelStart;
      const targetAbsEnd = targetAbsStart + rawTarget.length;

      let targetSlot: number | undefined;

      if (!isJinjaTarget && !SQL_RESERVED_KEYWORDS.has(baseTableName.toLowerCase())) {
        if (enclosingCteFamily !== null) {
          // Inside a CTE: if the table is NOT another CTE, it gets a derived shade of this CTE
          const referencedCteFamily = cteFamilyMap.get(baseTableName.toLowerCase());
          if (referencedCteFamily !== undefined) {
            targetSlot = getBaseSlot(referencedCteFamily);
          } else {
            targetSlot = assignLocalEntitySlot(baseTableName);
            localSlotMap.set(rawTarget.toLowerCase(), targetSlot);
          }
        } else {
          targetSlot = assignLocalEntitySlot(baseTableName);
          localSlotMap.set(rawTarget.toLowerCase(), targetSlot);
        }
        addMatch(targetAbsStart, targetAbsEnd, targetSlot);
      }

      const candidateAlias = explicitAlias || implicitAlias;
      if (candidateAlias) {
        const lowerAlias = candidateAlias.toLowerCase();

        if (SQL_RESERVED_KEYWORDS.has(lowerAlias) || candidateAlias.startsWith(JINJA_PLACEHOLDER_PREFIX)) {
          fromJoinRegex.lastIndex = targetRelStart + rawTarget.length;
          continue;
        }

        let aliasSlot: number;
        if (enclosingCteFamily !== null) {
          // Inside a CTE: any alias declared on a FROM/JOIN gets a derived shade of the CTE
          // (or shares the shade of its source table in the same FROM/JOIN clause)
          if (targetSlot !== undefined && !cteFamilyMap.has(baseTableName.toLowerCase())) {
            aliasSlot = targetSlot;
          } else {
            aliasSlot = getShadeSlot(enclosingCteFamily, localShadeCounter);
            localShadeCounter++;
          }
        } else {
          aliasSlot = targetSlot !== undefined ? targetSlot : assignLocalEntitySlot(candidateAlias);
        }

        localSlotMap.set(lowerAlias, aliasSlot);

        const aliasRelStart = fjMatch.index + fjMatch[0].lastIndexOf(candidateAlias);
        const aliasAbsStart = regionStartOffset + aliasRelStart;
        const aliasAbsEnd = aliasAbsStart + candidateAlias.length;
        addMatch(aliasAbsStart, aliasAbsEnd, aliasSlot);
      }
    }

    // Pass B: Qualified column references (entity.column or entity.*) within this region
    const columnRefRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(?:[a-zA-Z_][a-zA-Z0-9_]*|\*)/g;
    let colMatch: RegExpExecArray | null;

    while ((colMatch = columnRefRegex.exec(regionText)) !== null) {
      const prefix = colMatch[1].toLowerCase();
      let slot = localSlotMap.get(prefix);

      if (slot === undefined) {
        const cteFamily = cteFamilyMap.get(prefix);
        if (cteFamily !== undefined) {
          slot = getBaseSlot(cteFamily);
        }
      }

      if (slot !== undefined) {
        const startOffset = regionStartOffset + colMatch.index;
        const endOffset = startOffset + colMatch[0].length;
        addMatch(startOffset, endOffset, slot);
      }
    }
  };

  // Step 2: Parse inside each CTE body using that CTE's color family for derived shades
  for (const cte of cteSpans) {
    const bodyStart = cte.openParenOffset + 1;
    const bodyText = sanitized.slice(bodyStart, cte.closeParenOffset);
    parseRegion(bodyText, bodyStart, cte.familyIndex);
  }

  // Step 3: Build a version of sanitized with CTE spans blanked out to parse the outer/final query
  let outerSqlChars = sanitized.split('');
  for (const cte of cteSpans) {
    for (let i = cte.headerStartOffset; i <= cte.closeParenOffset; i++) {
      if (outerSqlChars[i] !== '\n' && outerSqlChars[i] !== '\r') {
        outerSqlChars[i] = ' ';
      }
    }
  }
  const outerSql = outerSqlChars.join('');
  parseRegion(outerSql, 0, null);

  return { matches, cteBlocks };
}