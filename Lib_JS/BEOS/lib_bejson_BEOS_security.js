/**
 * Library:         lib_bejson_BEOS_security.js
 * Family:          BEOS
 * Module Purpose:  BEOS System Security Manager JavaScript Mirror
 * Architecture:    BEOS Security Policy & System Registry Tree Specification
 * Version:         197
 * Release_Version: 300
 * Date:            2026-10-21
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   4489a221-39c2-4a02-b2b1-667104f98122
 */

import {
  ERR_BEOS_REGISTRY_KEY_MISSING,
  ERR_BEOS_SECURITY_VIOLATION,
  BEOSError,
} from './lib_bejson_BEOS_errors.js';

export class BEOSAuditLogger {
  static instance;

  constructor() {
    this.logBuffer = [];
    this.maxBufferLength = 200;
    this.log('BEOSAuditLogger', 'INIT_SECURITY_AUDITOR', 'SYSTEM', 'SUCCESS', 'Security audit logging service initialized.');
  }

  static getInstance() {
    if (!BEOSAuditLogger.instance) {
      BEOSAuditLogger.instance = new BEOSAuditLogger();
    }
    return BEOSAuditLogger.instance;
  }

  log(source, action, privilege, status, details) {
    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      source,
      action,
      privilege,
      status,
      details,
    };

    this.logBuffer.unshift(entry);
    if (this.logBuffer.length > this.maxBufferLength) {
      this.logBuffer.pop();
    }
    return entry;
  }

  getLogs(limit = 50) {
    return this.logBuffer.slice(0, limit);
  }

  exportMarkdownSummary() {
    return [
      `# BEOS System Security Audit Ledger`,
      `**Generated:** ${new Date().toISOString()}`,
      `**Total Recorded Events:** ${this.logBuffer.length}`,
      ``,
      `| Timestamp | Source | Action | Privilege | Status | Details |`,
      `|---|---|---|---|---|---|`,
      ...this.logBuffer.map(
        (e) => `| ${e.timestamp} | ${e.source} | ${e.action} | ${e.privilege} | ${e.status} | ${e.details.replace(/\|/g, '\\|')} |`
      ),
    ].join('\n');
  }
}

export class BEOSRegistry {
  static instance;

  constructor() {
    this.registryTree = new Map();
    this.storageKey = 'beos_registry_tree';
    this.loadRegistry();
  }

  static getInstance() {
    if (!BEOSRegistry.instance) {
      BEOSRegistry.instance = new BEOSRegistry();
    }
    return BEOSRegistry.instance;
  }

  loadRegistry() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const obj = JSON.parse(stored);
        Object.keys(obj).forEach((k) => this.registryTree.set(k, obj[k]));
        return;
      }
    } catch (err) {
      console.warn('[BEOS Registry] Could not parse stored registry, loading defaults:', err);
    }

    this.initDefaultRegistry();
  }

  initDefaultRegistry() {
    const defaults = {
      'HKEY_BEOS_CONFIG/Version': '1.9.7',
      'HKEY_BEOS_CONFIG/ReleasePackage': '197',
      'HKEY_BEOS_CONFIG/Author': 'Elton Boehnen',
      'HKEY_BEOS_CONFIG/Theme/PrimaryAccent': '#DE2626',
      'HKEY_BEOS_CONFIG/Theme/Background': '#000000',
      'HKEY_BEOS_USER/Clock/Docked': true,
      'HKEY_BEOS_USER/Terminal/PromptPrefix': 'C:/terminal>',
      'HKEY_BEOS_USER/Terminal/AutoParseChunked': true,
      'HKEY_BEOS_DRIVERS/VFS/MountPoint': 'C:',
      'HKEY_BEOS_DRIVERS/VFS/MaxQuotaMb': 64,
    };

    Object.keys(defaults).forEach((k) => this.registryTree.set(k, defaults[k]));
    this.saveRegistry();
  }

  saveRegistry() {
    try {
      const obj = {};
      this.registryTree.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(this.storageKey, JSON.stringify(obj));
    } catch (err) {
      console.error('[BEOS Registry Persist Error]:', err);
    }
  }

  get(hive, keyPath, defaultValue) {
    const fullKey = `${hive}/${keyPath}`;
    if (this.registryTree.has(fullKey)) {
      return this.registryTree.get(fullKey);
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new BEOSError(
      ERR_BEOS_REGISTRY_KEY_MISSING,
      'BEOSRegistry',
      `Registry key '${fullKey}' missing.`
    );
  }

  set(hive, keyPath, value) {
    const fullKey = `${hive}/${keyPath}`;
    this.registryTree.set(fullKey, value);
    this.saveRegistry();
  }
}

export class BEOSSecurityManager {
  static auditor = BEOSAuditLogger.getInstance();

  static validatePrivilege(
    processPrivilege,
    requiredPrivilege,
    sourceModule,
    actionName
  ) {
    const levels = {
      RESTRICTED: 1,
      USER: 2,
      SYSTEM: 3,
    };

    if (levels[processPrivilege] >= levels[requiredPrivilege]) {
      this.auditor.log(
        sourceModule,
        actionName,
        processPrivilege,
        'SUCCESS',
        `Access granted for operation requiring ${requiredPrivilege} privilege.`
      );
      return true;
    }

    this.auditor.log(
      sourceModule,
      actionName,
      processPrivilege,
      'DENIED',
      `Access denied: Process privilege ${processPrivilege} is below required ${requiredPrivilege}.`
    );

    throw new BEOSError(
      ERR_BEOS_SECURITY_VIOLATION,
      sourceModule,
      `Privilege escalation rejected: '${actionName}' requires ${requiredPrivilege} privilege level.`
    );
  }
}
