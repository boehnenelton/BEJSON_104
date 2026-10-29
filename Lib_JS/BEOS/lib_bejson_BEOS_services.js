/**
 * Library:         lib_bejson_BEOS_services.js
 * Family:          BEOS
 * Module Purpose:  BEOS System Services Manager JavaScript Mirror
 * Architecture:    BEOS Daemon Framework & Service Registry Specification
 * Version:         197
 * Release_Version: 300
 * Date:            2026-10-21
 * Author:          Elton Boehnen · boehnenelton2024@gmail.com · boehnenelton2024.pages.dev · github.com/boehnenelton
 * Format_Creator:  Elton Boehnen
 * RELATIONAL_ID:   120aef34-912b-4029-a1b4-789d21c00910
 */

import { BEOSEventBus } from './lib_bejson_BEOS_kernel.js';

export class BEOSServiceManager {
  static instance;

  constructor() {
    this.services = new Map();
    this.eventBus = BEOSEventBus.getInstance();
    this.intervals = new Map();
    this.registerCoreServices();
  }

  static getInstance() {
    if (!BEOSServiceManager.instance) {
      BEOSServiceManager.instance = new BEOSServiceManager();
    }
    return BEOSServiceManager.instance;
  }

  registerCoreServices() {
    this.registerService({
      serviceId: 'service_clock_daemon',
      name: 'BEOS System Clock Daemon',
      status: 'STOPPED',
      start: () => {
        if (this.intervals.has('service_clock_daemon')) return;
        const timer = setInterval(() => {
          this.eventBus.publish('sys:clock:tick', { timestamp: new Date().toISOString() });
        }, 1000);
        this.intervals.set('service_clock_daemon', timer);
      },
      stop: () => {
        const timer = this.intervals.get('service_clock_daemon');
        if (timer) {
          clearInterval(timer);
          this.intervals.delete('service_clock_daemon');
        }
      },
    });

    this.registerService({
      serviceId: 'service_telemetry_daemon',
      name: 'BEOS Kernel Telemetry Monitor',
      status: 'STOPPED',
      start: () => {
        if (this.intervals.has('service_telemetry_daemon')) return;
        const timer = setInterval(() => {
          this.eventBus.publish('sys:telemetry:tick', {
            cpuPct: Math.round((Math.random() * 4 + 1) * 10) / 10,
            memoryAllocatedMb: Math.round((28 + Math.random() * 5) * 10) / 10,
          });
        }, 3000);
        this.intervals.set('service_telemetry_daemon', timer);
      },
      stop: () => {
        const timer = this.intervals.get('service_telemetry_daemon');
        if (timer) {
          clearInterval(timer);
          this.intervals.delete('service_telemetry_daemon');
        }
      },
    });

    this.startAllServices();
  }

  registerService(service) {
    this.services.set(service.serviceId, service);
  }

  startService(serviceId) {
    const s = this.services.get(serviceId);
    if (s && s.status !== 'RUNNING') {
      s.status = 'STARTING';
      try {
        s.start();
        s.status = 'RUNNING';
        this.eventBus.publish('sys:service:status', { serviceId, status: 'RUNNING' });
      } catch (err) {
        s.status = 'FAILED';
        console.error(`[BEOS Service Manager] Service ${serviceId} startup failed:`, err);
      }
    }
  }

  stopService(serviceId) {
    const s = this.services.get(serviceId);
    if (s && s.status === 'RUNNING') {
      s.stop();
      s.status = 'STOPPED';
      this.eventBus.publish('sys:service:status', { serviceId, status: 'STOPPED' });
    }
  }

  startAllServices() {
    this.services.forEach((_, id) => this.startService(id));
  }

  stopAllServices() {
    this.services.forEach((_, id) => this.stopService(id));
  }

  getAllServices() {
    return Array.from(this.services.values());
  }
}
