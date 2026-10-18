import * as vscode from 'vscode';
import { CTE_COLOR_FAMILIES, ThemeColorPair } from './palette';
import { parseSqlDocument } from './parser';

export class SqlEntityDecorator {
  private textDecorationTypes: vscode.TextEditorDecorationType[] = [];
  private cteLineDecorationTypes: vscode.TextEditorDecorationType[] = [];
  private debounceTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.initializeDecorationPool();
  }

  public initializeDecorationPool(): void {
    this.disposeDecorations();

    const config = vscode.workspace.getConfiguration('sqlPrism');
    const useSubtleBg = config.get<boolean>('subtleBackground', false);

    const createTextDeco = (pair: ThemeColorPair) =>
      vscode.window.createTextEditorDecorationType({
        light: {
          color: pair.light,
          backgroundColor: useSubtleBg ? pair.lightBg : undefined
        },
        dark: {
          color: pair.dark,
          backgroundColor: useSubtleBg ? pair.darkBg : undefined
        }
      });

    for (const family of CTE_COLOR_FAMILIES) {
      this.textDecorationTypes.push(createTextDeco(family.base));
      for (const shade of family.shades) {
        this.textDecorationTypes.push(createTextDeco(shade));
      }

      // 1px subtle vertical line with 30 hex opacity for a transparent look
      const lineDeco = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        borderWidth: '0 0 0 1px',
        borderStyle: 'solid',
        light: {
          borderColor: `${family.base.light}30`
        },
        dark: {
          borderColor: `${family.base.dark}30`
        }
      });
      this.cteLineDecorationTypes.push(lineDeco);
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
    if (!config.get<boolean>('enabled', true)) {
      this.clearDecorations(editor);
      return;
    }

    const showCteLine = config.get<boolean>('showCteLine', true);
    const text = editor.document.getText();
    const { matches, cteBlocks } = parseSqlDocument(text, CTE_COLOR_FAMILIES.length);

    const textRangesBySlot: vscode.Range[][] = this.textDecorationTypes.map(() => []);

    for (const match of matches) {
      if (match.colorSlotIndex >= 0 && match.colorSlotIndex < this.textDecorationTypes.length) {
        const startPos = editor.document.positionAt(match.startOffset);
        const endPos = editor.document.positionAt(match.endOffset);
        textRangesBySlot[match.colorSlotIndex].push(new vscode.Range(startPos, endPos));
      }
    }

    for (let i = 0; i < this.textDecorationTypes.length; i++) {
      editor.setDecorations(this.textDecorationTypes[i], textRangesBySlot[i]);
    }

    const lineRangesByFamily: vscode.Range[][] = this.cteLineDecorationTypes.map(() => []);

    if (showCteLine) {
      for (const block of cteBlocks) {
        const startLine = editor.document.positionAt(block.nameStartOffset).line;
        const endLine = editor.document.positionAt(block.closeParenOffset).line;

        if (endLine > startLine + 1) {
          lineRangesByFamily[block.familyIndex].push(
            new vscode.Range(startLine + 1, 0, endLine - 1, 0)
          );
        }
      }
    }

    for (let i = 0; i < this.cteLineDecorationTypes.length; i++) {
      editor.setDecorations(this.cteLineDecorationTypes[i], lineRangesByFamily[i]);
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
    this.textDecorationTypes = [];
    this.cteLineDecorationTypes = [];
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.disposeDecorations();
  }
}