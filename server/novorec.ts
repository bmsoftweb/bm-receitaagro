import { consultar, executar, executarScript, BmapiError, sqlTexto, sqlNumero, sqlInteiro, agoraISO, sqlDataHora } from './bmapi.js';
import { lerRecConfig } from './cadastros.js';
import { semAcento } from './util.js';

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
    throw new BmapiError('A API do Novo Receituário recusou o token (rec_config.tokenId_novorec).', 503);
  }
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

async function syncPragasDoProduto(idProduto: number, token: string) {
  const r = await getTodos(`relacoes/problema/?page=1&produto_id=${idProduto}`, token);
  const ids = [...new Set(r.map((x) => inteiro(x.problema_id)).filter(Boolean))];
  await executarScript([
    `DELETE FROM REC_NOVOREC_PRAGAS_PRODUTOS WHERE ID_PRODUTO = ${sqlInteiro(idProduto)}`,
    ...ids.map((g) => `INSERT INTO REC_NOVOREC_PRAGAS_PRODUTOS (ID_PRODUTO, ID_PRAGA, USO) VALUES (${sqlInteiro(idProduto)}, ${g}, 'N')`),
  ]);
}

async function syncPragasDaCultura(idCultura: number, token: string) {
  const r = await getTodos(`relacoes/problema/?page=1&cultura_id=${idCultura}`, token);
  const ids = [...new Set(r.map((x) => inteiro(x.problema_id)).filter(Boolean))];
  await executarScript([
    `DELETE FROM REC_NOVOREC_PRAGAS_CULTURA WHERE ID_CULTURA = ${sqlInteiro(idCultura)}`,
    ...ids.map((g) => `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA (ID_CULTURA, ID_PRAGA) VALUES (${sqlInteiro(idCultura)}, ${g})`),
  ]);
}

/** Interseção local: pragas do produto que também são da cultura (btn_api_relacionar) */
export async function relacionar(idProduto: number, idCultura: number) {
  const p = sqlInteiro(idProduto);
  const c = sqlInteiro(idCultura);
  await executarScript([
    `DELETE FROM REC_NOVOREC_PRAGAS_CULTURA_PRODUTO WHERE ID_PRODUTO = ${p} AND ID_CULTURA = ${c}`,
    `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA_PRODUTO (ID_PRODUTO, ID_CULTURA, ID_PRAGA)
       SELECT A.ID_PRODUTO, ${c}, A.ID_PRAGA FROM REC_NOVOREC_PRAGAS_PRODUTOS A
        WHERE A.ID_PRODUTO = ${p}
          AND A.ID_PRAGA IN (SELECT B.ID_PRAGA FROM REC_NOVOREC_PRAGAS_CULTURA B WHERE B.ID_CULTURA = ${c})`,
  ]);
}

/** Pragas do produto e da cultura, depois a interseção (ao avançar a cultura no assistente) */
export async function syncPragas(idProduto: number, idCultura: number, token: string) {
  await syncPragasDoProduto(idProduto, token);
  await syncPragasDaCultura(idCultura, token);
  await relacionar(idProduto, idCultura);
}

// ------------------------------------------------------------
// Tratamentos (relacoes/complex → REC_NOVOREC_CULTURA_PRAGA_PRODUTO)
// ------------------------------------------------------------
const listaJson = (v: unknown) => (Array.isArray(v) ? JSON.stringify(v) : String(v ?? '[]'));

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
    const pr = t.produto || {};
    const campos: Record<string, string> = {
      CLASSIFICACAO_TOXICOLOGICA: sqlTexto(pr.classificacao_toxicologica ?? '', 200),
      PREVENCAO: sqlTexto(pr.prevencao ?? ''),
      ANTIDOTO: sqlTexto(pr.antidoto ?? ''),
      INCOMPATIBILIDADE: sqlTexto(pr.incompatibilidade ?? ''),
      PRECAUCOES_USO: sqlTexto(pr.precaucoes_uso ?? ''),
      EPI: sqlTexto(pr.epi ?? ''),
      NOME_INGREDIENTES: sqlTexto(pr.nome_ingredientes ?? '', 500),
      RISCO: sqlTexto(pr.risco ?? ''),
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
      LOCAL_APLICACAO_ID: sqlInteiro(inteiro(t.local_aplicacao_id)),
      FRASE_1: sqlTexto(t.frase_1 ?? '', 500),
      FRASE_2: sqlTexto(t.frase_2 ?? '', 500),
      MODALIDADE_APLICACAO: sqlTexto(t.modalidade_aplicacao ?? '', 80),
      UNIDADE_APLICACAO_CODIGO_SIAGRO: sqlInteiro(inteiro(t.unidade_aplicacao_codigo_siagro)),
      ESTADOS_RESTRITOS: sqlTexto(listaJson(t.estados_restritos), 80),
      RESTRICAO_APLICACAO: sqlTexto(listaJson(t.restricao_aplicacao), 120),
    };
    const seq = i + 1;
    const chave = `ID_PRODUTO = ${sqlInteiro(idProduto)} AND ID_CULTURA = ${sqlInteiro(idCultura)} AND ID_PRAGA = ${sqlInteiro(idPraga)} AND SEQ = ${seq}`;
    if (seqs.has(seq)) {
      // EQUIP_APLICACAO não vem da API (é digitado na receita) e fica como está
      return `UPDATE REC_NOVOREC_CULTURA_PRAGA_PRODUTO SET ${Object.entries(campos).map(([k, v]) => `${k} = ${v}`).join(', ')} WHERE ${chave}`;
    }
    return `INSERT INTO REC_NOVOREC_CULTURA_PRAGA_PRODUTO (ID, ID_PRODUTO, ID_CULTURA, ID_PRAGA, SEQ, ${Object.keys(campos).join(', ')})
            VALUES (${sqlInteiro(inteiro(t.id))}, ${sqlInteiro(idProduto)}, ${sqlInteiro(idCultura)}, ${sqlInteiro(idPraga)}, ${seq}, ${Object.values(campos).join(', ')})`;
  });
  // Um comando por vez: os memos da bula deixam o script grande
  for (const c of comandos) await executar(c);
}

// ------------------------------------------------------------
// Catálogo completo (botão Atualizar dos Defensivos)
// ------------------------------------------------------------
export async function atualizarCatalogo(): Promise<{ defensivos: number; culturas: number; pragas: number }> {
  const token = await tokenNovoRec();
  if (!token) throw new BmapiError('Sem token do Novo Receituário em rec_config (tokenId_novorec).');

  // Defensivos
  const produtos = await getTodos('produtos', token);
  const jaTem = new Set((await consultar('SELECT ID id FROM REC_NOVOREC_DEFENSIVOS')).map((r) => Number(r.id)));
  await executarScript(produtos.map((p) => {
    const id = sqlInteiro(inteiro(p.id));
    const nome = sqlTexto(semAcento(p.nome).toUpperCase(), 80);
    const mapa = sqlTexto(String(p.registro_mapa ?? '').trim(), 15);
    const ativo = p.ativo === false || String(p.ativo).toLowerCase() === 'false' ? 'FALSE' : 'TRUE';
    return jaTem.has(inteiro(p.id))
      ? `UPDATE REC_NOVOREC_DEFENSIVOS SET NOME = ${nome}, REGISTRO_MAPA = ${mapa}, ATIVO = ${ativo} WHERE ID = ${id}`
      : `INSERT INTO REC_NOVOREC_DEFENSIVOS (ID, NOME, REGISTRO_MAPA, ATIVO) VALUES (${id}, ${nome}, ${mapa}, ${ativo})`;
  }));

  // Ponte REC_DEFENSIVOS por registro MAPA e código CIDASC (só onde não foi ajustado à mão)
  await executarScript([
    `UPDATE REC_DEFENSIVOS A SET ID_NOVOREC = B.ID FROM REC_DEFENSIVOS A
       INNER JOIN REC_NOVOREC_DEFENSIVOS B ON B.REGISTRO_MAPA = A.ID_MAPA`,
    `INSERT INTO REC_DEFENSIVOS (ID_NOVOREC, ID_MAPA)
       SELECT B.ID, B.REGISTRO_MAPA FROM REC_NOVOREC_DEFENSIVOS B
        WHERE B.ID NOT IN (SELECT ID_NOVOREC FROM REC_DEFENSIVOS WHERE ID_NOVOREC IS NOT NULL)`,
    `UPDATE REC_DEFENSIVOS A SET ID_CIDASC = C.IDAGROTOXICO FROM REC_DEFENSIVOS A
       INNER JOIN REC_DEFENSIVOS_CIDASC C ON C.NRREGISTROMAPA = A.ID_MAPA
      WHERE (A.MANUAL IS NULL OR A.MANUAL <> 'S')`,
  ]);

  // Culturas e pragas
  const upsertNomes = async (tabela: string, caminho: string) => {
    const itens = await getTodos(caminho, token);
    const ids = new Set((await consultar(`SELECT ID id FROM ${tabela}`)).map((r) => Number(r.id)));
    await executarScript(itens.map((x) => {
      const id = sqlInteiro(inteiro(x.id));
      const nome = sqlTexto(semAcento(x.nome).toUpperCase(), 80);
      const cient = sqlTexto(semAcento(x.nome_cientifico), 80);
      const siagro = x.codigo_siagro_1 === null || x.codigo_siagro_1 === undefined ? null : sqlInteiro(inteiro(x.codigo_siagro_1));
      return ids.has(inteiro(x.id))
        ? `UPDATE ${tabela} SET NOME = ${nome}, NOME_CIENTIFICO = ${cient}${siagro ? `, CODIGO_SIAGRO_1 = ${siagro}` : ''} WHERE ID = ${id}`
        : `INSERT INTO ${tabela} (ID, NOME, NOME_CIENTIFICO, CODIGO_SIAGRO_1) VALUES (${id}, ${nome}, ${cient}, ${siagro ?? 'NULL'})`;
    }));
    return itens.length;
  };
  const culturas = await upsertNomes('REC_NOVOREC_CULTURAS', 'culturas');
  const pragas = await upsertNomes('REC_NOVOREC_PRAGAS', 'problemas');

  // Código CIDASC pelo nome (culturas) e pelo nome científico (pragas)
  await executarScript([
    `UPDATE REC_NOVOREC_CULTURAS A SET ID_CIDASC = B.IDNOMECOMUMESPECIEVEGETAL FROM REC_NOVOREC_CULTURAS A
       INNER JOIN REC_CULTURAS_CIDASC B ON UPPER(B.NMCOMUMESPECIEVEGERAL) = UPPER(A.NOME)`,
    `UPDATE REC_NOVOREC_PRAGAS A SET ID_CIDASC = B.IDPRAGA FROM REC_NOVOREC_PRAGAS A
       INNER JOIN REC_PRAGAS_CIDASC B ON UPPER(B.NMCIENTIFICOPRAGA) = UPPER(A.NOME_CIENTIFICO)`,
  ]);

  await acertarTabelas();
  return { defensivos: produtos.length, culturas, pragas };
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

/**
 * "Buscar Tratamentos" do defensivo (ufrmGerarDados para um produto): pragas e culturas
 * do produto, e o tratamento de cada praga que também é da cultura.
 */
export async function buscarTratamentosDoProduto(idProduto: number): Promise<number> {
  const token = await tokenNovoRec();
  if (!token) throw new BmapiError('Sem token do Novo Receituário em rec_config (tokenId_novorec).');
  await syncCulturasDoProduto(idProduto, token);
  const culturas = await consultar('SELECT ID_CULTURA id FROM REC_NOVOREC_CULTURAS_PRODUTOS WHERE ID_PRODUTO = :p', { p: idProduto });
  await syncPragasDoProduto(idProduto, token);
  let total = 0;
  for (const c of culturas) {
    const idCultura = Number(c.id);
    await syncPragasDaCultura(idCultura, token);
    await relacionar(idProduto, idCultura);
    const pragas = await consultar(
      'SELECT ID_PRAGA id FROM REC_NOVOREC_PRAGAS_CULTURA_PRODUTO WHERE ID_PRODUTO = :p AND ID_CULTURA = :c',
      { p: idProduto, c: idCultura },
    );
    for (const g of pragas) {
      await syncTratamento(idProduto, idCultura, Number(g.id), token);
      total++;
      await new Promise((r) => setTimeout(r, 500)); // mesmo intervalo do Delphi, para não sobrecarregar a API
    }
  }
  // Força o refresh na próxima receita, como o Delphi faz ao voltar do Gerar Dados
  await marcarConsulta('REC_NOVOREC_DEFENSIVOS', idProduto, null);
  return total;
}
