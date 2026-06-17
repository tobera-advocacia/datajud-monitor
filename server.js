const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

app.use(cors());
app.use(express.json());

app.post('/consultar', async (req, res) => {
  const { tribunal, doc } = req.body;
  if (!tribunal || !doc) return res.status(400).json({ erro: 'Informe tribunal e documento.' });

  const docLimpo = doc.replace(/\D/g, '');
  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`;
  const headers = { 'Authorization': `ApiKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' };

  const queries = [
    { size: 20, query: { nested: { path: 'partes', query: { match: { 'partes.CPFouCNPJ': docLimpo } } } }, sort: [{ dataAjuizamento: { order: 'desc' } }] },
    { size: 20, query: { nested: { path: 'partes', query: { match: { 'partes.documento': docLimpo } } } }, sort: [{ dataAjuizamento: { order: 'desc' } }] }
  ];

  for (const body of queries) {
    try {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), timeout: 10000 });
      if (r.ok) {
        const d = await r.json();
        return res.json({ processos: (d.hits?.hits || []).map(h => h._source), total: d.hits?.total?.value || 0, tribunal });
      }
      if ([400, 404].includes(r.status)) continue;
      return res.status(r.status).json({ erro: await r.text(), tribunal });
    } catch (e) {
      return res.status(500).json({ erro: e.message, tribunal });
    }
  }
  return res.json({ processos: [], total: 0, tribunal });
});

app.get('/', (req, res) => res.json({ status: 'ok', versao: '3.1' }));
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
