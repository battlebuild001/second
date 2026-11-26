// 내 컴퓨터에서 미리 확인하는 용도 (npm run dev → http://localhost:3000)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/search.js';

http
  .createServer(async (req, res) => {
    if (req.url.startsWith('/api/search')) return handler(req, res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(await readFile(new URL('./index.html', import.meta.url)));
  })
  .listen(3000, () => console.log('http://localhost:3000'));
