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

  const toggleTypesSub = vscode.commands.registerCommand('sqlPrism.toggleTypes', async () => {
    const config = vscode.workspace.getConfiguration('sqlPrism');
    const currentState = config.get<boolean>('types.enabled', true);
    await config.update('types.enabled', !currentState, vscode.ConfigurationTarget.Global);
  });

  const cycleKeywordModeSub = vscode.commands.registerCommand('sqlPrism.cycleKeywordMode', async () => {
    const config = vscode.workspace.getConfiguration('sqlPrism');
    const modes = ['off', 'targetContext', 'cteScope', 'hybrid'];
    const current = config.get<string>('keywords.mode', 'hybrid');
    const next = modes[(modes.indexOf(current) + 1) % modes.length];
    await config.update('keywords.mode', next, vscode.ConfigurationTarget.Global);
    vscode.window.setStatusBarMessage(`SQL Prism: Keyword mode set to '${next}'`, 3000);
  });

  context.subscriptions.push(
    activeEditorSub,
    textChangeSub,
    configChangeSub,
    toggleCteLineSub,
    toggleTypesSub,
    cycleKeywordModeSub,
    { dispose: () => decorator?.dispose() }
  );
}

export function deactivate(): void {
  decorator?.dispose();
}