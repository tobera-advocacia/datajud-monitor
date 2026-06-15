import { useState, useCallback } from "react";

// ─── DADOS DO GRUPO CHICO ELETRO (pré-carregados) ───────────────────
const GRUPO_CHICO_ELETRO = [
  { nome: "Francisco Puton", doc: "21428050949", tipo: "cpf", label: "214.280.509-49" },
  { nome: "Puton & Dal Molin Ltda.", doc: "85482594000177", tipo: "cnpj", label: "85.482.594/0001-77" },
  { nome: "Elektro Instaladora Ltda.", doc: "29687110000155", tipo: "cnpj", label: "29.687.110/0001-55" },
  { nome: "Instaladora Elétrica Dois Irmãos Ltda.", doc: "17472057000196", tipo: "cnpj", label: "17.472.057/0001-96" },
];

// ─── TRIBUNAIS DISPONÍVEIS NO DATAJUD ───────────────────────────────
const TRIBUNAIS = [
  { id: "tjpr", label: "TJPR", full: "Tribunal de Justiça do Paraná" },
  { id: "trf4", label: "TRF4", full: "Tribunal Regional Federal 4ª Região" },
  { id: "trt9", label: "TRT9", full: "Tribunal Regional do Trabalho 9ª Região" },
  { id: "trt12", label: "TRT12", full: "Tribunal Regional do Trabalho 12ª Região" },
  { id: "tjsc", label: "TJSC", full: "Tribunal de Justiça de Santa Catarina" },
  { id: "stj", label: "STJ", full: "Superior Tribunal de Justiça" },
  { id: "stf", label: "STF", full: "Supremo Tribunal Federal" },
  { id: "trf3", label: "TRF3", full: "Tribunal Regional Federal 3ª Região" },
  { id: "tst", label: "TST", full: "Tribunal Superior do Trabalho" },
];

// Chave pública oficial divulgada pelo CNJ para acesso à API DataJud
const DATAJUD_KEY = "cDZHYzlZa0JadVREZDJCendFbXNpTT";

// ─── CORES ───────────────────────────────────────────────────────────
const C = {
  navy: "#0f1f3d",
  navyMid: "#1a3260",
  gold: "#c9a84c",
  goldLight: "#e8c870",
  goldPale: "#fdf6e3",
  red: "#b91c1c",
  redBg: "#fef2f2",
  yellow: "#b45309",
  yellowBg: "#fffbeb",
  green: "#1a7a4a",
  greenBg: "#e8f5ee",
  blue: "#1d4ed8",
  blueBg: "#eff6ff",
  gray50: "#f8f9fb",
  gray100: "#eef0f5",
  gray200: "#d6dae6",
  gray400: "#8b92a8",
  gray600: "#4a5068",
  gray800: "#1e2433",
  white: "#ffffff",
};

// ─── HELPERS ─────────────────────────────────────────────────────────
function prazoColor(dias) {
  if (dias === null) return { bg: C.gray100, text: C.gray400 };
  if (dias < 0) return { bg: C.redBg, text: C.red };
  if (dias <= 5) return { bg: C.yellowBg, text: C.yellow };
  return { bg: C.greenBg, text: C.green };
}

function prazoLabel(dias) {
  if (dias === null) return "—";
  if (dias < 0) return `Vencido (${Math.abs(dias)}d)`;
  if (dias === 0) return "Hoje";
  return `${dias} dias`;
}

function buildQuery(doc, tipo) {
  const campo = tipo === "cpf"
    ? "partes.CPFouCNPJ"
    : "partes.CPFouCNPJ";
  return {
    size: 20,
    _source: ["numeroProcesso", "classe", "assunto", "tribunal", "orgaoJulgador",
               "dataAjuizamento", "movimentos", "partes", "valor"],
    query: {
      nested: {
        path: "partes",
        query: {
          bool: {
            must: [{ match: { [campo]: doc.replace(/\D/g, "") } }]
          }
        }
      }
    },
    sort: [{ "dataAjuizamento": { order: "desc" } }]
  };
}

// ─── CHAMADA API DATAJUD ─────────────────────────────────────────────
async function consultarDatajud(tribunal, doc, tipo) {
  const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${tribunal}/_search`;
  const body = buildQuery(doc, tipo);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `ApiKey ${DATAJUD_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`${tribunal.toUpperCase()}: ${response.status} — ${err.slice(0, 120)}`);
  }

  const data = await response.json();
  return (data.hits?.hits || []).map(h => h._source);
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────
export default function DatajudConsultor() {
  const [aba, setAba] = useState("grupo"); // "grupo" | "manual"
  const [tribunaisSel, setTribunaisSel] = useState(["tjpr", "trf4", "trt9"]);
  const [docManual, setDocManual] = useState("");
  const [tipoManual, setTipoManual] = useState("cnpj");
  const [nomeManual, setNomeManual] = useState("");
  const [entidadesSel, setEntidadesSel] = useState(
    GRUPO_CHICO_ELETRO.map(e => e.doc)
  );
  const [resultados, setResultados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erros, setErros] = useState([]);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, msg: "" });
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [pesquisado, setPesquisado] = useState(false);

  // Toggle tribunal
  const toggleTribunal = (id) => {
    setTribunaisSel(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  // Toggle entidade do grupo
  const toggleEntidade = (doc) => {
    setEntidadesSel(prev =>
      prev.includes(doc) ? prev.filter(d => d !== doc) : [...prev, doc]
    );
  };

  // ─── CONSULTA PRINCIPAL ───────────────────────────────────────────
  const consultar = useCallback(async () => {
    if (tribunaisSel.length === 0) {
      alert("Selecione ao menos um tribunal.");
      return;
    }

    const alvos = aba === "grupo"
      ? GRUPO_CHICO_ELETRO.filter(e => entidadesSel.includes(e.doc))
      : [{ nome: nomeManual || docManual, doc: docManual.replace(/\D/g, ""), tipo: tipoManual, label: docManual }];

    if (alvos.length === 0) {
      alert("Selecione ao menos uma entidade.");
      return;
    }

    if (aba === "manual" && !docManual.trim()) {
      alert("Informe o CPF ou CNPJ.");
      return;
    }

    setLoading(true);
    setResultados([]);
    setErros([]);
    setPesquisado(false);

    const total = alvos.length * tribunaisSel.length;
    let atual = 0;
    const novosResultados = [];
    const novosErros = [];

    for (const alvo of alvos) {
      for (const tribunal of tribunaisSel) {
        atual++;
        setProgresso({
          atual,
          total,
          msg: `Consultando ${tribunal.toUpperCase()} — ${alvo.nome}...`
        });

        try {
          const processos = await consultarDatajud(tribunal, alvo.doc, alvo.tipo);
          processos.forEach(p => {
            novosResultados.push({
              ...p,
              _entidade: alvo.nome,
              _doc: alvo.label,
              _tribunal: tribunal.toUpperCase(),
            });
          });
        } catch (e) {
          novosErros.push(`${alvo.nome} / ${tribunal.toUpperCase()}: ${e.message}`);
        }
      }
    }

    setResultados(novosResultados);
    setErros(novosErros);
    setLoading(false);
    setPesquisado(true);
  }, [aba, tribunaisSel, entidadesSel, docManual, tipoManual, nomeManual]);

  // ─── FILTROS ──────────────────────────────────────────────────────
  const resultadosFiltrados = resultados.filter(r => {
    if (filtroStatus === "todos") return true;
    const mov = r.movimentos?.[0];
    const data = mov?.dataHora ? new Date(mov.dataHora) : null;
    const diasUltMov = data ? Math.floor((Date.now() - data) / 86400000) : 999;
    if (filtroStatus === "recente") return diasUltMov <= 30;
    if (filtroStatus === "ativo") return diasUltMov <= 180;
    return true;
  });

  // ─── STATS ───────────────────────────────────────────────────────
  const stats = {
    total: resultados.length,
    tribunais: [...new Set(resultados.map(r => r._tribunal))].length,
    entidades: [...new Set(resultados.map(r => r._entidade))].length,
    recentes: resultados.filter(r => {
      const mov = r.movimentos?.[0];
      const data = mov?.dataHora ? new Date(mov.dataHora) : null;
      return data && Math.floor((Date.now() - data) / 86400000) <= 30;
    }).length,
  };

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: C.gray50, minHeight: "100vh", fontSize: 13 }}>

      {/* HEADER */}
      <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyMid} 100%)`, borderBottom: `3px solid ${C.gold}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, background: C.gold, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, color: C.navy }}>T</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: C.white, letterSpacing: 0.2 }}>Tobera Advocacia — Consultor DataJud</div>
              <div style={{ fontSize: 10, color: C.goldLight, letterSpacing: 1.5, textTransform: "uppercase", marginTop: 1 }}>API Pública CNJ · 91 Tribunais · Tempo Real</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.goldLight, textAlign: "right" }}>
            <div style={{ textTransform: "uppercase", letterSpacing: 1 }}>Chave API</div>
            <div style={{ color: C.white, fontFamily: "monospace", fontSize: 10 }}>CNJ / DataJud Pública</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px" }}>

        {/* ABAS */}
        <div style={{ display: "flex", gap: 4, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: 4, width: "fit-content", marginBottom: 20 }}>
          {[
            { id: "grupo", label: "⬡ Grupo Chico Eletro" },
            { id: "manual", label: "🔍 Consulta Avulsa" },
          ].map(a => (
            <button key={a.id} onClick={() => setAba(a.id)} style={{
              padding: "8px 18px", borderRadius: 7, fontSize: 13, fontWeight: 500,
              cursor: "pointer", border: "none",
              background: aba === a.id ? C.navy : "transparent",
              color: aba === a.id ? C.white : C.gray600,
              transition: "all 0.15s"
            }}>{a.label}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 18, alignItems: "start" }}>

          {/* PAINEL ESQUERDO */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ENTIDADES */}
            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.gray100}`, background: C.navy }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.gold, textTransform: "uppercase", letterSpacing: 1 }}>
                  {aba === "grupo" ? "⬡ Grupo Chico Eletro" : "Consulta Manual"}
                </div>
                {aba === "grupo" && (
                  <div style={{ fontSize: 11, color: C.goldLight, marginTop: 2 }}>Selecione as entidades a consultar</div>
                )}
              </div>

              {aba === "grupo" ? (
                <div>
                  {GRUPO_CHICO_ELETRO.map(e => (
                    <div key={e.doc}
                      onClick={() => toggleEntidade(e.doc)}
                      style={{
                        padding: "11px 18px", display: "flex", alignItems: "center", gap: 10,
                        cursor: "pointer", borderBottom: `1px solid ${C.gray100}`,
                        background: entidadesSel.includes(e.doc) ? C.goldPale : C.white,
                        borderLeft: entidadesSel.includes(e.doc) ? `3px solid ${C.gold}` : "3px solid transparent",
                        transition: "all 0.12s"
                      }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        background: entidadesSel.includes(e.doc) ? C.gold : C.gray100,
                        border: `2px solid ${entidadesSel.includes(e.doc) ? C.gold : C.gray200}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: C.navy, fontWeight: 700, flexShrink: 0
                      }}>
                        {entidadesSel.includes(e.doc) ? "✓" : ""}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: C.navy }}>{e.tipo === "cpf" ? "👤" : "🏢"} {e.nome}</div>
                        <div style={{ fontSize: 10, color: C.gray400, fontFamily: "monospace", marginTop: 1 }}>{e.tipo.toUpperCase()} {e.label}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ padding: "8px 18px", display: "flex", gap: 8 }}>
                    <button onClick={() => setEntidadesSel(GRUPO_CHICO_ELETRO.map(e => e.doc))}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer", color: C.gray600 }}>
                      Marcar todos
                    </button>
                    <button onClick={() => setEntidadesSel([])}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer", color: C.gray600 }}>
                      Desmarcar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: C.gray600, marginBottom: 5 }}>Tipo</div>
                    <select value={tipoManual} onChange={e => setTipoManual(e.target.value)}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", outline: "none" }}>
                      <option value="cpf">CPF</option>
                      <option value="cnpj">CNPJ</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: C.gray600, marginBottom: 5 }}>{tipoManual === "cpf" ? "CPF" : "CNPJ"} (somente números)</div>
                    <input value={docManual} onChange={e => setDocManual(e.target.value)}
                      placeholder={tipoManual === "cpf" ? "00000000000" : "00000000000000"}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: C.gray600, marginBottom: 5 }}>Nome (identificação)</div>
                    <input value={nomeManual} onChange={e => setNomeManual(e.target.value)}
                      placeholder="Ex: João da Silva"
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                  </div>
                </div>
              )}
            </div>

            {/* TRIBUNAIS */}
            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.navy }}>Tribunais</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>Selecione onde consultar</div>
              </div>
              <div style={{ padding: "10px 18px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TRIBUNAIS.map(t => (
                  <button key={t.id} onClick={() => toggleTribunal(t.id)} title={t.full}
                    style={{
                      padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", border: `1px solid ${tribunaisSel.includes(t.id) ? C.navy : C.gray200}`,
                      background: tribunaisSel.includes(t.id) ? C.navy : C.white,
                      color: tribunaisSel.includes(t.id) ? C.white : C.gray600,
                      transition: "all 0.12s"
                    }}>{t.label}</button>
                ))}
              </div>
              <div style={{ padding: "4px 18px 12px", display: "flex", gap: 8 }}>
                <button onClick={() => setTribunaisSel(TRIBUNAIS.map(t => t.id))}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer", color: C.gray600 }}>
                  Todos
                </button>
                <button onClick={() => setTribunaisSel(["tjpr", "trf4", "trt9"])}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer", color: C.gray600 }}>
                  TJPR + TRF4 + TRT9
                </button>
                <button onClick={() => setTribunaisSel([])}
                  style={{ fontSize: 11, padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer", color: C.gray600 }}>
                  Limpar
                </button>
              </div>
            </div>

            {/* BOTÃO CONSULTAR */}
            <button onClick={consultar} disabled={loading}
              style={{
                background: loading ? C.gray200 : C.navy,
                color: loading ? C.gray400 : C.white,
                border: "none", borderRadius: 8, padding: "13px 18px",
                fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "background 0.2s"
              }}>
              {loading ? (
                <>
                  <span style={{ display: "inline-block", width: 16, height: 16, border: `2px solid ${C.gray400}`, borderTopColor: C.navy, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Consultando...
                </>
              ) : "⚡ Consultar DataJud"}
            </button>

            {/* PROGRESSO */}
            {loading && (
              <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 12, color: C.gray600, marginBottom: 8 }}>{progresso.msg}</div>
                <div style={{ background: C.gray100, borderRadius: 100, height: 6, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 100,
                    background: `linear-gradient(90deg, ${C.navy}, ${C.gold})`,
                    width: `${progresso.total > 0 ? (progresso.atual / progresso.total) * 100 : 0}%`,
                    transition: "width 0.3s ease"
                  }} />
                </div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 6, textAlign: "right" }}>
                  {progresso.atual} / {progresso.total} consultas
                </div>
              </div>
            )}
          </div>

          {/* PAINEL DIREITO — RESULTADOS */}
          <div>

            {/* STATS (só após consulta) */}
            {pesquisado && !loading && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                {[
                  { label: "Processos", val: stats.total, color: C.navy },
                  { label: "Tribunais", val: stats.tribunais, color: C.blue },
                  { label: "Entidades", val: stats.entidades, color: C.gold },
                  { label: "Últ. 30 dias", val: stats.recentes, color: C.green },
                ].map(s => (
                  <div key={s.label} style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: C.gray400 }}>{s.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1.2, marginTop: 4 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* FILTROS */}
            {pesquisado && !loading && resultados.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                {[
                  { id: "todos", label: "Todos" },
                  { id: "recente", label: "Mov. últimos 30 dias" },
                  { id: "ativo", label: "Ativos (6 meses)" },
                ].map(f => (
                  <button key={f.id} onClick={() => setFiltroStatus(f.id)}
                    style={{
                      padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", border: `1px solid ${filtroStatus === f.id ? C.navy : C.gray200}`,
                      background: filtroStatus === f.id ? C.navy : C.white,
                      color: filtroStatus === f.id ? C.white : C.gray600,
                    }}>{f.label} {f.id === "todos" ? `(${resultados.length})` : ""}</button>
                ))}
              </div>
            )}

            {/* ESTADO INICIAL */}
            {!pesquisado && !loading && (
              <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⚖️</div>
                <div style={{ fontWeight: 600, color: C.navy, fontSize: 15, marginBottom: 6 }}>
                  {aba === "grupo" ? "Grupo Chico Eletro pronto para consulta" : "Consulta ao DataJud"}
                </div>
                <div style={{ fontSize: 12, color: C.gray400, maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>
                  {aba === "grupo"
                    ? "Selecione os tribunais e clique em Consultar DataJud para rastrear processos do CPF e dos 3 CNPJs em tempo real."
                    : "Informe o CPF ou CNPJ, selecione os tribunais e clique em Consultar DataJud."}
                </div>
              </div>
            )}

            {/* ERROS */}
            {erros.length > 0 && (
              <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: C.red, marginBottom: 6 }}>⚠ Erros de consulta ({erros.length})</div>
                {erros.map((e, i) => (
                  <div key={i} style={{ fontSize: 11, color: C.red, marginTop: 3 }}>• {e}</div>
                ))}
                <div style={{ fontSize: 11, color: C.red, marginTop: 8, opacity: 0.8 }}>
                  Erros são comuns em tribunais com timeout ou fora do ar. As demais consultas foram processadas normalmente.
                </div>
              </div>
            )}

            {/* SEM RESULTADOS */}
            {pesquisado && !loading && resultados.length === 0 && erros.length === 0 && (
              <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📂</div>
                <div style={{ fontWeight: 600, color: C.navy, fontSize: 14 }}>Nenhum processo encontrado</div>
                <div style={{ fontSize: 12, color: C.gray400, marginTop: 6 }}>Tente outros tribunais ou verifique o documento informado.</div>
              </div>
            )}

            {/* LISTA DE PROCESSOS */}
            {resultadosFiltrados.map((p, i) => {
              const movs = p.movimentos || [];
              const ultMov = movs[0];
              const dataUltMov = ultMov?.dataHora ? new Date(ultMov.dataHora) : null;
              const diasUltMov = dataUltMov ? Math.floor((Date.now() - dataUltMov) / 86400000) : null;
              const pc = prazoColor(diasUltMov);
              const assuntos = Array.isArray(p.assunto) ? p.assunto.map(a => a.nome || a).join(", ") : (p.assunto?.nome || p.assunto || "—");
              const classe = p.classe?.nome || p.classe || "—";
              const orgao = p.orgaoJulgador?.nome || "—";
              const partes = p.partes || [];
              const autor = partes.find(pt => pt.polo === "AT" || pt.polo === "ATIVO")?.nome || "—";
              const reu = partes.find(pt => pt.polo === "PA" || pt.polo === "PASSIVO")?.nome || "—";

              return (
                <div key={i} style={{
                  background: C.white, border: `1px solid ${C.gray200}`,
                  borderRadius: 10, marginBottom: 10, overflow: "hidden",
                  transition: "box-shadow 0.15s"
                }}>
                  {/* Cabeçalho do card */}
                  <div style={{ padding: "13px 18px", borderBottom: `1px solid ${C.gray100}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, fontFamily: "Georgia, serif" }}>
                        {p.numeroProcesso || "N° não disponível"}
                      </div>
                      <div style={{ fontSize: 11, color: C.gray600, marginTop: 3 }}>
                        {classe} {assuntos !== "—" ? `· ${assuntos.slice(0, 80)}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 9px",
                        borderRadius: 5, background: C.navy, color: C.white
                      }}>{p._tribunal}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 9px",
                        borderRadius: 5, background: C.goldPale, color: C.gold,
                        border: `1px solid ${C.gold}`
                      }}>{p._entidade.split(" ")[0]}</span>
                    </div>
                  </div>

                  {/* Corpo */}
                  <div style={{ padding: "12px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Órgão Julgador", val: orgao },
                      { label: "Autor / Requerente", val: autor },
                      { label: "Réu / Requerido", val: reu },
                    ].map(f => (
                      <div key={f.label}>
                        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: C.gray400 }}>{f.label}</div>
                        <div style={{ fontSize: 12, color: C.gray800, fontWeight: 500, marginTop: 2 }}>{String(f.val).slice(0, 50)}{String(f.val).length > 50 ? "…" : ""}</div>
                      </div>
                    ))}
                  </div>

                  {/* Última movimentação */}
                  {ultMov && (
                    <div style={{ padding: "0 18px 12px" }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8, color: C.gray400, marginBottom: 5 }}>Última movimentação</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap", minWidth: 80 }}>
                          {dataUltMov ? dataUltMov.toLocaleDateString("pt-BR") : "—"}
                        </span>
                        <span style={{ fontSize: 12, color: C.gray700, lineHeight: 1.4 }}>
                          {ultMov.nome || ultMov.descricao || "Movimentação registrada"}
                          {ultMov.complementosTabelados?.[0]?.descricao ? ` — ${ultMov.complementosTabelados[0].descricao}` : ""}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Rodapé */}
                  <div style={{ padding: "9px 18px", background: C.gray50, borderTop: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: C.gray400 }}>Últ. mov.:</span>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "2px 9px",
                        borderRadius: 5, background: pc.bg, color: pc.text
                      }}>{prazoLabel(diasUltMov)}</span>
                      {p.dataAjuizamento && (
                        <span style={{ fontSize: 11, color: C.gray400 }}>
                          · Ajuizado: {new Date(p.dataAjuizamento).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => navigator.clipboard?.writeText(p.numeroProcesso || "")}
                        style={{ fontSize: 11, padding: "4px 9px", borderRadius: 5, border: `1px solid ${C.gray200}`, background: C.white, cursor: "pointer", color: C.gray600 }}>
                        📋 Copiar n°
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        button:hover { opacity: 0.88; }
        input:focus, select:focus { outline: 2px solid ${C.navy}; outline-offset: 1px; }
      `}</style>
    </div>
  );
}
