/**
 * service-uninstall.js — Remove GDT Bridge Windows Service
 *
 * Run as Administrator:
 *   node service-uninstall.js
 */

const Service = require('node-windows').Service;
const path    = require('path');

const svc = new Service({
  name:   'GDT Bridge Agent',
  script: path.join(__dirname, 'bridge.js'),
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully.');
});

svc.on('error', (err) => {
  console.error('Error:', err);
});

svc.uninstall();
