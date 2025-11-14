import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServerManager {
  private webProcess: ChildProcess | null = null;
  private isEnabled: boolean;
  private port: number;
  private webUiPath: string;

  constructor(enabled: boolean = true, port: number = 3000) {
    this.isEnabled = enabled;
    this.port = port;
    // Get web-ui path (3 levels up from this file: infrastructure/web -> src -> root -> web-ui)
    this.webUiPath = path.join(__dirname, '../../../web-ui');
  }

  /**
   * Start the Next.js web server
   */
  async start(): Promise<void> {
    if (!this.isEnabled) {
      console.log('Web UI is disabled');
      return;
    }

    console.log(`\n🌐 Starting Web UI server on port ${this.port}...`);

    try {
      // Spawn npm run dev process in web-ui directory
      this.webProcess = spawn('npm', ['run', 'dev'], {
        cwd: this.webUiPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: {
          ...process.env,
          PORT: this.port.toString(),
        },
      });

      // Handle stdout
      this.webProcess.stdout?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          console.log(`[Web UI] ${output}`);
        }
      });

      // Handle stderr
      this.webProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString().trim();
        // Filter out common warnings
        if (output && !output.includes('Warning: Next.js inferred')) {
          console.error(`[Web UI Error] ${output}`);
        }
      });

      // Handle process exit
      this.webProcess.on('exit', (code: number | null) => {
        if (code !== null && code !== 0) {
          console.error(`[Web UI] Process exited with code ${code}`);
        }
        this.webProcess = null;
      });

      // Handle process errors
      this.webProcess.on('error', (error: Error) => {
        console.error('[Web UI] Failed to start:', error.message);
        this.webProcess = null;
      });

      // Wait a bit for server to start
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`✅ Web UI started at http://localhost:${this.port}`);
    } catch (error) {
      console.error('Failed to start Web UI:', error);
      throw error;
    }
  }

  /**
   * Stop the web server
   */
  async stop(): Promise<void> {
    if (!this.webProcess) {
      return;
    }

    console.log('\n🛑 Stopping Web UI server...');

    return new Promise((resolve) => {
      if (!this.webProcess) {
        resolve();
        return;
      }

      const process = this.webProcess;

      // Set a timeout for forceful kill
      const killTimeout = setTimeout(() => {
        if (process && !process.killed) {
          console.log('[Web UI] Force killing process...');
          process.kill('SIGKILL');
        }
      }, 5000);

      process.on('exit', () => {
        clearTimeout(killTimeout);
        this.webProcess = null;
        console.log('✅ Web UI stopped');
        resolve();
      });

      // Try graceful shutdown first
      process.kill('SIGTERM');
    });
  }

  /**
   * Check if web server is running
   */
  isRunning(): boolean {
    return this.webProcess !== null && !this.webProcess.killed;
  }

  /**
   * Get web server URL
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }
}
