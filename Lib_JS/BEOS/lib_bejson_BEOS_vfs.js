/**
 * Library:         lib_bejson_BEOS_vfs.js
 * Family:          BEOS
 * Module Purpose:  BEOS Virtual File System Engine JavaScript Mirror
 * Architecture:    BEFS Virtual Disk Specifications & Path Resolver
 * Version:         197
 * Release_Version: 300
 * Date:            2026-10-21
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   291b8d34-7123-421e-920f-a3e1101e43c8
 */

import {
  ERR_BEOS_VFS_PATH_INVALID,
  ERR_BEOS_VFS_FILE_NOT_FOUND,
  ERR_BEOS_VFS_PERMISSION_DENIED,
  BEOSError,
} from './lib_bejson_BEOS_errors.js';
import { BEOSEventBus } from './lib_bejson_BEOS_kernel.js';

export class BEOSVFS {
  static instance;

  constructor() {
    this.nodes = new Map();
    this.storageKey = 'beos_vfs_volume_c';
    this.eventBus = BEOSEventBus.getInstance();
    this.mountVolume();
  }

  static getInstance() {
    if (!BEOSVFS.instance) {
      BEOSVFS.instance = new BEOSVFS();
    }
    return BEOSVFS.instance;
  }

  mountVolume() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsedList = JSON.parse(stored);
        if (Array.isArray(parsedList) && parsedList.length > 0) {
          parsedList.forEach((n) => this.nodes.set(n.path, n));
          return;
        }
      }
    } catch (err) {
      console.warn('[BEOS VFS] Local storage mount issue, re-initializing default system tree:', err);
    }

    this.initializeDefaultFileSystem();
  }

  initializeDefaultFileSystem() {
    const now = new Date().toISOString();
    const defaults = [
      {
        id: 'vfs_root_c',
        name: 'C:',
        path: 'C:',
        parentPath: '',
        content: '',
        size: 0,
        type: 'folder',
        isSystem: true,
        permissions: 'rwx',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'vfs_dir_terminal',
        name: 'terminal',
        path: 'C:/terminal',
        parentPath: 'C:',
        content: '',
        size: 0,
        type: 'folder',
        isSystem: true,
        permissions: 'rwx',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'vfs_dir_system',
        name: 'system',
        path: 'C:/system',
        parentPath: 'C:',
        content: '',
        size: 0,
        type: 'folder',
        isSystem: true,
        permissions: 'r-x',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'vfs_dir_documents',
        name: 'Documents',
        path: 'C:/Documents',
        parentPath: 'C:',
        content: '',
        size: 0,
        type: 'folder',
        permissions: 'rwx',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'vfs_file_readme',
        name: 'welcome.txt',
        path: 'C:/Documents/welcome.txt',
        parentPath: 'C:/Documents',
        content: 'Welcome to BEOS - Modern BEJSON Operating System.\nVersion: 1.9.7\nSystem: Operational.',
        size: 98,
        type: 'file',
        permissions: 'rwx',
        createdAt: now,
        updatedAt: now,
      },
    ];

    defaults.forEach((node) => this.nodes.set(node.path, node));
    this.persistToDisk();
  }

  persistToDisk() {
    try {
      const list = Array.from(this.nodes.values());
      localStorage.setItem(this.storageKey, JSON.stringify(list));
    } catch (err) {
      console.error('[BEOS VFS Persist Error]:', err);
    }
  }

  normalizePath(rawPath) {
    if (!rawPath) return 'C:';
    let path = rawPath.replace(/\\/g, '/').trim();
    if (!path.startsWith('C:')) {
      path = `C:${path.startsWith('/') ? '' : '/'}${path}`;
    }
    if (path.length > 2 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }

  getNode(rawPath) {
    const normalized = this.normalizePath(rawPath);
    return this.nodes.get(normalized);
  }

  listDirectory(rawPath) {
    const parent = this.normalizePath(rawPath);
    const parentNode = this.nodes.get(parent);
    if (!parentNode || parentNode.type !== 'folder') {
      throw new BEOSError(
        ERR_BEOS_VFS_PATH_INVALID,
        'BEOSVFS',
        `Target path '${parent}' is not a valid directory.`
      );
    }

    return Array.from(this.nodes.values()).filter(
      (n) => n.parentPath === parent && n.path !== parent
    );
  }

  writeFile(
    rawPath,
    content,
    isBinary = false,
    permissions = 'rwx'
  ) {
    const normalized = this.normalizePath(rawPath);
    const parts = normalized.split('/');
    const fileName = parts.pop() || '';
    const parentPath = parts.join('/') || 'C:';

    if (!fileName) {
      throw new BEOSError(
        ERR_BEOS_VFS_PATH_INVALID,
        'BEOSVFS',
        `Invalid target file path: ${rawPath}`
      );
    }

    let parentNode = this.nodes.get(parentPath);
    if (!parentNode) {
      this.createFolder(parentPath);
      parentNode = this.nodes.get(parentPath);
    }

    const existing = this.nodes.get(normalized);
    if (existing && existing.permissions && !existing.permissions.includes('w')) {
      throw new BEOSError(
        ERR_BEOS_VFS_PERMISSION_DENIED,
        'BEOSVFS',
        `File '${normalized}' is write-protected.`
      );
    }

    const now = new Date().toISOString();
    const node = {
      id: existing ? existing.id : `vfs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: fileName,
      path: normalized,
      parentPath,
      content,
      size: content.length,
      type: 'file',
      isBinary,
      permissions,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    this.nodes.set(normalized, node);
    this.persistToDisk();
    this.eventBus.publish('sys:vfs:change', { type: 'write', path: normalized, node });
    return node;
  }

  createFolder(rawPath) {
    const normalized = this.normalizePath(rawPath);
    if (this.nodes.has(normalized)) {
      return this.nodes.get(normalized);
    }

    const parts = normalized.split('/');
    const folderName = parts.pop() || '';
    const parentPath = parts.join('/') || 'C:';

    if (parentPath !== 'C:' && !this.nodes.has(parentPath)) {
      this.createFolder(parentPath);
    }

    const now = new Date().toISOString();
    const node = {
      id: `vfs_folder_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: folderName,
      path: normalized,
      parentPath,
      content: '',
      size: 0,
      type: 'folder',
      permissions: 'rwx',
      createdAt: now,
      updatedAt: now,
    };

    this.nodes.set(normalized, node);
    this.persistToDisk();
    this.eventBus.publish('sys:vfs:change', { type: 'create_folder', path: normalized, node });
    return node;
  }

  deleteNode(rawPath) {
    const normalized = this.normalizePath(rawPath);
    const node = this.nodes.get(normalized);
    if (!node) {
      throw new BEOSError(
        ERR_BEOS_VFS_FILE_NOT_FOUND,
        'BEOSVFS',
        `Node not found at path '${normalized}'`
      );
    }

    if (node.isSystem) {
      throw new BEOSError(
        ERR_BEOS_VFS_PERMISSION_DENIED,
        'BEOSVFS',
        `Cannot remove system protected node '${normalized}'`
      );
    }

    if (node.type === 'folder') {
      const children = Array.from(this.nodes.values()).filter((n) =>
        n.path.startsWith(`${normalized}/`)
      );
      children.forEach((child) => this.nodes.delete(child.path));
    }

    this.nodes.delete(normalized);
    this.persistToDisk();
    this.eventBus.publish('sys:vfs:change', { type: 'delete', path: normalized });
    return true;
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }
}
