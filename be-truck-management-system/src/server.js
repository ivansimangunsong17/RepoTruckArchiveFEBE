import { createApp } from './app.js';
import { env } from './config/env.js';
import { ensureStorageStructure } from './modules/storage/storage-files.js';

await ensureStorageStructure();
const server = createApp();

server.listen(env.port, () => {
  console.log(`Backend API listening on http://localhost:${env.port}`);
});
