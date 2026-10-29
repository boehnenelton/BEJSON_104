/**
 * Library:         lib_bejson_BEOS_apps.js
 * Family:          BEOS
 * Module Purpose:  BEOS Application Manifest Registry JavaScript Mirror
 * Architecture:    BEOS App Registry & MIME Handler Specifications
 * Version:         197
 * Release_Version: 300
 * Date:            2026-10-21
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   551a8300-8e12-429a-b44e-128954203112
 */

import {
  ERR_BEOS_APPLICATION_MANIFEST_INVALID,
  BEOSError,
} from './lib_bejson_BEOS_errors.js';

export class BEOSAppRegistry {
  static instance;

  constructor() {
    this.apps = new Map();
    this.registerSystemManifests();
  }

  static getInstance() {
    if (!BEOSAppRegistry.instance) {
      BEOSAppRegistry.instance = new BEOSAppRegistry();
    }
    return BEOSAppRegistry.instance;
  }

  registerSystemManifests() {
    const manifests = [
      {
        appId: 'explorer',
        name: 'File Explorer',
        title: 'File Explorer — HardDrive (C:)',
        version: '1.9.7',
        category: 'System',
        description: 'Native BEOS virtual file system browser and disk manager.',
        iconName: 'explorer',
        defaultWidth: 680,
        defaultHeight: 480,
      },
      {
        appId: 'apps',
        name: 'Applications',
        title: 'Applications Registry',
        version: '1.9.8',
        category: 'System',
        description: 'Installed application directory and system package launcher.',
        iconName: 'apps',
        defaultWidth: 640,
        defaultHeight: 440,
      },
      {
        appId: 'beos_editor',
        name: 'BEOS BEJSON Editor',
        title: 'BEOS BEJSON Editor (104/MFDB)',
        version: '1.2.0',
        category: 'Utilities',
        description: 'Single-file browser editor for BEJSON (104/104a & MFDB) documents.',
        iconName: 'database',
        fileAssociations: ['.bejson', '.json', '.104a', '.mfdb'],
        defaultWidth: 840,
        defaultHeight: 560,
      },
    ];

    manifests.forEach((m) => this.registerApp(m));
  }

  registerApp(manifest) {
    if (!manifest.appId || !manifest.name) {
      throw new BEOSError(
        ERR_BEOS_APPLICATION_MANIFEST_INVALID,
        'BEOSAppRegistry',
        'Invalid application manifest: missing required appId or name.'
      );
    }
    this.apps.set(manifest.appId, manifest);
  }

  getApp(appId) {
    return this.apps.get(appId);
  }

  getAppForFileExtension(ext) {
    const cleanExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return Array.from(this.apps.values()).find((app) =>
      app.fileAssociations?.includes(cleanExt)
    );
  }

  getAllApps() {
    return Array.from(this.apps.values());
  }
}
