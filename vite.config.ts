import { defineConfig } from 'vitest/config';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const SAVE_ENDPOINT = '/__save-game';
const SAVE_FILENAME = 'savegame.json';
const MAX_SAVE_BYTES = 5 * 1024 * 1024;

export default defineConfig({
  plugins: [
    {
      name: 'write-development-save',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(SAVE_ENDPOINT, (request, response, next) => {
          if (request.method !== 'POST') {
            next();
            return;
          }
          if (
            !request.headers['content-type']
              ?.toLowerCase()
              .startsWith('application/json')
          ) {
            response.statusCode = 415;
            response.end('Expected application/json');
            return;
          }

          let body = '';
          let rejected = false;
          request.setEncoding('utf8');
          request.on('data', (chunk: string) => {
            if (rejected) return;
            body += chunk;
            if (Buffer.byteLength(body) > MAX_SAVE_BYTES) {
              rejected = true;
              response.statusCode = 413;
              response.end('Save file is too large');
            }
          });
          request.on('end', async () => {
            if (rejected) return;

            try {
              const snapshot = JSON.parse(body) as Record<string, unknown>;
              if (
                !Array.isArray(snapshot.buildings) ||
                !Array.isArray(snapshot.workers) ||
                !Array.isArray(snapshot.paths) ||
                !Array.isArray(snapshot.gridTiles)
              ) {
                response.statusCode = 400;
                response.end('Invalid save snapshot');
                return;
              }

              const savePath = resolve(server.config.root, SAVE_FILENAME);
              await writeFile(
                savePath,
                `${JSON.stringify(snapshot, null, 2)}\n`,
                'utf8'
              );
              response.statusCode = 200;
              response.setHeader('Content-Type', 'application/json');
              response.end(
                JSON.stringify({ written: true, filename: SAVE_FILENAME })
              );
            } catch {
              response.statusCode = 400;
              response.end('Could not write save snapshot');
            }
          });
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@world': fileURLToPath(new URL('./src/world', import.meta.url)),
      '@entities': fileURLToPath(new URL('./src/entities', import.meta.url)),
      '@systems': fileURLToPath(new URL('./src/systems', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
      '@utils': fileURLToPath(new URL('./src/utils', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts']
  },
  server: {
    port: 1234
  }
});
