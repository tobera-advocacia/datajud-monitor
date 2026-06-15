const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendFbXNpTT';

app.use(cors());
app.use(express.json());

// Rota principal: proxy para o DataJud
app.post('/consultar', async (req, res) => {
  const { tribunal, doc } = req.body;

  if (!tribunal || !doc) {
    return res.status(400).json({ erro: 'Informe tribunal e documento.' });
  }

  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`;

  const body = {
    size: 20,
    _source: [
      'numeroProcesso', 'classe', 'assunto', 'orgaoJulgador',
      'dataAjuizamento', 'movimentos', 'partes', 'valor'
    ],
    query: {
      nested: {
        path: 'partes',
        query: {
          bool: {
            must: [{ match: { 'partes.CPFouCNPJ': doc.replace(/\D/g, '') } }]
          }
        }
      }
    },
    sort: [{ dataAjuizamento: { order: 'desc' } }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `ApiKey ${DATAJUD_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const txt = await response.text();
      return res.status(response.status).json({ erro: txt });
    }

    const data = await response.json();
    const processos = (data.hits?.hits || []).map(h => h._source);
    res.json({ processos, total: processos.length });

  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', servico: 'Tobera DataJud Proxy', versao: '1.0' });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
