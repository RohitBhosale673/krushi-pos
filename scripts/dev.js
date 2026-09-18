import { spawn } from 'child_process';
import path from 'path';

console.log('Starting KrushiPOS Development Environment...');

const serverProc = spawn('node', ['--watch', 'server/src/index.js'], {
  stdio: 'inherit',
  shell: true
});

const clientProc = spawn('npm', ['run', 'dev'], {
  cwd: path.resolve(process.cwd(), 'client'),
  stdio: 'inherit',
  shell: true
});

process.on('SIGINT', () => {
  serverProc.kill();
  clientProc.kill();
  process.exit();
});
