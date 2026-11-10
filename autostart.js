const fs = require('node:fs');
const path = require('node:path');

const STARTUP_NAMES = ['NivoDock.bat', 'NivoDock.lnk'];

function createAutostart(startupDir, executable) {
  const entries = STARTUP_NAMES.map(name => path.join(startupDir, name));
  function enabled() { return entries.some(file => fs.existsSync(file)); }
  function toggle() {
    if (enabled()) {
      for (const file of entries) if (fs.existsSync(file)) fs.unlinkSync(file);
      return false;
    }
    fs.mkdirSync(startupDir, { recursive: true });
    fs.writeFileSync(entries[0], `@echo off\r\nchcp 65001 >nul\r\nstart "" "${executable}"\r\n`, 'utf8');
    return true;
  }
  return { enabled, toggle };
}

module.exports = { createAutostart };
