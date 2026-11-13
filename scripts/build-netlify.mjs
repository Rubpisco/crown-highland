/**
 * Netlify 静态构建：
 * public/ 作为站点根目录，另把 shared/engine.js 放到 /shared/engine.js。
 * 在线好友房需要 Node 服务，静态部署不包含。
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'shared'), { recursive: true });
await cp(path.join(root, 'public'), dist, { recursive: true });
// 前端只依赖 engine.js；room-service.js 只给 Node 函数使用，不发布到静态目录。
await cp(path.join(root, 'shared', 'engine.js'), path.join(dist, 'shared', 'engine.js'));

console.log('Netlify static build ready: dist/');
