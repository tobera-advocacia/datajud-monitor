const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const ESCAVADOR_TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiNDQzYjBmMmVkOGIzNTU2ZmYyOGI0ZmY0OTBlZDBiMTE0MWUyMTJhMWZjMWU2NzIzYzA5YzY0NTgzN2NkYzgwMjhkMzc3OTMzMjUzYThhMjAiLCJpYXQiOjE3ODE3MDU4OTEuMTk4NTY0LCJuYmYiOjE3ODE3MDU4OTEuMTk4NTY2LCJleHAiOjE4MTMyODc1OTkuMTk2NDM0LCJzdWIiOiIzOTgwNTUiLCJzY29wZXMiOlsiYWNlc3Nhcl9hcGlfcGFnYWRhIiwiYWNlc3Nhcl9hcGlfcGxheWdyb3VuZCJdfQ.oq9TS17W8vW4SwYYfrEbxa4EFyTV2On-Q00LnSTqh3Tp2yWbe0CXAovC9OKcXK59PYaUQbcGD0pMCtwh9t5b3zBYlctCcsSw6pX3iHhTs9O9fTXoasDJqoAEr5794lnuWgSNQ1S2RIOrBsL_3a2Yp5Gm385wr463n-WeTy06idRHJ7ep33em_SRqvOgVbqMaTfcR2alNyEt5hLoYptKwaveKDEpI7BdwE0v1g7ostY42-j0UhEwdcwamg20jJxaPQ1710Kd473Mfo51MrnYusCMHs6_4jiIF1meryzdSVGCQno-MbweKechE5pvvqVD1BqsvokYwNwWAaLqj7TLxNerB7FOXvOvIClBJa7iX9OUHNy47UXkVpaFN50NKAxTleSdJjC3WC5wTm8ohAb94ij_TdvjzVQ7WdpO3H4Z79k0eZOpQ7yuru9w6rBq0NEGpnQTmfQ1UDlpjWhDDLyxVu6kNBzhjddFAZk2VlrBsexCile93611Fbdv2re9B1fARGf_CrzGzvV8wKeE-0PLE_0ZFA7731y4J2S62lyEfvB5vG5xrlkkJnCIE32bZ9lD3RV3q-JFhKADPfzW3SQ50qhpaFKxQ9rmdhaQ-eGlY6kurF0Hr5k7PXrzRShTYxDSU4DVVRH2YoPJuqyrDcK1wTlfdFeg2IjyWnklC-wEtndA';

app.use(cors());
app.use(express.json());

// Busca processos via portal Escavador (scraping da página pública)
app.post('/escavador', async (req, res) => {
  const { doc } = req.body;
  if (!doc) return res.status(400).json({ erro: 'Informe o documento.' });

  const docLimpo = doc.replace(/\D/g, '');
  const tipo = docLimpo.length === 11 ? 'cpf' : 'cnpj';
  const url = `https://www.escavador.com/${tipo}/${docLimpo}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Cookie': `api_token=${ESCAVADOR_TOKEN}`
      },
      timeout: 20000
    });

    if (!resp.ok) return res.json({ processos: [], total: 0, status: resp.status });

    const html = await resp.text();
    const regex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
    const numeros = [...new Set(html.match(regex) || [])];

    return res.json({ processos: numeros.map(n => ({ numeroProcesso: n, _tribunal: 'ESCAVADOR' })), total: numeros.length });
  } catch (e) {
    return res.status(500).json({ erro: e.message });
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', versao: '4.0', modo: 'escavador' }));
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
