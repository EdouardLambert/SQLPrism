import * as vscode from 'vscode';
import { SqlEntityDecorator } from './decorator';

let decorator: SqlEntityDecorator | undefined;

export function activate(context: vscode.ExtensionContext): void {
  decorator = new SqlEntityDecorator();

  if (vscode.window.activeTextEditor) {
    decorator.triggerUpdate(vscode.window.activeTextEditor, true);
  }

  const activeEditorSub = vscode.window.onDidChangeActiveTextEditor((editor) => {
    decorator?.triggerUpdate(editor, true);
  });

  const textChangeSub = vscode.workspace.onDidChangeTextDocument((event) => {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && event.document === activeEditor.document) {
      decorator?.triggerUpdate(activeEditor, false);
    }
  });

  const configChangeSub = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('sqlPrism')) {
      decorator?.initializeDecorationPool();
      decorator?.triggerUpdate(vscode.window.activeTextEditor, true);
    }
  });

  const toggleCteLineSub = vscode.commands.registerCommand('sqlPrism.toggleCteLine', async () => {
    const config = vscode.workspace.getConfiguration('sqlPrism');
    const currentState = config.get<boolean>('cte.showLine', true);
    await config.update('cte.showLine', !currentState, vscode.ConfigurationTarget.Global);
  });

  context.subscriptions.push(
    activeEditorSub,
    textChangeSub,
    configChangeSub,
    toggleCteLineSub,
    { dispose: () => decorator?.dispose() }
  );
}

export function deactivate(): void {
  decorator?.dispose();
}