import { readServerConfig } from './config.js';
import { createServer } from './server.js';

async function main(): Promise<void> {
  const config = readServerConfig();
  const app = await createServer(config);
  await app.listen({
    host: config.host,
    port: config.port,
  });
}

void main();
