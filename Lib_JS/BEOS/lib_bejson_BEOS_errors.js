/**
 * Library:         lib_bejson_BEOS_errors.js
 * Family:          BEOS
 * Module Purpose:  Centralized BEOS OS Family Error Code Registry JavaScript Mirror
 * Architecture:    BEJSON 104a / Operating System Framework Architecture
 * Version:         197
 * Release_Version: 300
 * Date:            2026-10-21
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   c38e920d-14a0-4f3b-b23d-9f4305882e11
 */

export const ERR_BEOS_PROCESS_NOT_FOUND = 400;
export const ERR_BEOS_PROCESS_ACCESS_DENIED = 401;
export const ERR_BEOS_WINDOW_OUT_OF_BOUNDS = 402;
export const ERR_BEOS_VFS_PATH_INVALID = 403;
export const ERR_BEOS_VFS_FILE_NOT_FOUND = 404;
export const ERR_BEOS_VFS_PERMISSION_DENIED = 405;
export const ERR_BEOS_VFS_QUOTA_EXCEEDED = 406;
export const ERR_BEOS_REGISTRY_KEY_MISSING = 407;
export const ERR_BEOS_SECURITY_VIOLATION = 408;
export const ERR_BEOS_SERVICE_INITIALIZATION_FAILED = 409;
export const ERR_BEOS_EVENT_DISPATCH_FAILURE = 410;
export const ERR_BEOS_APPLICATION_MANIFEST_INVALID = 411;

export const BEOS_ERROR_MESSAGES = {
  [ERR_BEOS_PROCESS_NOT_FOUND]: 'The specified target process or process ID was not found in kernel registry.',
  [ERR_BEOS_PROCESS_ACCESS_DENIED]: 'Insufficient process privilege level to perform requested kernel trap.',
  [ERR_BEOS_WINDOW_OUT_OF_BOUNDS]: 'Requested window dimensions or positioning exceeds display boundary limits.',
  [ERR_BEOS_VFS_PATH_INVALID]: 'Provided virtual file system path contains illegal tokens or invalid hierarchy.',
  [ERR_BEOS_VFS_FILE_NOT_FOUND]: 'Target file or directory path does not exist in VFS disk mount.',
  [ERR_BEOS_VFS_PERMISSION_DENIED]: 'Operation rejected due to VFS file mode permission lock (rwx).',
  [ERR_BEOS_VFS_QUOTA_EXCEEDED]: 'Virtual disk capacity limit reached for active session volume.',
  [ERR_BEOS_REGISTRY_KEY_MISSING]: 'Requested system registry configuration key not found in HKEY tree.',
  [ERR_BEOS_SECURITY_VIOLATION]: 'Security policy violation detected during privileged system call.',
  [ERR_BEOS_SERVICE_INITIALIZATION_FAILED]: 'Target system service failed startup health check.',
  [ERR_BEOS_EVENT_DISPATCH_FAILURE]: 'System IPC or event bus consumer exception during event dispatch.',
  [ERR_BEOS_APPLICATION_MANIFEST_INVALID]: 'Application manifest failed schema validation checks.',
};

export class BEOSError extends Error {
  constructor(code, sourceModule = 'BEOSKernel', customMessage) {
    const message = customMessage || BEOS_ERROR_MESSAGES[code] || `Unknown BEOS error code: ${code}`;
    super(`[BEOS Error ${code} | ${sourceModule}] ${message}`);
    this.name = 'BEOSError';
    this.code = code;
    this.sourceModule = sourceModule;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      code: this.code,
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      sourceModule: this.sourceModule,
    };
  }
}
