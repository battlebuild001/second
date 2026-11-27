// 내 컴퓨터에서 미리 확인하는 용도 (npm run dev → http://localhost:3000)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/search.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const ALLOWED = /^\/(index\.html|army\.html|lib\/[a-z]+\.js)$/;

http
  .createServer(async (req, res) => {
    if (req.url.startsWith('/api/search')) return handler(req, res);
    let path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/') path = '/index.html';
    if (!ALLOWED.test(path)) {
      res.statusCode = 404;
      return res.end('not found');
    }
    res.setHeader('Content-Type', TYPES[path.slice(path.lastIndexOf('.'))]);
    res.end(await readFile(new URL('.' + path, import.meta.url)));
  })
  .listen(3000, () => console.log('http://localhost:3000'));
