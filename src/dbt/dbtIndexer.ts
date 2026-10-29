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
  private readonly onDidUpdateEmitter = new vscode.EventEmitter<void>();
  public readonly onDidUpdateIndex = this.onDidUpdateEmitter.event;

  constructor() {
    this.setupFileWatcher();
    void this.reloadIndex();
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
    this.fileWatcher.onDidChange(() => this.scheduleReload());
    this.fileWatcher.onDidCreate(() => this.scheduleReload());
    this.fileWatcher.onDidDelete(() => this.scheduleReload());
  }

  private scheduleReload(): void {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
    }
    this.reloadTimer = setTimeout(() => {
      void this.reloadIndex();
    }, 300);
  }

  public async reloadIndex(showNotification = false): Promise<void> {
    const nextIndex = createEmptyMetadataIndex();
    const targetFolder = this.getTargetFolderName();
    const excludePattern = '**/{node_modules,dbt_packages,.git,.venv,venv}/**';

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
        } catch (err) {
          console.warn(`[SQL Prism] Failed to parse manifest at ${uri.fsPath}:`, err);
        }
      }

      for (const uri of catalogUris) {
        try {
          const content = await fs.promises.readFile(uri.fsPath, 'utf8');
          const projectRoot = path.dirname(path.dirname(uri.fsPath));
          mergeCatalogIntoIndex(nextIndex, content, projectRoot);
        } catch (err) {
          console.warn(`[SQL Prism] Failed to parse catalog at ${uri.fsPath}:`, err);
        }
      }

      this.index = nextIndex;
      this.onDidUpdateEmitter.fire();

      if (showNotification) {
        const modelCount = this.index.modelsByName.size;
        const sourceCount = this.index.sourcesByKey.size;
        vscode.window.setStatusBarMessage(
          `SQL Prism: Loaded ${modelCount} dbt models and ${sourceCount} sources`,
          4000
        );
      }
    } catch (err) {
      console.error('[SQL Prism] Error while indexing dbt target artifacts:', err);
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
    this.onDidUpdateEmitter.dispose();
  }
}