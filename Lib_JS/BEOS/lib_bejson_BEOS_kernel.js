/**
 * Library:         lib_bejson_BEOS_kernel.js
 * Family:          BEOS
 * Module Purpose:  BEOS Operating System Kernel, Process Manager & Event Bus JavaScript Mirror
 * Architecture:    BEJSON 104a / Kernel Architecture & IPC Specification
 * Version:         197
 * Release_Version: 300
 * Date:            2026-10-21
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   780f2122-8b1e-4503-9d41-3b7612c6a11e
 */

import {
  ERR_BEOS_PROCESS_NOT_FOUND,
  ERR_BEOS_PROCESS_ACCESS_DENIED,
  BEOSError,
} from './lib_bejson_BEOS_errors.js';

export class BEOSEventBus {
  static instance;

  constructor() {
    this.listeners = new Map();
  }

  static getInstance() {
    if (!BEOSEventBus.instance) {
      BEOSEventBus.instance = new BEOSEventBus();
    }
    return BEOSEventBus.instance;
  }

  subscribe(channel, callback) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    const channelSet = this.listeners.get(channel);
    channelSet.add(callback);

    return () => {
      channelSet.delete(callback);
      if (channelSet.size === 0) {
        this.listeners.delete(channel);
      }
    };
  }

  publish(channel, payload) {
    const channelSet = this.listeners.get(channel);
    if (!channelSet) return;

    channelSet.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[BEOS Kernel IPC Error on channel '${channel}']:`, err);
      }
    });
  }

  clearChannel(channel) {
    this.listeners.delete(channel);
  }
}

export class BEOSKernel {
  static instance;

  constructor() {
    this.processes = new Map();
    this.eventBus = BEOSEventBus.getInstance();
    this.bootTimestamp = Date.now();
    this.pidCounter = 1000;
    this.initKernelProcess();
  }

  static getInstance() {
    if (!BEOSKernel.instance) {
      BEOSKernel.instance = new BEOSKernel();
    }
    return BEOSKernel.instance;
  }

  initKernelProcess() {
    const initPcb = {
      pid: 'pid_1',
      appId: 'kernel',
      title: 'BEOS System Microkernel',
      state: 'RUNNING',
      priority: 'SYSTEM',
      privilege: 'SYSTEM',
      startTime: Date.now(),
      cpuUsagePct: 0.2,
      memoryMb: 8.4,
    };
    this.processes.set(initPcb.pid, initPcb);
  }

  spawnProcess(
    appId,
    title,
    windowId,
    props = {},
    privilege = 'USER',
    priority = 'NORMAL'
  ) {
    this.pidCounter += 1;
    const pid = `pid_${this.pidCounter}`;

    const pcb = {
      pid,
      appId,
      title,
      state: 'RUNNING',
      priority,
      privilege,
      startTime: Date.now(),
      cpuUsagePct: Math.round((Math.random() * 2.5 + 0.5) * 10) / 10,
      memoryMb: Math.round((Math.random() * 12 + 6) * 10) / 10,
      windowId,
      props,
    };

    this.processes.set(pid, pcb);
    this.eventBus.publish('sys:process:spawn', pcb);
    return pcb;
  }

  killProcess(pid) {
    const pcb = this.processes.get(pid);
    if (!pcb) {
      throw new BEOSError(ERR_BEOS_PROCESS_NOT_FOUND, 'BEOSKernel', `Process ID ${pid} not found.`);
    }

    if (pcb.privilege === 'SYSTEM' && pcb.appId === 'kernel') {
      throw new BEOSError(
        ERR_BEOS_PROCESS_ACCESS_DENIED,
        'BEOSKernel',
        'Cannot terminate essential system kernel process.'
      );
    }

    pcb.state = 'TERMINATED';
    this.processes.delete(pid);
    this.eventBus.publish('sys:process:kill', { pid, appId: pcb.appId });
    return true;
  }

  suspendProcess(pid) {
    const pcb = this.processes.get(pid);
    if (pcb) {
      pcb.state = 'SUSPENDED';
      this.eventBus.publish('sys:process:suspend', { pid });
    }
  }

  resumeProcess(pid) {
    const pcb = this.processes.get(pid);
    if (pcb) {
      pcb.state = 'RUNNING';
      this.eventBus.publish('sys:process:resume', { pid });
    }
  }

  getProcess(pid) {
    return this.processes.get(pid);
  }

  getAllProcesses() {
    return Array.from(this.processes.values());
  }

  getSystemMetrics() {
    const processList = Array.from(this.processes.values());
    const usedMemoryMb = processList.reduce((acc, p) => acc + p.memoryMb, 0);
    const cpuLoadPct = Math.min(
      99.9,
      processList.reduce((acc, p) => acc + p.cpuUsagePct, 0)
    );

    return {
      totalMemoryMb: 512,
      usedMemoryMb: Math.round(usedMemoryMb * 10) / 10,
      cpuLoadPct: Math.round(cpuLoadPct * 10) / 10,
      uptimeSeconds: Math.floor((Date.now() - this.bootTimestamp) / 1000),
      activeProcessCount: processList.filter((p) => p.state === 'RUNNING').length,
    };
  }

  static calculateWindowInitialBounds(viewportWidth, viewportHeight, existingCount, isMobile) {
    const width = isMobile
      ? Math.max(300, viewportWidth - 20)
      : Math.max(320, Math.floor(viewportWidth / 2));
    const height = isMobile
      ? Math.max(260, viewportHeight - 80)
      : Math.max(240, Math.floor((viewportHeight - 48) / 2));

    const offset = (existingCount % 6) * 24;
    const x = isMobile
      ? 10
      : Math.max(20, Math.min(viewportWidth - width - 20, 60 + offset));
    const y = isMobile
      ? 10
      : Math.max(20, Math.min(viewportHeight - height - 60, 30 + offset));

    return { x, y, width, height };
  }

  static constrainWindowBounds(x, y, width, height, viewportWidth, viewportHeight) {
    const minVisible = 40;
    const constrainedX = Math.max(-width + minVisible, Math.min(viewportWidth - minVisible, x));
    const constrainedY = Math.max(0, Math.min(viewportHeight - minVisible, y));
    const constrainedWidth = Math.max(280, Math.min(viewportWidth, width));
    const constrainedHeight = Math.max(180, Math.min(viewportHeight - 32, height));

    return {
      x: constrainedX,
      y: constrainedY,
      width: constrainedWidth,
      height: constrainedHeight,
    };
  }
}
