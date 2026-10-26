import * as vscode from 'vscode';
import { CteColorStyle, getCtePalette, DATA_TYPE_PALETTE, ThemeColorPair } from './palette';
import { parseSqlDocument } from './parser';

export class SqlEntityDecorator {
  private textDecorationTypes: vscode.TextEditorDecorationType[] = [];
  private cteLineDecorationTypes: vscode.TextEditorDecorationType[] = [];
  private typeDecorationTypes: vscode.TextEditorDecorationType[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.initializeDecorationPool();
  }

  private getConfiguredColorStyle(): CteColorStyle {
    const config = vscode.workspace.getConfiguration('sqlPrism');
    const style = config.get<string>('cte.colorStyle', 'pastel');
    return style === 'muted' ? 'muted' : 'pastel';
  }

  public initializeDecorationPool(): void {
    this.disposeDecorations();

    const activeCtePalette = getCtePalette(this.getConfiguredColorStyle());

    const createTextDeco = (pair: ThemeColorPair) =>
      vscode.window.createTextEditorDecorationType({
        light: { color: pair.light },
        dark: { color: pair.dark }
      });

    for (const colorPair of activeCtePalette) {
      this.textDecorationTypes.push(createTextDeco(colorPair));

      const lineDeco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: '0 0 0 1px',
        borderStyle: 'solid',
        light: { borderColor: `${colorPair.light}35` },
        dark: { borderColor: `${colorPair.dark}35` }
      });
      this.cteLineDecorationTypes.push(lineDeco);
    }

    for (const typeColor of DATA_TYPE_PALETTE) {
      this.typeDecorationTypes.push(createTextDeco(typeColor));
    }
  }

  public triggerUpdate(editor: vscode.TextEditor | undefined, immediate = false): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    if (immediate) {
      this.updateDecorations(editor);
    } else {
      this.debounceTimer = setTimeout(() => {
        this.updateDecorations(editor);
      }, 100);
    }
  }

  private updateDecorations(editor: vscode.TextEditor | undefined): void {
    if (!editor || !this.isSqlDocument(editor.document)) {
      return;
    }

    const config = vscode.workspace.getConfiguration('sqlPrism');
    const isCteEnabled = config.get<boolean>('cte.enabled', true);
    const showCteLine = config.get<boolean>('cte.showLine', true);
    const isTypesEnabled = config.get<boolean>('types.enabled', true);

    if (!isCteEnabled && !isTypesEnabled) {
      this.clearDecorations(editor);
      return;
    }

    const text = editor.document.getText();
    const { matches, cteBlocks, typeMatches } = parseSqlDocument(
      text,
      this.textDecorationTypes.length
    );

    // 1. CTE & Entity text decorations + left vertical lines
    const textRangesByColor: vscode.Range[][] = this.textDecorationTypes.map(() => []);
    const lineRangesByColor: vscode.Range[][] = this.cteLineDecorationTypes.map(() => []);

    if (isCteEnabled) {
      for (const match of matches) {
        if (match.colorIndex >= 0 && match.colorIndex < this.textDecorationTypes.length) {
          const startPos = editor.document.positionAt(match.startOffset);
          const endPos = editor.document.positionAt(match.endOffset);
          textRangesByColor[match.colorIndex].push(new vscode.Range(startPos, endPos));
        }
      }

      if (showCteLine) {
        for (const block of cteBlocks) {
          const startLine = editor.document.positionAt(block.nameStartOffset).line;
          const endLine = editor.document.positionAt(block.closeParenOffset).line;

          if (endLine > startLine + 1) {
            lineRangesByColor[block.colorIndex].push(
              new vscode.Range(startLine + 1, 0, endLine - 1, 0)
            );
          }
        }
      }
    }

    for (let i = 0; i < this.textDecorationTypes.length; i++) {
      editor.setDecorations(this.textDecorationTypes[i], textRangesByColor[i]);
    }

    for (let i = 0; i < this.cteLineDecorationTypes.length; i++) {
      editor.setDecorations(this.cteLineDecorationTypes[i], lineRangesByColor[i]);
    }

    // 2. Semantic SQL Data Type decorations
    const typeRangesByCategory: vscode.Range[][] = this.typeDecorationTypes.map(() => []);

    if (isTypesEnabled) {
      for (const typeMatch of typeMatches) {
        if (typeMatch.categoryIndex >= 0 && typeMatch.categoryIndex < this.typeDecorationTypes.length) {
          const startPos = editor.document.positionAt(typeMatch.startOffset);
          const endPos = editor.document.positionAt(typeMatch.endOffset);
          typeRangesByCategory[typeMatch.categoryIndex].push(new vscode.Range(startPos, endPos));
        }
      }
    }

    for (let i = 0; i < this.typeDecorationTypes.length; i++) {
      editor.setDecorations(this.typeDecorationTypes[i], typeRangesByCategory[i]);
    }
  }

  public clearDecorations(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      return;
    }
    for (const deco of this.textDecorationTypes) {
      editor.setDecorations(deco, []);
    }
    for (const lineDeco of this.cteLineDecorationTypes) {
      editor.setDecorations(lineDeco, []);
    }
    for (const typeDeco of this.typeDecorationTypes) {
      editor.setDecorations(typeDeco, []);
    }
  }

  private isSqlDocument(document: vscode.TextDocument): boolean {
    const supportedLanguages = new Set([
      'sql',
      'jinja-sql',
      'dbt-sql',
      'postgres',
      'snowflake-sql'
    ]);
    return (
      supportedLanguages.has(document.languageId) ||
      document.fileName.toLowerCase().endsWith('.sql')
    );
  }

  public disposeDecorations(): void {
    for (const deco of this.textDecorationTypes) {
      deco.dispose();
    }
    for (const lineDeco of this.cteLineDecorationTypes) {
      lineDeco.dispose();
    }
    for (const typeDeco of this.typeDecorationTypes) {
      typeDeco.dispose();
    }
    this.textDecorationTypes = [];
    this.cteLineDecorationTypes = [];
    this.typeDecorationTypes = [];
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposeDecorations();
  }
}