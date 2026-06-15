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
    { size: 20, query: { nested: { path: 'partes', query: { match: { 'partes.documento': docLimpo } } } }, sort: [{ dataAjuizamento: { order: 'desc' } }] },
    { size: 20, query: { bool: { should: [{ match: { 'partes.CPFouCNPJ': docLimpo } }, { match: { 'partes.documento': docLimpo } }] } }, sort: [{ dataAjuizamento: { order: 'desc' } }] }
  ];


  for (const body of queries) {
    try {
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (response.ok) {
        const data = await response.json();
        const processos = (data.hits?.hits || []).map(h => h._source);
        return res.json({ processos, total: processos.length, tribunal });
      }
      if (response.status === 400 || response.status === 404) continue;
      const txt = await response.text();
      return res.status(response.status).json({ erro: txt, tribunal });
