import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DbtMetadataIndex, DbtModelMetadata } from './types';
import {
  createEmptyMetadataIndex,
  mergeCatalogIntoIndex,
  mergeManifestIntoIndex
} from './artifactParser';

export class DbtTargetIndexer implements vscode.Disposable {
  private index: DbtMetadataIndex = createEmptyMetadataIndex();
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  private reloadTimer: NodeJS.Timeout | undefined;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
  public readonly onDidUpdateIndex = this.onDidUpdateEmitter.event;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('SQL Prism');
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'sqlPrism.reloadDbtMetadata';
    this.statusBarItem.tooltip = 'Click to reload dbt metadata (manifest.json & catalog.json)';

    this.setupFileWatcher();
    void this.reloadIndex(false);
  }

  private getTargetFolderName(): string {
    const config = vscode.workspace.getConfiguration('sqlPrism');
    const rawTarget = config.get<string>('dbt.targetPath', 'target').trim();
    return rawTarget.replace(/^[/\\]+|[/\\]+$/g, '') || 'target';
  }

  public setupFileWatcher(): void {
    this.fileWatcher?.dispose();

    const targetFolder = this.getTargetFolderName();
    const globPattern = `**/${targetFolder}/{manifest,catalog}.json`;

    this.fileWatcher = vscode.workspace.createFileSystemWatcher(globPattern);
    this.fileWatcher.onDidChange((uri) => {
      this.log(`Detected change in ${uri.fsPath}`);
      this.scheduleReload();
    });
    this.fileWatcher.onDidCreate((uri) => {
      this.log(`Detected creation of ${uri.fsPath}`);
      this.scheduleReload();
    });
    this.fileWatcher.onDidDelete((uri) => {
      this.log(`Detected deletion of ${uri.fsPath}`);
      this.scheduleReload();
    });
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = setTimeout(() => {
      void this.reloadIndex(false);
    }, 300);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString().slice(11, 23);
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  private updateStatusBar(modelCount: number, sourceCount: number, columnCount: number): void {
    if (modelCount === 0 && sourceCount === 0) {
      this.statusBarItem.text = '$(database) SQL Prism: No dbt target';
      this.statusBarItem.tooltip =
        'No dbt manifest.json or catalog.json found in workspace. Click to retry.';
    } else {
      this.statusBarItem.text = `$(database) SQL Prism: ${modelCount} models`;
      this.statusBarItem.tooltip = `SQL Prism dbt Index:\n• ${modelCount} models/seeds/snapshots\n• ${sourceCount} sources\n• ${columnCount} columns\nClick to reload.`;
    }
    this.statusBarItem.show();
  }

  public async reloadIndex(showNotification = false): Promise<void> {
    const startTime = Date.now();
    const nextIndex = createEmptyMetadataIndex();
    const targetFolder = this.getTargetFolderName();
    const excludePattern = '**/{node_modules,dbt_packages,.git,.venv,venv}/**';

    this.log(`Scanning workspace for '**/${targetFolder}/{manifest,catalog}.json'...`);

    try {
      const manifestUris = await vscode.workspace.findFiles(
        `**/${targetFolder}/manifest.json`,
        excludePattern
      );
      const catalogUris = await vscode.workspace.findFiles(
        `**/${targetFolder}/catalog.json`,
        excludePattern
      );

      for (const uri of manifestUris) {
        try {
          const content = await fs.promises.readFile(uri.fsPath, 'utf8');
          const projectRoot = path.dirname(path.dirname(uri.fsPath));
          mergeManifestIntoIndex(nextIndex, content, projectRoot);
          this.log(`Loaded manifest: ${uri.fsPath}`);
        } catch (err) {
          this.log(`ERROR parsing manifest at ${uri.fsPath}: ${String(err)}`);
        }
      }

      for (const uri of catalogUris) {
        try {
          const content = await fs.promises.readFile(uri.fsPath, 'utf8');
          const projectRoot = path.dirname(path.dirname(uri.fsPath));
          mergeCatalogIntoIndex(nextIndex, content, projectRoot);
          this.log(`Loaded catalog: ${uri.fsPath}`);
        } catch (err) {
          this.log(`ERROR parsing catalog at ${uri.fsPath}: ${String(err)}`);
        }
      }

      this.index = nextIndex;
      this.onDidUpdateEmitter.fire();

      const elapsedMs = Date.now() - startTime;
      const modelCount = this.index.modelsByName.size;
      const sourceCount = this.index.sourcesByKey.size;

      let totalColumns = 0;
      for (const model of this.index.byUniqueId.values()) {
        totalColumns += model.columns.size;
      }

      this.log(
        `Index updated in ${elapsedMs}ms: ${modelCount} models, ${sourceCount} sources, ${totalColumns} columns.`
      );
      this.updateStatusBar(modelCount, sourceCount, totalColumns);

      if (showNotification) {
        if (manifestUris.length === 0 && catalogUris.length === 0) {
          const action = await vscode.window.showWarningMessage(
            `SQL Prism: No '${targetFolder}/manifest.json' or '${targetFolder}/catalog.json' found in the current workspace.`,
            'Show Logs'
          );
          if (action === 'Show Logs') {
            this.outputChannel.show(true);
          }
        } else {
          const action = await vscode.window.showInformationMessage(
            `SQL Prism: Loaded ${modelCount} models, ${sourceCount} sources (${totalColumns} columns) in ${elapsedMs}ms.`,
            'Show Logs'
          );
          if (action === 'Show Logs') {
            this.outputChannel.show(true);
          }
        }
      }
    } catch (err) {
      this.log(`FATAL error while indexing dbt target artifacts: ${String(err)}`);
    }
  }

  public getModelByRef(modelName: string): DbtModelMetadata | undefined {
    return this.index.modelsByName.get(modelName.toLowerCase());
  }

  public getSource(sourceName: string, tableName: string): DbtModelMetadata | undefined {
    const key = `${sourceName.toLowerCase()}.${tableName.toLowerCase()}`;
    return this.index.sourcesByKey.get(key);
  }

  public getRelationByName(identifier: string): DbtModelMetadata | undefined {
    const parts = identifier.split('.');
    const baseName = parts[parts.length - 1].toLowerCase();

    if (parts.length >= 2) {
      const schemaOrSource = parts[parts.length - 2].toLowerCase();
      const sourceMatch = this.index.sourcesByKey.get(`${schemaOrSource}.${baseName}`);
      if (sourceMatch) {
        return sourceMatch;
      }
    }

    return (
      this.index.modelsByName.get(baseName) ??
      this.index.relationsByIdentifier.get(baseName)
    );
  }

  public getAllModels(): IterableIterator<DbtModelMetadata> {
    return this.index.byUniqueId.values();
  }

  public dispose(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.fileWatcher?.dispose();
    this.statusBarItem.dispose();
    this.outputChannel.dispose();
    this.onDidUpdateEmitter.dispose();
  }
}