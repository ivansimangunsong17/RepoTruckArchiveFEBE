import 'dotenv/config';
import {
  ensureStorageStructure,
  getStorageRootPath,
} from '../src/modules/storage/storage-files.js';

const folders = await ensureStorageStructure();
console.log(JSON.stringify({
  status: 'ready',
  storageRoot: getStorageRootPath(),
  folders,
}, null, 2));
