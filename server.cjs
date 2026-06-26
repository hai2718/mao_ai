const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-9be8086861e241a9ac5b6dfb1a6a543e';
const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MAO_TEXT_DIR = path.join(__dirname, 'mao_text');

const SYSTEM_PROMPT = `你是毛泽东。你要像毛泽东那样说话和思考。所有回复必须：
1. 参考下方检索到的毛选原文，在回复中自然引用
2. 语气斩钉截铁，不容置疑，多用排比，三句一组
3. 句末收锤，不说"建议""或许""可能""可以考虑"
4. 定调 → 引用原文 → 分析 → 收锤`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function serveStatic(req, res) {
  let fp = req.url === '/' ? '/index.html' : req.url;
  fp = path.join(__dirname, 'public', fp);
  try {
    const content = fs.readFileSync(fp);
    const ext = path.extname(fp);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain; charset=utf-8' });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function searchMao(keyword) {
  const results = [];
  try {
    const vols = fs.readdirSync(MAO_TEXT_DIR);
    for (const vol of vols) {
      const vd = path.join(MAO_TEXT_DIR, vol);
      if (!fs.statSync(vd).isDirectory()) continue;
      const files = fs.readdirSync(vd);
      for (const f of files) {
        const fp = path.join(vd, f);
        const content = fs.readFileSync(fp, 'utf-8');
        const idx = content.indexOf(keyword);
        if (idx >= 0) {
          const start = Math.max(0, idx - 80);
          const end = Math.min(content.length, idx + keyword.length + 180);
          const title = content.split('\n')[0].replace(/^== /, '').replace(/ ==$/, '');
          results.push({ vol, title, snippet: content.substring(start, end).replace(/\s+/g, ' ') });
        }
        if (results.length >= 6) return results;
      }
    }
  } catch(e) { /* ignore */ }
  return results;
}

function extractKeywords(msg) {
  const segs = msg.replace(/[？！！，。、\s「」『』【】""]+/g, ' ').split(' ').filter(w => w.length >= 2);
  return [...new Set(segs)].slice(0, 8);
}

async function handleChat(req, res) {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', async () => {
    try {
      const { message, history } = JSON.parse(body);
      const kw = extractKeywords(message);
      let ctx = '';
      for (const k of kw) {
        const rs = searchMao(k);
        for (const r of rs) ctx += '[' + r.vol + '《' + r.title + '》]: ' + r.snippet + '\n';
        if (ctx.length > 4000) break;
      }

      const msgs = [
        { role: 'system', content: SYSTEM_PROMPT + '\n\n以下是从毛选原文中检索到的相关内容，必须在回复中引用：\n' + ctx },
        ...(history || []).slice(-20),
        { role: 'user', content: message }
      ];

      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: msgs, temperature: 0.8, max_tokens: 2000 })
      });
      const data = await resp.json();
      if (data.choices) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ reply: data.choices[0].message.content }));
      } else {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: JSON.stringify(data).substring(0, 500) }));
      }
    } catch(e) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e.message }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET') serveStatic(req, res);
  else if (req.method === 'POST' && req.url === '/api/chat') handleChat(req, res);
  else { res.writeHead(404); res.end('{}'); }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Mao AI running on port ' + PORT);
});