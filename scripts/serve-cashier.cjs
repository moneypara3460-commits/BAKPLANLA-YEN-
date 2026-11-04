const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const localConfig = path.join(root, '.local', 'cashier-config.js');
const exampleConfig = path.join(root, 'cashier', 'config.example.js');
const supabaseBundle = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
const routes = new Map([
  ['/', { file: path.join(root, 'cashier', 'index.html'), type: 'text/html; charset=utf-8' }],
  ['/cashier.js', { file: path.join(root, 'cashier', 'cashier.js'), type: 'text/javascript; charset=utf-8' }],
  ['/styles.css', { file: path.join(root, 'cashier', 'styles.css'), type: 'text/css; charset=utf-8' }],
  ['/config.js', { file: fs.existsSync(localConfig) ? localConfig : exampleConfig, type: 'text/javascript; charset=utf-8' }],
  ['/supabase.js', { file: supabaseBundle, type: 'text/javascript; charset=utf-8' }],
]);

const port = Number(process.env.CASHIER_PORT || 4173);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid CASHIER_PORT');

http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Method not allowed');
    return;
  }
  const route = routes.get(new URL(request.url, 'http://127.0.0.1').pathname);
  if (!route || !fs.existsSync(route.file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': route.type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://tlizbrhmwaesfjmtxcgh.supabase.co; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  });
  if (request.method === 'HEAD') response.end();
  else fs.createReadStream(route.file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`DEV cashier at http://127.0.0.1:${port}/\n`);
});
