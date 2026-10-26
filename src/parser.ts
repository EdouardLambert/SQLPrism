import { TypeCategoryIndex } from './palette';

export interface HighlightMatch {
  startOffset: number;
  endOffset: number;
  colorIndex: number;
}

export interface TypeHighlightMatch {
  startOffset: number;
  endOffset: number;
  categoryIndex: number;
}

export interface CteBlock {
  name: string;
  colorIndex: number;
  nameStartOffset: number;
  closeParenOffset: number;
}

export interface ParseResult {
  matches: HighlightMatch[];
  cteBlocks: CteBlock[];
  typeMatches: TypeHighlightMatch[];
}

const SQL_RESERVED_KEYWORDS = new Set([
  'select', 'from', 'where', 'join', 'inner', 'left', 'right', 'full',
  'outer', 'cross', 'natural', 'on', 'using', 'group', 'order', 'by',
  'having', 'limit', 'offset', 'fetch', 'union', 'all', 'intersect',
  'except', 'minus', 'with', 'recursive', 'as', 'distinct', 'into',
  'values', 'set', 'update', 'delete', 'insert', 'create', 'table',
  'view', 'temp', 'temporary', 'when', 'then', 'else', 'end', 'case',
  'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'between',
  'exists', 'cast', 'try_cast', 'safe_cast', 'over', 'partition',
  'qualify', 'window', 'lateral', 'unnest', 'pivot', 'unpivot',
  'sample', 'tablesample', 'for', 'asc', 'desc', 'nulls', 'first',
  'last', 'true', 'false'
]);

const SQL_DATA_TYPE_MAP = new Map<string, TypeCategoryIndex>([
  // Integer types
  ['int', TypeCategoryIndex.Integer],
  ['integer', TypeCategoryIndex.Integer],
  ['bigint', TypeCategoryIndex.Integer],
  ['smallint', TypeCategoryIndex.Integer],
  ['tinyint', TypeCategoryIndex.Integer],
  ['hugeint', TypeCategoryIndex.Integer],
  ['int2', TypeCategoryIndex.Integer],
  ['int4', TypeCategoryIndex.Integer],
  ['int8', TypeCategoryIndex.Integer],
  ['int16', TypeCategoryIndex.Integer],
  ['int32', TypeCategoryIndex.Integer],
  ['int64', TypeCategoryIndex.Integer],
  ['int128', TypeCategoryIndex.Integer],
  ['ubigint', TypeCategoryIndex.Integer],
  ['uinteger', TypeCategoryIndex.Integer],
  ['usmallint', TypeCategoryIndex.Integer],
  ['utinyint', TypeCategoryIndex.Integer],
  ['serial', TypeCategoryIndex.Integer],
  ['bigserial', TypeCategoryIndex.Integer],

  // Float & Precision types
  ['float', TypeCategoryIndex.Float],
  ['double', TypeCategoryIndex.Float],
  ['double precision', TypeCategoryIndex.Float],
  ['real', TypeCategoryIndex.Float],
  ['decimal', TypeCategoryIndex.Float],
  ['numeric', TypeCategoryIndex.Float],
  ['dec', TypeCategoryIndex.Float],
  ['float4', TypeCategoryIndex.Float],
  ['float8', TypeCategoryIndex.Float],
  ['number', TypeCategoryIndex.Float],

  // Textual types
  ['varchar', TypeCategoryIndex.Text],
  ['char', TypeCategoryIndex.Text],
  ['character', TypeCategoryIndex.Text],
  ['character varying', TypeCategoryIndex.Text],
  ['text', TypeCategoryIndex.Text],
  ['string', TypeCategoryIndex.Text],
  ['nvarchar', TypeCategoryIndex.Text],
  ['nchar', TypeCategoryIndex.Text],
  ['bpchar', TypeCategoryIndex.Text],

  // Date & Time types
  ['date', TypeCategoryIndex.DateTime],
  ['timestamp', TypeCategoryIndex.DateTime],
  ['timestamptz', TypeCategoryIndex.DateTime],
  ['timestamp without time zone', TypeCategoryIndex.DateTime],
  ['timestamp with time zone', TypeCategoryIndex.DateTime],
  ['datetime', TypeCategoryIndex.DateTime],
  ['time', TypeCategoryIndex.DateTime],
  ['timetz', TypeCategoryIndex.DateTime],
  ['time without time zone', TypeCategoryIndex.DateTime],
  ['time with time zone', TypeCategoryIndex.DateTime],
  ['interval', TypeCategoryIndex.DateTime],
  ['timestamp_ntz', TypeCategoryIndex.DateTime],
  ['timestamp_ltz', TypeCategoryIndex.DateTime],
  ['timestamp_tz', TypeCategoryIndex.DateTime],

  // Logical / Boolean types
  ['bool', TypeCategoryIndex.Boolean],
  ['boolean', TypeCategoryIndex.Boolean],

  // Complex & Spatial types
  ['json', TypeCategoryIndex.Complex],
  ['jsonb', TypeCategoryIndex.Complex],
  ['array', TypeCategoryIndex.Complex],
  ['struct', TypeCategoryIndex.Complex],
  ['map', TypeCategoryIndex.Complex],
  ['uuid', TypeCategoryIndex.Complex],
  ['bytea', TypeCategoryIndex.Complex],
  ['blob', TypeCategoryIndex.Complex],
  ['variant', TypeCategoryIndex.Complex],
  ['object', TypeCategoryIndex.Complex],
  ['geometry', TypeCategoryIndex.Complex],
  ['geography', TypeCategoryIndex.Complex]
]);

const MULTI_WORD_TYPE_PATTERN =
  'character\\s+varying|double\\s+precision|timestamp\\s+with(?:out)?\\s+time\\s+zone|time\\s+with(?:out)?\\s+time\\s+zone|[a-zA-Z_][a-zA-Z0-9_]*';

const TYPE_SPEC_REGEX = new RegExp(
  `^(${MULTI_WORD_TYPE_PATTERN})(\\s*\\(\\s*[^()]*\\s*\\))?(\\s*\\[\\s*\\])*`,
  'i'
);

const JINJA_PLACEHOLDER_PREFIX = '__JINJA_';

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

function findTopLevelAsAfterOffset(body: string): number {
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      if (depth > 0) {
        depth--;
      }
    } else if (depth === 0) {
      const remaining = body.slice(i);
      const asMatch = remaining.match(/^\bAS\s+/i);
      if (asMatch && (i === 0 || !/[a-zA-Z0-9_]/.test(body[i - 1]))) {
        return i + asMatch[0].length;
      }
    }
  }
  return -1;
}

function parseDataTypes(sanitized: string): TypeHighlightMatch[] {
  const typeMatches: TypeHighlightMatch[] = [];
  const recordedTypeSpans = new Set<string>();

  const addTypeMatch = (startOffset: number, endOffset: number, categoryIndex: number) => {
    const key = `${startOffset}:${endOffset}`;
    if (!recordedTypeSpans.has(key)) {
      recordedTypeSpans.add(key);
      typeMatches.push({ startOffset, endOffset, categoryIndex });
    }
  };

  const tryMatchTypeAt = (textSlice: string, baseOffset: number) => {
    const specMatch = textSlice.match(TYPE_SPEC_REGEX);
    if (!specMatch) {
      return;
    }

    const rawTypeName = specMatch[1];
    const normalizedTypeName = rawTypeName.replace(/\s+/g, ' ').toLowerCase();
    const categoryIndex = SQL_DATA_TYPE_MAP.get(normalizedTypeName);

    if (categoryIndex !== undefined) {
      const fullMatchedLength = specMatch[0].length;
      addTypeMatch(baseOffset, baseOffset + fullMatchedLength, categoryIndex);
    }
  };

  const doubleColonRegex = /::\s*/g;
  let dcMatch: RegExpExecArray | null;

  while ((dcMatch = doubleColonRegex.exec(sanitized)) !== null) {
    const typeStartOffset = dcMatch.index + dcMatch[0].length;
    const remaining = sanitized.slice(typeStartOffset);
    tryMatchTypeAt(remaining, typeStartOffset);
  }

  const castFuncRegex = /\b(?:CAST|TRY_CAST|SAFE_CAST)\s*\(/gi;
  let cfMatch: RegExpExecArray | null;

  while ((cfMatch = castFuncRegex.exec(sanitized)) !== null) {
    const openParenOffset = cfMatch.index + cfMatch[0].length - 1;
    const closeParenOffset = findMatchingCloseParen(sanitized, openParenOffset);
    if (closeParenOffset === -1) {
      continue;
    }

    const innerBody = sanitized.slice(openParenOffset + 1, closeParenOffset);
    const typeRelOffset = findTopLevelAsAfterOffset(innerBody);
    if (typeRelOffset !== -1) {
      const typeAbsOffset = openParenOffset + 1 + typeRelOffset;
      const typeSlice = innerBody.slice(typeRelOffset);
      tryMatchTypeAt(typeSlice, typeAbsOffset);
    }
  }

  return typeMatches;
}

export function parseSqlDocument(rawSql: string, paletteSize: number): ParseResult {
  const sanitized = sanitizeSql(rawSql);
  const matches: HighlightMatch[] = [];
  const cteBlocks: CteBlock[] = [];
  const recordedSpans = new Set<string>();

  const cteColorMap = new Map<string, number>();
  let nextColorCounter = 0;

  const getOrAssignCteColor = (cteName: string): number => {
    const key = cteName.toLowerCase();
    let colorIdx = cteColorMap.get(key);
    if (colorIdx === undefined) {
      colorIdx = nextColorCounter % paletteSize;
      cteColorMap.set(key, colorIdx);
      nextColorCounter++;
    }
    return colorIdx;
  };

  const addMatch = (startOffset: number, endOffset: number, colorIndex: number) => {
    const spanKey = `${startOffset}:${endOffset}`;
    if (!recordedSpans.has(spanKey)) {
      recordedSpans.add(spanKey);
      matches.push({ startOffset, endOffset, colorIndex });
    }
  };

  interface InternalCteSpan {
    name: string;
    colorIndex: number;
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

    const colorIndex = getOrAssignCteColor(firstCteName);
    cteSpans.push({
      name: firstCteName,
      colorIndex,
      headerStartOffset: withMatch.index,
      nameStartOffset,
      nameEndOffset,
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

      const nextColorIndex = getOrAssignCteColor(nextCteName);
      cteSpans.push({
        name: nextCteName,
        colorIndex: nextColorIndex,
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

  for (const cte of cteSpans) {
    addMatch(cte.nameStartOffset, cte.nameEndOffset, cte.colorIndex);
    addMatch(cte.openParenOffset, cte.openParenOffset + 1, cte.colorIndex);
    addMatch(cte.closeParenOffset, cte.closeParenOffset + 1, cte.colorIndex);

    cteBlocks.push({
      name: cte.name,
      colorIndex: cte.colorIndex,
      nameStartOffset: cte.nameStartOffset,
      closeParenOffset: cte.closeParenOffset
    });
  }

  const parseRegion = (regionText: string, regionStartOffset: number, enclosingCteColor: number | null) => {
    const localColorMap = new Map<string, number>();

    const assignLocalEntityColor = (entityName: string): number => {
      const lower = entityName.toLowerCase();

      // Always preserve the color of a known CTE
      const existingCteColor = cteColorMap.get(lower);
      if (existingCteColor !== undefined) {
        return existingCteColor;
      }

      const existingLocalColor = localColorMap.get(lower);
      if (existingLocalColor !== undefined) {
        return existingLocalColor;
      }

      // Inside a CTE: local tables/aliases share the exact enclosing CTE color
      // Outside a CTE: non-CTE tables get the next distinct color from the palette
      const colorIdx = enclosingCteColor !== null
        ? enclosingCteColor
        : (nextColorCounter++ % paletteSize);

      localColorMap.set(lower, colorIdx);
      return colorIdx;
    };

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

      let targetColor: number | undefined;

      if (!isJinjaTarget && !SQL_RESERVED_KEYWORDS.has(baseTableName.toLowerCase())) {
        targetColor = assignLocalEntityColor(baseTableName);
        localColorMap.set(rawTarget.toLowerCase(), targetColor);
        addMatch(targetAbsStart, targetAbsEnd, targetColor);
      }

      const candidateAlias = explicitAlias || implicitAlias;
      if (candidateAlias) {
        const lowerAlias = candidateAlias.toLowerCase();

        if (SQL_RESERVED_KEYWORDS.has(lowerAlias) || candidateAlias.startsWith(JINJA_PLACEHOLDER_PREFIX)) {
          fromJoinRegex.lastIndex = targetRelStart + rawTarget.length;
          continue;
        }

        const aliasColor = targetColor !== undefined
          ? targetColor
          : assignLocalEntityColor(candidateAlias);

        localColorMap.set(lowerAlias, aliasColor);

        const aliasRelStart = fjMatch.index + fjMatch[0].lastIndexOf(candidateAlias);
        const aliasAbsStart = regionStartOffset + aliasRelStart;
        const aliasAbsEnd = aliasAbsStart + candidateAlias.length;
        addMatch(aliasAbsStart, aliasAbsEnd, aliasColor);
      }
    }

    const columnRefRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\.(?:[a-zA-Z_][a-zA-Z0-9_]*|\*)/g;
    let colMatch: RegExpExecArray | null;

    while ((colMatch = columnRefRegex.exec(regionText)) !== null) {
      const prefix = colMatch[1].toLowerCase();
      let colorIdx = localColorMap.get(prefix);

      if (colorIdx === undefined) {
        colorIdx = cteColorMap.get(prefix);
      }

      if (colorIdx !== undefined) {
        const startOffset = regionStartOffset + colMatch.index;
        const endOffset = startOffset + colMatch[0].length;
        addMatch(startOffset, endOffset, colorIdx);
      }
    }
  };

  for (const cte of cteSpans) {
    const bodyStart = cte.openParenOffset + 1;
    const bodyText = sanitized.slice(bodyStart, cte.closeParenOffset);
    parseRegion(bodyText, bodyStart, cte.colorIndex);
  }

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

  const typeMatches = parseDataTypes(sanitized);

  return { matches, cteBlocks, typeMatches };
}