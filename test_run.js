import { spawn } from 'child_process';
const proc = spawn('node', ['build/index.js', '--debug'], { 
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 3000
});

proc.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

proc.stderr.on('data', (data) => {
  console.log('STDERR:', data.toString());
});

proc.on('error', (error) => {
  console.error('Error:', error);
});

proc.on('exit', (code, signal) => {
  console.log('Exit code:', code, 'Signal:', signal);
  process.exit(0);
});

setTimeout(() => {
  proc.kill();
}, 3000);
