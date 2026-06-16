const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

app.use(cors());
app.use(express.json());

function limparDoc(doc) { return doc.replace(/\D/g, ''); }

function extrairNumeros(html) {
  const regex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;
  return [...new Set(html.match(regex) || [])];
}

async function buscarCertidao(url, opts) {
  try {
    const r = await fetch(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' }, ...opts });
    return extrairNumeros(await r.text());
  } catch(e) { return []; }
}

async function certidaoTJPR(doc) {
  const d = limparDoc(doc);
  const tipo = d.length === 11 ? 'CPF' : 'CNPJ';
  return buscarCertidao(`https://projudi.tjpr.jus.br/projudi/publico/certidao.do?_method=pesquisarCertidao&documento=${d}&tipoDocumento=${tipo}`);
}

async function certidaoTRF4(doc) {
  const d = limparDoc(doc);
  return buscarCertidao('https://certidao.trf4.jus.br/certidao/emissao/emitirCertidao.aspx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' },
    body: `cpfCnpj=${d}&tipoConsulta=1`
  });
}

async function certidaoTRT9(doc) {
  return buscarCertidao(`https://pje.trt9.jus.br/certidao/publico?documento=${limparDoc(doc)}`);
}

async function certidaoTRT12(doc) {
  return buscarCertidao(`https://pje.trt12.jus.br/certidao/publico?documento=${limparDoc(doc)}`);
}

async function certidaoTJSC(doc) {
  return buscarCertidao(`https://esaj.tjsc.jus.br/sco/abrirCadastroConsulta.do?documento=${limparDoc(doc)}`);
}

async function certidaoTJRS(doc) {
  return buscarCertidao(`https://www.tjrs.jus.br/novo/certidao/?documento=${limparDoc(doc)}`);
}

async function detalhesDatajud(numero, tribunal) {
  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal.toLowerCase()}/_search`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `ApiKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 1, query: { match: { numeroProcesso: numero } } }),
      timeout: 10000
    });
    if (!r.ok) return { numeroProcesso: numero, tribunal };
    const d = await r.json();
    const hit = d.hits?.hits?.[0]?._source;
    return hit ? { ...hit, tribunal } : { numeroProcesso: numero, tribunal };
  } catch(e) { return { numeroProcesso: numero, tribunal }; }
}

app.post('/certidoes', async (req, res) => {
  const { doc, tribunais } = req.body;
  if (!doc) return res.status(400).json({ erro: 'Informe o documento.' });
  const lista = tribunais || ['tjpr','trf4','trt9','trt12','tjsc','tjrs'];
  const resultados = [], erros = [];
  await Promise.all(lista.map(async (trib) => {
    try {
      const fns = { tjpr: certidaoTJPR, trf4: certidaoTRF4, trt9: certidaoTRT9, trt12: certidaoTRT12, tjsc: certidaoTJSC, tjrs: certidaoTJRS };
      const numeros = fns[trib] ? await fns[trib](doc) : [];
      for (const num of numeros) resultados.push(await detalhesDatajud(num, trib.toUpperCase()));
    } catch(e) { erros.push(`${trib.toUpperCase()}: ${e.message}`); }
  }));
  res.json({ processos: resultados, total: resultados.length, erros });
});

app.post('/consultar', async (req, res) => {
  const { tribunal, doc } = req.body;
  if (!tribunal || !doc) return res.status(400).json({ erro: 'Informe tribunal e documento.' });
  const docLimpo = limparDoc(doc);
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
        return res.json({ processos: (d.hits?.hits||[]).map(h=>h._source), total: d.hits?.total?.value||0, tribunal });
      }
      if ([400,404].includes(r.status)) continue;
      return res.status(r.status).json({ erro: await r.text(), tribunal });
    } catch(e) { return res.status(500).json({ erro: e.message, tribunal }); }
  }
  return res.json({ processos: [], total: 0, tribunal });
});

app.get('/', (req, res) => res.json({ status: 'ok', versao: '3.0', modo: 'certidoes + datajud' }));
app.listen(PORT, () => console.log(`Servidor na porta ${PORT}`));
