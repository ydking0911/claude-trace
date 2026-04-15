import { execFile } from 'child_process';
import * as https from 'https';
import * as path from 'path';

const PACKAGE_NAME = 'claude-trace';

export function getCurrentVersion(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require(path.join(__dirname, '..', 'package.json')) as { version: string };
  return pkg.version;
}

function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('.').map(Number);
  const [la, lb, lc] = parse(latest);
  const [ca, cb, cc] = parse(current);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = getCurrentVersion();

  return new Promise((resolve) => {
    const done = (latestVersion: string) =>
      resolve({ currentVersion, latestVersion, hasUpdate: isNewer(latestVersion, currentVersion) });

    const req = https.get(
      `https://registry.npmjs.org/${PACKAGE_NAME}/latest`,
      { timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { version: string };
            done(json.version);
          } catch {
            done(currentVersion);
          }
        });
      },
    );

    req.on('error', () => done(currentVersion));
    req.on('timeout', () => { req.destroy(); done(currentVersion); });
  });
}

export function runUpdate(): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('npm', ['install', '-g', PACKAGE_NAME], { timeout: 60_000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
