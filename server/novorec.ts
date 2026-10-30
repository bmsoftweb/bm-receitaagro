import { consultar, consultarUm, executar, executarScript, BmapiError, sqlTexto, sqlNumero, sqlInteiro, agoraISO, sqlData, sqlDataHora, hojeISO, tabelaMemoria } from './bmapi.js';
import { lerRecConfig } from './cadastros.js';
import { semAcento, Progresso } from './util.js';

/**
 * API do Novo Receituário Agronômico (compêndio online): o cache local fica nas tabelas
 * REC_NOVOREC_*. Mesmo comportamento do ufrmReceitas / ufrmDefensivosNovo:
 *  - GET com "Authorization: Bearer <rec_config.tokenId_novorec>";
 *  - relacoes/* são paginadas ({ next, results }): segue o next até null;
 *  - sem token (ou compendio_online = 'N') o sistema trabalha só com o que está na base.
 */

const BASE = 'https://www.novoreceituarioagronomico.com.br/api/';

/** Token quando a API está liberada; null quando o cliente trabalha offline */
export async function tokenNovoRec(): Promise<string | null> {
  const c = await lerRecConfig();
  return c.tokenNovoRec ? c.tokenNovoRec : null;
}

async function getJson(url: string, token: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err: any) {
    throw new BmapiError(`Não foi possível acessar a API do Novo Receituário (${err?.cause?.code || err?.message}).`, 503);
  }
  if (res.status === 401 || res.status === 403) {
    // Motivo que a API devolve (token inválido, assinatura vencida...), sem repetir o token
    const motivo = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
    // Página HTML = bloqueio do Cloudflare do site (excesso de requisições), não recusa do token
    if (motivo.startsWith('<')) throw new BmapiError(`O site do Novo Receituário bloqueou o acesso temporariamente (HTTP ${res.status}, proteção Cloudflare, normalmente por muitas consultas seguidas). Como resolver: aguarde alguns minutos e tente de novo; o token está correto.`, 503);
    throw new BmapiError(`A API do Novo Receituário recusou o token (rec_config.tokenId_novorec): HTTP ${res.status}${motivo ? ` - ${motivo}` : ''}.`, 503);
  }
  if (res.status === 429) throw new BmapiError('O site do Novo Receituário limitou as consultas (HTTP 429). Como resolver: aguarde alguns minutos e tente de novo.', 503);
  if (!res.ok) throw new BmapiError(`API do Novo Receituário respondeu HTTP ${res.status}.`, 503);
  return res.json();
}

/** Todas as páginas de um endpoint; aceita resposta em array puro ou paginada */
async function getTodos(caminho: string, token: string): Promise<any[]> {
  const itens: any[] = [];
  let url: string | null = BASE + caminho;
  for (let paginas = 0; url && paginas < 500; paginas++) {
    const data: any = await getJson(url, token);
    if (Array.isArray(data)) return data;
    itens.push(...(Array.isArray(data?.results) ? data.results : []));
    url = data?.next ? String(data.next) : null;
  }
  return itens;
}

const inteiro = (v: unknown) => {
  const n = Math.trunc(Number(v));
  return v === null || v === undefined || v === 'null' || !Number.isFinite(n) ? 0 : n;
};
const decimal = (v: unknown) => {
  const n = Number(String(v ?? '0').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Marca a hora da última consulta online (o refresh automático é diário) */
async function marcarConsulta(tabela: 'REC_NOVOREC_DEFENSIVOS' | 'REC_NOVOREC_CULTURAS', id: number, quando: string | null) {
  await executar(`UPDATE ${tabela} SET DATAHORA_API = ${quando ? sqlDataHora(quando) : 'NULL'} WHERE ID = ${sqlInteiro(id)}`);
}

// ------------------------------------------------------------
// Relações produto × cultura × praga
// ------------------------------------------------------------
export async function syncCulturasDoProduto(idProduto: number, token: string) {
  const r = await getTodos(`relacoes/cultura/?page=1&produto_id=${idProduto}`, token);
  const ids = [...new Set(r.map((x) => inteiro(x.cultura_id)).filter(Boolean))];
  await executarScript([
    `DELETE FROM REC_NOVOREC_CULTURAS_PRODUTOS WHERE ID_PRODUTO = ${sqlInteiro(idProduto)}`,
    ...ids.map((c) => `INSERT INTO REC_NOVOREC_CULTURAS_PRODUTOS (ID_PRODUTO, ID_CULTURA) VALUES (${sqlInteiro(idProduto)}, ${c})`),
  ]);
  await marcarConsulta('REC_NOVOREC_DEFENSIVOS', idProduto, agoraISO());
}

export async function syncProdutosDaCultura(idCultura: number, token: string) {
  const r = await getTodos(`relacoes/produto/?page=1&cultura_id=${idCultura}`, token);
  const ids = [...new Set(r.map((x) => inteiro(x.produto_id)).filter(Boolean))];
  await executarScript([
    `DELETE FROM REC_NOVOREC_CULTURAS_PRODUTOS WHERE ID_CULTURA = ${sqlInteiro(idCultura)}`,
    ...ids.map((p) => `INSERT INTO REC_NOVOREC_CULTURAS_PRODUTOS (ID_PRODUTO, ID_CULTURA) VALUES (${p}, ${sqlInteiro(idCultura)})`),
  ]);
  await marcarConsulta('REC_NOVOREC_CULTURAS', idCultura, agoraISO());
}

// ------------------------------------------------------------
// Tratamentos (relacoes/simple e complex → REC_NOVOREC_CULTURA_PRAGA_PRODUTO)
// ------------------------------------------------------------
const listaJson = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : String(v ?? '[]'));

/**
 * Colunas de REC_NOVOREC_CULTURA_PRAGA_PRODUTO a partir de um tratamento da API.
 * pr = dados da bula do produto (relacoes/complex); null deixa os campos da bula como estão.
 * local_aplicacao_id só vem no complex: sem ele, a coluna fica como está.
 */
function camposTratamento(t: any, pr: any | null): Record<string, string> {
  return {
    ...(pr ? {
      CLASSIFICACAO_TOXICOLOGICA: sqlTexto(pr.classificacao_toxicologica ?? '', 200),
      PREVENCAO: sqlTexto(pr.prevencao ?? ''),
      ANTIDOTO: sqlTexto(pr.antidoto ?? ''),
      INCOMPATIBILIDADE: sqlTexto(pr.incompatibilidade ?? ''),
      PRECAUCOES_USO: sqlTexto(pr.precaucoes_uso ?? t.precaucoes_uso ?? ''),
      EPI: sqlTexto(pr.epi ?? ''),
      NOME_INGREDIENTES: sqlTexto(pr.nome_ingredientes ?? '', 500),
      RISCO: sqlTexto(pr.risco ?? ''),
    } : {}),
    INTERVALO_SEGURANCA: sqlInteiro(inteiro(t.intervalo_seguranca)),
    DOSE_MINIMA: sqlNumero(decimal(t.dose_minima)),
    DOSE_MAXIMA: sqlNumero(decimal(t.dose_maxima)),
    VOLUME_CALDA: sqlInteiro(inteiro(t.volume_calda)),
    VOLUME_CALDA_AEREA: sqlInteiro(inteiro(t.volume_calda_aerea)),
    MINIMO_APLICACOES: sqlInteiro(inteiro(t.minimo_aplicacoes)),
    MAXIMO_APLICACOES: sqlInteiro(inteiro(t.maximo_aplicacoes)),
    MODO_APLICACAO: sqlTexto(t.modo_aplicacao ?? ''),
    CODIGO_SIAGRO_CULTURA: sqlInteiro(inteiro(t.codigo_siagro_cultura)),
    CODIGO_SIAGRO_PROBLEMA: sqlInteiro(inteiro(t.codigo_siagro_problema)),
    ESTAGIO_CULTURA: sqlTexto(t.estagio_cultura ?? '', 50),
    ESTAGIO_PROBLEMA: sqlTexto(t.estagio_problema ?? '', 50),
    UNIDADE_APLICACAO: sqlTexto(t.unidade_aplicacao ?? '', 30),
    UNIDADE_APLICACAO_ID: sqlInteiro(inteiro(t.unidade_aplicacao_id)),
    LOCAL_APLICACAO: sqlTexto(t.local_aplicacao ?? '', 200),
    ...(t.local_aplicacao_id !== undefined ? { LOCAL_APLICACAO_ID: sqlInteiro(inteiro(t.local_aplicacao_id)) } : {}),
    FRASE_1: sqlTexto(t.frase_1 ?? '', 500),
    FRASE_2: sqlTexto(t.frase_2 ?? '', 500),
    MODALIDADE_APLICACAO: sqlTexto(t.modalidade_aplicacao ?? '', 80),
    UNIDADE_APLICACAO_CODIGO_SIAGRO: sqlInteiro(inteiro(t.unidade_aplicacao_codigo_siagro)),
    ESTADOS_RESTRITOS: sqlTexto(listaJson(t.estados_restritos), 80),
    RESTRICAO_APLICACAO: sqlTexto(listaJson(t.restricao_aplicacao), 120),
  };
}

const textoUpdate = (campos: Record<string, string>) => Object.entries(campos).map(([k, v]) => `${k} = ${v}`).join(', ');

export async function syncTratamento(idProduto: number, idCultura: number, idPraga: number, token: string) {
  const data: any = await getJson(
    `${BASE}relacoes/complex/?produto_id=${idProduto}&cultura_id=${idCultura}&problema_id=${idPraga}`,
    token,
  );
  if (!Array.isArray(data?.results)) return; // o Delphi também segue sem atualizar
  const existentes = await consultar(
    `SELECT SEQ seq FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO
      WHERE ID_PRODUTO = :p AND ID_CULTURA = :c AND ID_PRAGA = :g`,
    { p: idProduto, c: idCultura, g: idPraga },
  );
  const seqs = new Set(existentes.map((e) => Number(e.seq)));

  const comandos = data.results.map((t: any, i: number) => {
    const campos = camposTratamento(t, t.produto || {});
    const seq = i + 1;
    const chave = `ID_PRODUTO = ${sqlInteiro(idProduto)} AND ID_CULTURA = ${sqlInteiro(idCultura)} AND ID_PRAGA = ${sqlInteiro(idPraga)} AND SEQ = ${seq}`;
    if (seqs.has(seq)) {
      // EQUIP_APLICACAO não vem da API (é digitado na receita) e fica como está
      return `UPDATE REC_NOVOREC_CULTURA_PRAGA_PRODUTO SET ${textoUpdate(campos)} WHERE ${chave}`;
    }
    return `INSERT INTO REC_NOVOREC_CULTURA_PRAGA_PRODUTO (ID, ID_PRODUTO, ID_CULTURA, ID_PRAGA, SEQ, ${Object.keys(campos).join(', ')})
            VALUES (${sqlInteiro(inteiro(t.id))}, ${sqlInteiro(idProduto)}, ${sqlInteiro(idCultura)}, ${sqlInteiro(idPraga)}, ${seq}, ${Object.values(campos).join(', ')})`;
  });
  // Um comando por vez: os memos da bula deixam o script grande
  for (const c of comandos) await executar(c);
}

/**
 * Todos os tratamentos do produto (ou só os da cultura) pelo relacoes/simple: páginas de 50 em vez
 * de uma consulta complex por praga, que levava minutos e esbarrava no limite (HTTP 429).
 * O simple não traz a bula (classe toxicológica, EPI, antídoto...), que é a mesma em todos os
 * tratamentos do produto: vem de uma única consulta complex.
 * Grava pelo ID do tratamento e refaz os vínculos do produto. Devolve quantos tratamentos vieram.
 */
export async function syncTratamentosDoProduto(idProduto: number, token: string, idCultura = 0): Promise<number> {
  const lista = await getTodos(`relacoes/simple/?produto_id=${idProduto}${idCultura ? `&cultura_id=${idCultura}` : ''}`, token);
  let bula: any = null;
  if (lista.length) {
    const t0 = lista[0];
    const c: any = await getJson(`${BASE}relacoes/complex/?produto_id=${idProduto}&cultura_id=${inteiro(t0.cultura_id)}&problema_id=${inteiro(t0.problema_id)}`, token);
    bula = c?.results?.[0]?.produto || null;
  }

  const p = sqlInteiro(idProduto);
  const filtroCultura = idCultura ? ` AND ID_CULTURA = ${sqlInteiro(idCultura)}` : '';
  const existentes = await consultar(`SELECT ID id, ID_CULTURA c, ID_PRAGA g, SEQ seq FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID_PRODUTO = ${p}${filtroCultura}`);
  const ids = new Set(existentes.map((e) => Number(e.id)));
  const ultimaSeq = new Map<string, number>();
  for (const e of existentes) {
    const k = `${e.c}-${e.g}`;
    ultimaSeq.set(k, Math.max(ultimaSeq.get(k) || 0, Number(e.seq)));
  }

  const comandos = lista.map((t) => {
    const [c, g] = [inteiro(t.cultura_id), inteiro(t.problema_id)];
    const campos = camposTratamento(t, bula);
    if (ids.has(inteiro(t.id))) return `UPDATE REC_NOVOREC_CULTURA_PRAGA_PRODUTO SET ${textoUpdate(campos)} WHERE ID = ${sqlInteiro(inteiro(t.id))}`;
    const seq = (ultimaSeq.get(`${c}-${g}`) || 0) + 1;
    ultimaSeq.set(`${c}-${g}`, seq);
    return `INSERT INTO REC_NOVOREC_CULTURA_PRAGA_PRODUTO (ID, ID_PRODUTO, ID_CULTURA, ID_PRAGA, SEQ, ${Object.keys(campos).join(', ')})
            VALUES (${sqlInteiro(inteiro(t.id))}, ${p}, ${c}, ${g}, ${seq}, ${Object.values(campos).join(', ')})`;
  });
  // Poucos por vez: os memos da bula deixam o script grande
  for (let i = 0; i < comandos.length; i += 10) await executar(comandos.slice(i, i + 10).join(';\n'));

  // Vínculos: culturas e pragas do produto (produto inteiro) e as pragas de cada cultura no produto
  const pares = [...new Set(lista.map((t) => `${inteiro(t.cultura_id)}-${inteiro(t.problema_id)}`))].map((k) => k.split('-').map(Number));
  const culturas = [...new Set(pares.map(([c]) => c))];
  const pragas = [...new Set(pares.map(([, g]) => g))];
  const pragasDaCultura = culturas.length
    ? new Set((await consultar(`SELECT ID_CULTURA c, ID_PRAGA g FROM REC_NOVOREC_PRAGAS_CULTURA WHERE ID_CULTURA IN (${culturas.join(',')})`)).map((r) => `${r.c}-${r.g}`))
    : new Set<string>();
  await executarScript([
    ...(idCultura ? [] : [
      `DELETE FROM REC_NOVOREC_CULTURAS_PRODUTOS WHERE ID_PRODUTO = ${p}`,
      ...culturas.map((c) => `INSERT INTO REC_NOVOREC_CULTURAS_PRODUTOS (ID_PRODUTO, ID_CULTURA) VALUES (${p}, ${c})`),
      `DELETE FROM REC_NOVOREC_PRAGAS_PRODUTOS WHERE ID_PRODUTO = ${p}`,
      ...pragas.map((g) => `INSERT INTO REC_NOVOREC_PRAGAS_PRODUTOS (ID_PRODUTO, ID_PRAGA, USO) VALUES (${p}, ${g}, 'N')`),
    ]),
    `DELETE FROM REC_NOVOREC_PRAGAS_CULTURA_PRODUTO WHERE ID_PRODUTO = ${p}${filtroCultura}`,
    ...pares.map(([c, g]) => `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA_PRODUTO (ID_PRODUTO, ID_CULTURA, ID_PRAGA) VALUES (${p}, ${c}, ${g})`),
    ...pares.filter(([c, g]) => !pragasDaCultura.has(`${c}-${g}`))
      .map(([c, g]) => `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA (ID_CULTURA, ID_PRAGA) VALUES (${c}, ${g})`),
  ]);
  return lista.length;
}

// ------------------------------------------------------------
// Catálogo completo (botão Atualizar dos Defensivos)
// ------------------------------------------------------------
export async function atualizarCatalogo(progresso: Progresso = () => {}): Promise<{ defensivos: number; culturas: number; pragas: number; desde: string }> {
  const token = await tokenNovoRec();
  if (!token) throw new BmapiError('Sem token do Novo Receituário em rec_config (tokenId_novorec).');

  // Só o que mudou desde a última atualização (dhalt__gte). Sem data gravada (ou sem a coluna
  // REC_CONFIG.DATA_CATALOGO_NOVOREC) baixa tudo; apagar a data força o catálogo completo.
  const desde = await consultarUm('SELECT DATA_CATALOGO_NOVOREC d FROM REC_CONFIG TOP 1')
    .then((r) => (r?.d ? String(r.d).slice(0, 10) : ''), () => '');
  const filtro = desde ? `?dhalt__gte=${desde}` : '';
  // Um dia de folga: a data da API pode estar em outro fuso
  const proxima = hojeISO(-1);

  // Defensivos
  progresso(desde ? 'Baixando os defensivos alterados' : 'Baixando os defensivos');
  const produtos = await getTodos(`produtos${filtro}`, token);
  const jaTem = new Set((await consultar('SELECT ID id FROM REC_NOVOREC_DEFENSIVOS')).map((r) => Number(r.id)));
  await executarScript(produtos.map((p) => {
    const id = sqlInteiro(inteiro(p.id));
    const nome = sqlTexto(semAcento(p.nome).toUpperCase(), 80);
    const mapa = sqlTexto(String(p.registro_mapa ?? '').trim(), 15);
    const ativo = p.ativo === false || String(p.ativo).toLowerCase() === 'false' ? 'FALSE' : 'TRUE';
    return jaTem.has(inteiro(p.id))
      ? `UPDATE REC_NOVOREC_DEFENSIVOS SET NOME = ${nome}, REGISTRO_MAPA = ${mapa}, ATIVO = ${ativo} WHERE ID = ${id}`
      : `INSERT INTO REC_NOVOREC_DEFENSIVOS (ID, NOME, REGISTRO_MAPA, ATIVO) VALUES (${id}, ${nome}, ${mapa}, ${ativo})`;
  }), (f, t) => progresso('Gravando os defensivos', f, t));

  // Ponte REC_DEFENSIVOS por registro MAPA e código CIDASC (só onde não foi ajustado à mão).
  // O MAPA se repete entre produtos (na API e na tabela da CIDASC): só liga quando ele é de um
  // produto só, e só linhas ainda sem produto (sobrescrever juntava produtos diferentes e o INSERT
  // abaixo recriava os outros a cada atualização).
  const [mapasNr, mapasCidasc] = [tabelaMemoria('MN'), tabelaMemoria('MC')];
  progresso('Ligando os defensivos pelo registro MAPA');
  try {
    // A tabela em memória criada no mesmo script não abre ("Error creating table handle"): cria antes
    await executarScript([
      `SELECT REGISTRO_MAPA MAPA, COUNT(*) N INTO ${mapasNr} FROM REC_NOVOREC_DEFENSIVOS GROUP BY REGISTRO_MAPA`,
      `SELECT NRREGISTROMAPA MAPA, COUNT(*) N INTO ${mapasCidasc} FROM REC_DEFENSIVOS_CIDASC GROUP BY NRREGISTROMAPA`,
    ]);
    await executarScript([
      `UPDATE REC_DEFENSIVOS A SET ID_NOVOREC = B.ID FROM REC_DEFENSIVOS A
         INNER JOIN REC_NOVOREC_DEFENSIVOS B ON B.REGISTRO_MAPA = A.ID_MAPA
         INNER JOIN ${mapasNr} U ON U.MAPA = B.REGISTRO_MAPA
        WHERE A.ID_NOVOREC IS NULL AND A.ID_MAPA <> '' AND U.N = 1`,
      `INSERT INTO REC_DEFENSIVOS (ID_NOVOREC, ID_MAPA)
         SELECT B.ID, B.REGISTRO_MAPA FROM REC_NOVOREC_DEFENSIVOS B
          WHERE B.ID NOT IN (SELECT ID_NOVOREC FROM REC_DEFENSIVOS WHERE ID_NOVOREC IS NOT NULL)`,
      `UPDATE REC_DEFENSIVOS A SET ID_CIDASC = C.IDAGROTOXICO FROM REC_DEFENSIVOS A
         INNER JOIN REC_DEFENSIVOS_CIDASC C ON C.NRREGISTROMAPA = A.ID_MAPA
         INNER JOIN ${mapasCidasc} U ON U.MAPA = C.NRREGISTROMAPA
        WHERE (A.MANUAL IS NULL OR A.MANUAL <> 'S') AND A.ID_MAPA <> '' AND U.N = 1`,
    ]);
  } finally {
    await executar(`DROP TABLE IF EXISTS ${mapasNr};
DROP TABLE IF EXISTS ${mapasCidasc}`).catch(() => {});
  }
  // Código CIDASC que a API já manda (codigo_cidasc) vale mais que o achado pelo MAPA; o vínculo manual continua
  await executarScript(produtos.filter((p) => inteiro(p.codigo_cidasc) > 0).map((p) => {
    const c = sqlInteiro(inteiro(p.codigo_cidasc));
    return `UPDATE REC_DEFENSIVOS SET ID_CIDASC = ${c} WHERE ID_NOVOREC = ${sqlInteiro(inteiro(p.id))}
              AND (MANUAL IS NULL OR MANUAL <> 'S') AND (ID_CIDASC IS NULL OR ID_CIDASC <> ${c})`;
  }), (f, t) => progresso('Gravando os códigos CIDASC dos defensivos', f, t));

  // Culturas e pragas
  const upsertNomes = async (tabela: string, caminho: string, rotulo: string) => {
    progresso(`Baixando as ${rotulo}`);
    const itens = await getTodos(caminho, token);
    const ids = new Set((await consultar(`SELECT ID id FROM ${tabela}`)).map((r) => Number(r.id)));
    await executarScript(itens.map((x) => {
      const id = sqlInteiro(inteiro(x.id));
      const nome = sqlTexto(semAcento(x.nome).toUpperCase(), 80);
      const cient = sqlTexto(semAcento(x.nome_cientifico), 80);
      const siagro = x.codigo_siagro_1 === null || x.codigo_siagro_1 === undefined ? null : sqlInteiro(inteiro(x.codigo_siagro_1));
      const cidasc = inteiro(x.codigo_cidasc) > 0 ? sqlInteiro(inteiro(x.codigo_cidasc)) : null;
      return ids.has(inteiro(x.id))
        ? `UPDATE ${tabela} SET NOME = ${nome}, NOME_CIENTIFICO = ${cient}${siagro ? `, CODIGO_SIAGRO_1 = ${siagro}` : ''}${cidasc ? `, ID_CIDASC = ${cidasc}` : ''} WHERE ID = ${id}`
        : `INSERT INTO ${tabela} (ID, NOME, NOME_CIENTIFICO, CODIGO_SIAGRO_1, ID_CIDASC) VALUES (${id}, ${nome}, ${cient}, ${siagro ?? 'NULL'}, ${cidasc ?? 'NULL'})`;
    }), (f, t) => progresso(`Gravando as ${rotulo}`, f, t));
    return itens.length;
  };
  const culturas = await upsertNomes('REC_NOVOREC_CULTURAS', `culturas${filtro}`, 'culturas');
  const pragas = await upsertNomes('REC_NOVOREC_PRAGAS', `problemas${filtro}`, 'pragas');

  // Sem codigo_cidasc na API: código CIDASC pelo nome (culturas) e pelo nome científico (pragas)
  progresso('Ligando culturas e pragas à CIDASC');
  await executarScript([
    `UPDATE REC_NOVOREC_CULTURAS A SET ID_CIDASC = B.IDNOMECOMUMESPECIEVEGETAL FROM REC_NOVOREC_CULTURAS A
       INNER JOIN REC_CULTURAS_CIDASC B ON UPPER(B.NMCOMUMESPECIEVEGERAL) = UPPER(A.NOME)
      WHERE A.ID_CIDASC IS NULL OR A.ID_CIDASC = 0`,
    `UPDATE REC_NOVOREC_PRAGAS A SET ID_CIDASC = B.IDPRAGA FROM REC_NOVOREC_PRAGAS A
       INNER JOIN REC_PRAGAS_CIDASC B ON UPPER(B.NMCIENTIFICOPRAGA) = UPPER(A.NOME_CIENTIFICO)
      WHERE A.ID_CIDASC IS NULL OR A.ID_CIDASC = 0`,
  ]);

  progresso('Refazendo os vínculos entre culturas, pragas e produtos');
  await acertarTabelas();
  await executar(`UPDATE REC_CONFIG SET DATA_CATALOGO_NOVOREC = ${sqlData(proxima)}`).catch(() => {});
  return { defensivos: produtos.length, culturas, pragas, desde };
}

/** Refaz as tabelas de vínculo a partir dos tratamentos (qrAcertaNovoRec) */
export async function acertarTabelas() {
  await executarScript([
    'DELETE FROM REC_NOVOREC_CULTURAS_PRODUTOS',
    'DELETE FROM REC_NOVOREC_PRAGAS_CULTURA',
    'DELETE FROM REC_NOVOREC_PRAGAS_PRODUTOS',
    'DELETE FROM REC_NOVOREC_PRAGAS_CULTURA_PRODUTO',
    `INSERT INTO REC_NOVOREC_CULTURAS_PRODUTOS SELECT ID_PRODUTO, ID_CULTURA
       FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO GROUP BY ID_PRODUTO, ID_CULTURA`,
    `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA SELECT ID_CULTURA, ID_PRAGA
       FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO GROUP BY ID_CULTURA, ID_PRAGA`,
    `INSERT INTO REC_NOVOREC_PRAGAS_PRODUTOS SELECT ID_PRODUTO, ID_PRAGA, 'N' USO
       FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO GROUP BY ID_PRODUTO, ID_PRAGA`,
    `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA_PRODUTO SELECT ID_PRODUTO, ID_CULTURA, ID_PRAGA
       FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO GROUP BY ID_PRODUTO, ID_CULTURA, ID_PRAGA`,
  ]);
}

/** "Buscar Tratamentos" do defensivo (ufrmGerarDados para um produto) */
export async function buscarTratamentosDoProduto(idProduto: number): Promise<number> {
  const token = await tokenNovoRec();
  if (!token) throw new BmapiError('Sem token do Novo Receituário em rec_config (tokenId_novorec).');
  const total = await syncTratamentosDoProduto(idProduto, token);
  // Força o refresh na próxima receita, como o Delphi faz ao voltar do Gerar Dados
  await marcarConsulta('REC_NOVOREC_DEFENSIVOS', idProduto, null);
  return total;
}
