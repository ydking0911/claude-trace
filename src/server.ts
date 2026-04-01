import * as http from 'http';
import { EventEmitter } from 'events';
import { HookEvent } from './store';

export class EventServer extends EventEmitter {
  private server: http.Server;
  private port: number;

  constructor() {
    super();
    this.port = 0;
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  async start(preferredPort = 7337): Promise<number> {
    this.port = await this.findAvailablePort(preferredPort);

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, '127.0.0.1', () => {
        resolve(this.port);
      });
      this.server.once('error', reject);
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  getPort(): number {
    return this.port;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method === 'POST' && req.url === '/event') {
      let body = '';

      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const event = JSON.parse(body) as HookEvent;
          this.emit('event', event);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      req.on('error', () => {
        res.writeHead(500);
        res.end();
      });
    } else if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', port: this.port }));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  private async findAvailablePort(startPort: number): Promise<number> {
    for (let port = startPort; port < startPort + 10; port++) {
      if (await this.isPortAvailable(port)) {
        return port;
      }
    }
    throw new Error(`No available port found starting from ${startPort}`);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const tester = http.createServer();
      tester.listen(port, '127.0.0.1', () => {
        tester.close(() => resolve(true));
      });
      tester.once('error', () => resolve(false));
    });
  }
}
