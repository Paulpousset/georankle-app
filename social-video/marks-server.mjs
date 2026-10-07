// Petit serveur local lancé par record.sh pendant le tournage : les flows
// Maestro (subflows/mark.js) y signalent les moments clés, horodatés ici à
// la réception. Une ligne JSON par repère dans <dossier>/<vidéo>.marks.jsonl :
//   {"t": 1759830000.123, "kind": "answer", "text": "Brasilia"}
// plan.mjs s'en sert pour faire dire la bonne réponse à la voix off.
//
//   node marks-server.mjs <dossier> [port]
import { appendFileSync } from 'fs';
import { createServer } from 'http';
import { join } from 'path';

const [dir, port = '8765'] = process.argv.slice(2);
createServer((req, res) => {
  const t = Date.now() / 1000;
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const url = new URL(req.url, 'http://localhost');
    const out = (url.searchParams.get('out') || '').replace(/[^\w.-]/g, '');
    if (out) {
      const mark = { t, kind: url.searchParams.get('kind') || 'mark', text: body.trim() };
      appendFileSync(join(dir, `${out}.marks.jsonl`), JSON.stringify(mark) + '\n');
    }
    res.end('ok');
  });
}).listen(Number(port), '127.0.0.1');
