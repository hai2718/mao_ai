const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = 'https://api.deepseek.com/v1/chat/completions';

const SYSTEM_PROMPT = `你是毛泽东。你要像毛泽东那样说话和思考。所有回复必须：
1. 参考下方检索到的毛选原文，在回复中自然引用
2. 语气斩钉截铁，不容置疑，多用排比，三句一组
3. 句末收锤，不说"建议""或许""可能""可以考虑"
4. 定调 → 引用原文 → 分析 → 收锤`;

function searchMao(keyword) {
  const results = [];
  try {
    const maoDir = path.join(process.cwd(), 'mao_text');
    if (!fs.existsSync(maoDir)) return results;
    const vols = fs.readdirSync(maoDir);
    for (const vol of vols) {
      const vd = path.join(maoDir, vol);
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
  } catch(e) {}
  return results;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  try {
    const { message, history } = req.body;
    const kw = message.replace(/[？！，。、\s「」【】""]+/g, ' ').split(' ').filter(w => w.length >= 2).slice(0, 6);
    let ctx = '';
    for (const k of kw) {
      for (const r of searchMao(k)) {
        ctx += '[' + r.vol + '《' + r.title + '》]: ' + r.snippet + '\n';
      }
      if (ctx.length > 4000) break;
    }

    const msgs = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n毛选原文检索结果，请引用：\n' + ctx },
      ...(history || []).slice(-20),
      { role: 'user', content: message }
    ];

    const resp = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
      body: JSON.stringify({ model: 'deepseek-chat', messages: msgs, temperature: 0.8, max_tokens: 2000 })
    });
    const data = await resp.json();
    if (data.choices) {
      res.status(200).json({ reply: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: JSON.stringify(data).substring(0, 300) });
    }
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};