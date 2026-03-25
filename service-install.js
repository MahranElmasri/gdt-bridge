/**
 * service-install.js — Install GDT Bridge as a Windows Service
 *
 * Run ONCE as Administrator:
 *   node service-install.js
 *
 * To uninstall:
 *   node service-uninstall.js
 */

const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
  name: 'GDT Bridge Agent',
  description:
    'Polls web forms API and drops GDT files into Medical Office import folder',
  script: path.join(__dirname, 'bridge.js'),

  // Restart policy: restart on failure, wait 5s between attempts
  wait: 5, // seconds before restart
  grow: 0.25, // back-off multiplier
  maxRestarts: 5,

  // Working directory so .env and logs land next to bridge.js
  workingDirectory: __dirname,

  // Pass Node env
  env: [{ name: 'NODE_ENV', value: 'production' }],
});

svc.on('install', () => {
  console.log('Service installed successfully.');
  svc.start();
  console.log(
    'Service started. Check Windows Services for "GDT Bridge Agent".',
  );
});

svc.on('error', (err) => {
  console.error('Service error:', err);
});

svc.on('alreadyinstalled', () => {
  console.log(
    'Service is already installed. Run service-uninstall.js first if you want to reinstall.',
  );
});

svc.install();
