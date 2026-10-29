import { Router } from 'express';
import { config } from './config.js';
import {
  consultar, consultarUm, executar, executarScript, lerMemo, BmapiError, sqlTexto, sqlNumero, sqlInteiro, sqlData,
  hojeISO, agoraISO,
} from './bmapi.js';
import { rota, texto, idParam, busca } from './util.js';
import { lerRecConfig } from './cadastros.js';
import { SQL_TRATAMENTO, mapearTratamento } from './compendio.js';
import { syncCulturasDoProduto, syncProdutosDaCultura, syncPragas, syncTratamento } from './novorec.js';
import {
  doseValida, numeroReceitaFull, chavePdf, tiposAplicacaoLiberados,
} from '../shared/receita.js';

/**
 * Receitas (ufrmReceitas): lista, cabeçalho, assistente do produto (defensivo → cultura →
 * praga → tratamento → dose), numeração, cancelamento e dados para impressão.
 */

const s = (v: unknown) => String(v ?? '').trim();
const n = (v: unknown) => Number(v || 0);

/** Compêndio online liberado: token + compendio_online <> 'N' */
async function tokenOnline(): Promise<string | null> {
  const c = await lerRecConfig();
  return c.tokenNovoRec && c.compendioOnline ? c.tokenNovoRec : null;
}

/** Consulta online desatualizada (mais de 1 dia, como no Delphi) */
function vencido(datahora: unknown): boolean {
  if (!datahora) return true;
  return String(datahora).replace('T', ' ').slice(0, 19) < agoraISO().replace(/^(\d{4}-\d{2}-\d{2})/, hojeISO(-1));
}

async function carregarReceita(id: number) {
  const r = await consultarUm(
    `SELECT A.*, P.NOME prof_nome, C.NOME cli_nome
       FROM REC_RECEITAS A
       LEFT JOIN REC_PROFISSIONAIS P ON P.ID = A.ID_PROF
       LEFT JOIN PESSOAS C ON C.ID = A.ID_CLIENTE
      WHERE A.ID = :id`,
    { id },
  );
  if (!r) throw new BmapiError('Receita não encontrada.', 404);
  return r;
}

function mapearReceita(r: Record<string, any>) {
  return {
    id: n(r.id),
    idArt: n(r.id_art),
    numeroArt: s(r.numero_art),
    idProf: n(r.id_prof),
    profissional: s(r.prof_nome),
    idCliente: n(r.id_cliente),
    cliente: s(r.cli_nome),
    idCultura: n(r.id_cultura),
    culturaNome: s(r.cultura_nome),
    numeroReceita: n(r.numero_receita),
    numeroReceitaFull: s(r.numero_receita_full),
    numeroReceitaCidasc: n(r.numero_receita_cidasc),
    nfSerie: s(r.nf_serie),
    nfNumero: n(r.nf_numero),
    data: r.data ? String(r.data).slice(0, 10) : '',
    localAplicacao: s(r.local_aplicacao),
    recomendacoes: s(r.recomendacoes),
    obs: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => s(r[`obs${i}`])),
    impressa: s(r.status_imp) === 'I',
    cancelada: s(r.cancelado) === 'S',
    canceladaCidasc: s(r.cancelado_cidasc) === 'S',
    idLocalidade: n(r.id_localidade),
    idTipoLogradouro: n(r.id_tipo_logradouro),
    altitude: n(r.altitude),
    latitude: n(r.latitude),
    longitude: n(r.longitude),
    chavePdf: s(r.chave_ftp),
  };
}

const SQL_PRODUTOS = `
  SELECT A.ID id, A.ID_DEFENSIVO id_def, A.ID_NOVOREC id_novorec, A.ID_DEFENSIVO_CIDASC id_def_cidasc,
         A.ID_CULTURA id_cultura, A.ID_PRAGA id_praga, A.ID_TRATAMENTO id_tratamento, A.DOSE dose, A.DOSE_UN dose_un,
         A.QTDADE qtdade, A.QTDADE_UN qtdade_un, A.CALDA_HA calda, A.NR_APLIC nr_aplic, A.AREA_HA area, A.AREA_UN area_un,
         A.CARENCIA carencia, A.APLICACAO_LIBERADO aplicacao_liberado, CAST(A.APLICACAO AS VARCHAR(250)) aplicacao,
         CAST(A.DIAGNOSTICO AS VARCHAR(512)) diagnostico,
         D.NOME defensivo, C.NOME cultura, G.NOME praga, G.NOME_CIENTIFICO praga_cientifico
    FROM REC_RECEITAS_PRO A
    LEFT JOIN REC_NOVOREC_DEFENSIVOS D ON D.ID = A.ID_NOVOREC
    LEFT JOIN REC_NOVOREC_CULTURAS C ON C.ID = A.ID_CULTURA
    LEFT JOIN REC_NOVOREC_PRAGAS G ON G.ID = A.ID_PRAGA`;

function mapearProduto(p: Record<string, any>) {
  return {
    id: n(p.id),
    idDefensivo: n(p.id_def),
    idNovoRec: n(p.id_novorec),
    idDefensivoCidasc: n(p.id_def_cidasc),
    idCultura: n(p.id_cultura),
    idPraga: n(p.id_praga),
    idTratamento: n(p.id_tratamento),
    defensivo: s(p.defensivo),
    cultura: s(p.cultura),
    praga: s(p.praga),
    pragaCientifico: s(p.praga_cientifico),
    dose: n(p.dose),
    doseUn: s(p.dose_un),
    qtdade: n(p.qtdade),
    qtdadeUn: s(p.qtdade_un),
    calda: n(p.calda),
    nrAplic: n(p.nr_aplic),
    area: n(p.area),
    areaUn: s(p.area_un),
    carencia: s(p.carencia),
    aplicacaoLiberado: s(p.aplicacao_liberado),
    aplicacao: s(p.aplicacao),
    diagnostico: s(p.diagnostico),
  };
}

async function produtosDaReceita(id: number) {
  return (await consultar(`${SQL_PRODUTOS} WHERE A.ID_RECEITA = :id ORDER BY A.ID`, { id })).map(mapearProduto);
}

/** rec_receitas.status_imp = NULL: a receita alterada precisa ser impressa de novo */
const marcarAlterada = (id: number) => executar('UPDATE REC_RECEITAS SET STATUS_IMP = NULL WHERE ID = :id', { id });

/**
 * Numeração (btnGerarNumeroReceitaClick): soma 1 na ART e na sequência anual do profissional.
 * ponytail: sem o LockTable do Delphi, duas receitas gravadas no mesmo instante na mesma ART
 * podem disputar o contador; se virar problema, serializar por ART no servidor.
 */
async function gerarNumero(id: number) {
  const r = await carregarReceita(id);
  if (n(r.numero_receita) > 0) return;
  const ano = Number(hojeISO().slice(0, 4));
  await executarScript([
    `UPDATE REC_ARTS SET ULTIMA_RECEITA = IF(ULTIMA_RECEITA = NULL, 0, ULTIMA_RECEITA) + 1 WHERE ID = ${sqlInteiro(r.id_art)}`,
    `UPDATE REC_PROFISSIONAIS SET ULTIMA_RECEITA = IF(ANO_ATUAL = ${ano}, IF(ULTIMA_RECEITA = NULL, 0, ULTIMA_RECEITA), 0) + 1,
            ANO_ATUAL = ${ano} WHERE ID = ${sqlInteiro(r.id_prof)}`,
  ]);
  const art = await consultarUm('SELECT ULTIMA_RECEITA u FROM REC_ARTS WHERE ID = :id', { id: r.id_art });
  const prof = await consultarUm('SELECT ULTIMA_RECEITA u, CIDASC_CODIGO c FROM REC_PROFISSIONAIS WHERE ID = :id', { id: r.id_prof });
  await executar('UPDATE REC_RECEITAS SET NUMERO_RECEITA = :nr, NUMERO_RECEITA_FULL = :full WHERE ID = :id', {
    nr: n(art?.u),
    full: numeroReceitaFull(ano, s(prof?.c), n(prof?.u)),
    id,
  });
}

export function createReceitasRouter() {
  const r = Router();

  // ======================= Apoio da tela =======================
  r.get('/receitas/apoio', rota(async (_req, res) => {
    const [arts, profs, tipos, culturas, unDerivadas, unCidasc, restricoes, cfg] = await Promise.all([
      consultar(`SELECT A.ID id, A.NUMERO_ART numero, A.ID_PROF id_prof, P.NOME prof
                   FROM REC_ARTS A LEFT JOIN REC_PROFISSIONAIS P ON P.ID = A.ID_PROF
                  WHERE A.STATUS = 'A' AND (A.ID_EMPRESA = :emp OR A.ID_EMPRESA IS NULL) ORDER BY A.NUMERO_ART`, { emp: config.idEmpresa }),
      consultar('SELECT ID id, NOME nome FROM REC_PROFISSIONAIS ORDER BY NOME'),
      consultar('SELECT ID id, DESCRICAO descricao FROM PESSOASTIPOSLOGRADOUROS ORDER BY DESCRICAO'),
      consultar('SELECT ID id, NOME nome, ID_CIDASC id_cidasc FROM REC_NOVOREC_CULTURAS ORDER BY NOME'),
      consultar('SELECT ID_CIDASC id, UN un, DESCRICAO descricao, ID_CIDASC_UN_EMPREGADA empregada FROM PRODUTOSUNDERIVADAS WHERE ID_CIDASC > 0 ORDER BY UN'),
      consultar('SELECT ID id, SGUNIDADEMEDIDA sigla, DSUNIDADEMEDIDA descricao FROM REC_UN_CIDASC ORDER BY SGUNIDADEMEDIDA'),
      consultar('SELECT ID id, DESCRICAO descricao FROM REC_NOVOREC_RESTRICOES ORDER BY ID'),
      lerRecConfig(),
    ]);
    res.json({
      arts: arts.map((a) => ({ id: n(a.id), numero: s(a.numero), idProf: n(a.id_prof), profissional: s(a.prof) })),
      profissionais: profs.map((p) => ({ id: n(p.id), nome: s(p.nome) })),
      tiposLogradouro: tipos.map((t) => ({ id: n(t.id), descricao: s(t.descricao) })),
      culturas: culturas.map((c) => ({ id: n(c.id), nome: s(c.nome), idCidasc: n(c.id_cidasc) })),
      unDerivadas: unDerivadas.map((u) => ({ id: n(u.id), un: s(u.un), descricao: s(u.descricao), idEmpregada: n(u.empregada) })),
      unCidasc: unCidasc.map((u) => ({ id: n(u.id), sigla: s(u.sigla), descricao: s(u.descricao) })),
      tiposAplicacao: restricoes.map((t) => ({ id: n(t.id), descricao: s(t.descricao) })),
      compendioOnline: Boolean(cfg.tokenNovoRec && cfg.compendioOnline),
      receitasLiberadas: !cfg.usaSistemasTerceiros,
    });
  }));

  /** Pesquisa de cliente (ufrmPesqCli): todas as pessoas ativas */
  r.get('/receitas/clientes', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT ID id, NOME nome, CIDADE cidade, FONE1 fone, CPFCNPJ doc FROM PESSOAS
        WHERE ATIVO = 'S' AND UPPER(NOME) LIKE :q ORDER BY NOME TOP 50`,
      { q: busca(req.query.q) },
    );
    res.json(rows.map((c) => ({ id: n(c.id), nome: s(c.nome), cidade: s(c.cidade), fone: s(c.fone), cpfCnpj: s(c.doc).replace(/\D/g, '') })));
  }));

  /** Endereço do cliente, localidades do município e última geolocalização usada */
  r.get('/receitas/clientes/:id', rota(async (req, res) => {
    const id = idParam(req);
    const c = await consultarUm(
      `SELECT ID id, NOME nome, ENDERECO endereco, NUMERO numero, COMPLEMENTO complemento, BAIRRO bairro, CIDADE cidade,
              UF uf, CEP cep, COD_CIDADE ibge, ID_LOCALIDADE id_localidade, ID_TIPOLOGRADOURO id_tipo, I_PRURAL iprural
         FROM PESSOAS WHERE ID = :id`,
      { id },
    );
    if (!c) throw new BmapiError('Cliente não encontrado.', 404);
    const localidades = await consultar(
      `SELECT ID id, MUNICIPIO municipio, LOCALIDADE localidade FROM PESSOASLOCALIDADESRECEITA
        WHERE CODIGO_IBGE = :ibge ORDER BY MUNICIPIO, LOCALIDADE`,
      { ibge: s(c.ibge) },
    );
    const geo = await consultarUm(
      'SELECT ID id, ALTITUDE alt, LATITUDE lat, LONGITUDE lon FROM REC_RECEITAS WHERE ID_CLIENTE = :id AND LATITUDE <> 0 ORDER BY ID DESC TOP 1',
      { id },
    );
    const partes = [s(c.endereco), s(c.numero), s(c.complemento), s(c.bairro)].filter(Boolean).join(' ');
    res.json({
      id: n(c.id),
      nome: s(c.nome),
      localAplicacao: [partes, s(c.cidade), s(c.uf)].filter(Boolean).join(', ').slice(0, 80),
      idLocalidade: n(c.id_localidade),
      idTipoLogradouro: n(c.id_tipo),
      localidades: localidades.map((l) => ({ id: n(l.id), descricao: `${s(l.localidade)} (${s(l.municipio)})` })),
      ultimaGeo: geo ? { altitude: n(geo.alt), latitude: n(geo.lat), longitude: n(geo.lon) } : null,
    });
  }));

  /** Altitude pela API open-elevation (a mesma do Delphi) */
  r.get('/receitas/altitude', rota(async (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new BmapiError('Coordenadas inválidas.');
    try {
      const resp = await fetch(`https://api.open-elevation.com/api/v1/lookup?locations=${lat.toFixed(6)},${lon.toFixed(6)}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const data: any = await resp.json();
      res.json({ altitude: Math.round(Number(data?.results?.[0]?.elevation) || 0) });
    } catch {
      throw new BmapiError('Não foi possível consultar a altitude agora. Informe manualmente.', 503);
    }
  }));

  // ======================= Lista e cabeçalho =======================
  r.get('/receitas', rota(async (req, res) => {
    // Como no Delphi, a lista mostra as receitas de todas as empresas da base
    const filtros: string[] = [];
    const params: Record<string, any> = {};
    if (Number(req.query.art)) { filtros.push('A.ID_ART = :art'); params.art = Number(req.query.art); }
    if (Number(req.query.cliente)) { filtros.push('A.ID_CLIENTE = :cli'); params.cli = Number(req.query.cliente); }
    if (req.query.d1) { filtros.push(`A.DATA >= ${sqlData(req.query.d1)}`); }
    if (req.query.d2) { filtros.push(`A.DATA <= ${sqlData(req.query.d2)}`); }
    const rows = await consultar(
      `SELECT A.*, P.NOME prof_nome, C.NOME cli_nome
         FROM REC_RECEITAS A
         LEFT JOIN REC_PROFISSIONAIS P ON P.ID = A.ID_PROF
         LEFT JOIN PESSOAS C ON C.ID = A.ID_CLIENTE
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY A.DATA DESC, A.ID DESC TOP 501`,
      params,
    );
    res.json({ truncated: rows.length > 500, receitas: rows.slice(0, 500).map(mapearReceita) });
  }));

  r.get('/receitas/:id', rota(async (req, res) => {
    const id = idParam(req);
    res.json({ ...mapearReceita(await carregarReceita(id)), produtos: await produtosDaReceita(id) });
  }));

  /** Validação e gravação do cabeçalho (RzButton2Click) */
  async function salvarCabecalho(id: number, b: any): Promise<number> {
    const erros: string[] = [];
    const idArt = Math.trunc(Number(b.idArt) || 0);
    const idCliente = Math.trunc(Number(b.idCliente) || 0);
    const idCultura = Math.trunc(Number(b.idCultura) || 0);
    const idLocalidade = Math.trunc(Number(b.idLocalidade) || 0);
    const idTipo = Math.trunc(Number(b.idTipoLogradouro) || 0);
    const local = texto(b.localAplicacao, 80);
    const [alt, lat, lon] = [Number(b.altitude) || 0, Number(b.latitude) || 0, Number(b.longitude) || 0];
    if (!idArt) erros.push('ART inválida!');
    if (!idCliente) erros.push('Cliente inválido!');
    if (!local) erros.push('Local da aplicação inválido!');
    if (!idCultura) erros.push('Cultura inválida!');
    if (!alt || !lat || !lon) erros.push('Altitude, latitude e longitude são obrigatórias!');
    if (!idTipo) erros.push('Tipo de logradouro inválido!');
    if (!idLocalidade) erros.push('Localidade inválida!');
    if (erros.length) throw new BmapiError(erros.join(' '));

    const art = await consultarUm(
      `SELECT ID id, NUMERO_ART numero, ID_PROF id_prof, QTDADE_RECEITAS limite FROM REC_ARTS
        WHERE ID = :id AND STATUS = 'A' AND (ID_EMPRESA = :emp OR ID_EMPRESA IS NULL)`,
      { id: idArt, emp: config.idEmpresa },
    );
    if (!art) throw new BmapiError('ART pode ter sido desativada. Verifique!');
    if (!n(art.id_prof)) throw new BmapiError('A ART não tem profissional. Acerte no cadastro de ARTs.');
    const cultura = await consultarUm('SELECT NOME nome, ID_CIDASC cidasc FROM REC_NOVOREC_CULTURAS WHERE ID = :id', { id: idCultura });
    if (!n(cultura?.cidasc)) throw new BmapiError('ID da cultura (CIDASC) inválido!');
    const cli = await consultarUm(
      'SELECT COD_CIDADE ibge, ENDERECO e, NUMERO nr, COMPLEMENTO comp, CEP cep FROM PESSOAS WHERE ID = :id',
      { id: idCliente },
    );
    if (!cli) throw new BmapiError('Cliente inválido!');

    let anterior: Record<string, any> | null = null;
    if (id) {
      anterior = await carregarReceita(id);
      if (n(anterior.numero_receita_cidasc)) throw new BmapiError('Receita já foi enviada para CIDASC. Não pode ser editada!');
      if (s(anterior.cancelado) === 'S') throw new BmapiError('Receita cancelada não pode ser editada.');
    }
    // Limite de receitas da ART (a própria receita não conta quando é edição na mesma ART)
    const usadas = await consultarUm('SELECT COUNT(*) q FROM REC_RECEITAS WHERE ID_ART = :art AND ID <> :id', { art: idArt, id });
    if (n(art.limite) <= n(usadas?.q)) throw new BmapiError('Número máximo de receitas da ART atingido!');

    const campos: Record<string, string> = {
      ID_EMP: sqlInteiro(config.idEmpresa),
      ID_ART: sqlInteiro(idArt),
      NUMERO_ART: sqlTexto(s(art.numero), 15),
      ID_PROF: sqlInteiro(art.id_prof),
      ID_CLIENTE: sqlInteiro(idCliente),
      ID_LOCALIDADE: sqlInteiro(idLocalidade),
      ID_TIPO_LOGRADOURO: sqlInteiro(idTipo),
      CODIGO_IBGE: sqlTexto(s(cli.ibge), 7),
      NOME_PROPRIEDADE: sqlTexto(local, 60),
      LOGRADOURO: sqlTexto(s(cli.e), 60),
      NUMERO_LOGRADOURO: sqlTexto(s(cli.nr), 10),
      COMPLEMENTO_LOGRADOURO: sqlTexto(s(cli.comp), 60),
      CEP_LOGRADOURO: sqlTexto(s(cli.cep), 9),
      ID_CULTURA: sqlInteiro(idCultura),
      ID_CULTURA_CIDASC: sqlInteiro(cultura!.cidasc),
      CULTURA_NOME: sqlTexto(s(cultura!.nome), 80),
      DATA: sqlData(hojeISO()),
      LOCAL_APLICACAO: sqlTexto(local, 80),
      RECOMENDACOES: sqlTexto(texto(b.recomendacoes, 120), 120),
      STATUS_IMP: 'NULL',
      ALTITUDE: sqlNumero(alt),
      LATITUDE: sqlNumero(lat),
      LONGITUDE: sqlNumero(lon),
    };
    for (let i = 1; i <= 8; i++) campos[`OBS${i}`] = sqlTexto(texto(b.obs?.[i - 1], 120), 120);
    // Mudou de ART: a numeração é refeita
    if (!anterior || n(anterior.id_art) !== idArt) campos.NUMERO_RECEITA = '0';

    if (anterior) {
      await executar(`UPDATE REC_RECEITAS SET ${Object.entries(campos).map(([k, v]) => `${k} = ${v}`).join(', ')} WHERE ID = ${sqlInteiro(id)}`);
    } else {
      campos.STATUS_IMP = "'N'";
      campos.CANCELADO = "'N'";
      await executar(`INSERT INTO REC_RECEITAS (${Object.keys(campos).join(', ')}) VALUES (${Object.values(campos).join(', ')})`);
      const nova = await consultarUm(
        'SELECT ID id FROM REC_RECEITAS WHERE ID_EMP = :emp AND ID_ART = :art AND ID_CLIENTE = :cli ORDER BY ID DESC TOP 1',
        { emp: config.idEmpresa, art: idArt, cli: idCliente },
      );
      id = n(nova?.id);
      if (!id) throw new BmapiError('Falha ao gravar a receita.');
    }
    // Só depois de validar: guarda localidade e tipo de logradouro no cadastro do cliente
    await executar('UPDATE PESSOAS SET ID_LOCALIDADE = :l, ID_TIPOLOGRADOURO = :t WHERE ID = :id', {
      l: idLocalidade, t: idTipo, id: idCliente,
    });
    await gerarNumero(id);
    return id;
  }

  /** Inclusão: cabeçalho e produtos chegam juntos; os produtos são conferidos antes de criar (e numerar) a receita */
  r.post('/receitas', rota(async (req, res) => {
    const b = req.body || {};
    const itens: any[] = Array.isArray(b.itens) ? b.itens : [];
    if (itens.length > 10) throw new BmapiError('O sistema aceita no máximo 10 produtos por receita.');
    const produtos: Record<string, string>[] = [];
    for (const [i, item] of itens.entries()) {
      try {
        produtos.push(await montarProduto(item));
      } catch (e: any) {
        throw new BmapiError(`Produto ${i + 1}: ${e.message}`);
      }
    }
    const id = await salvarCabecalho(0, b);
    for (const p of produtos) await gravarProduto(id, 0, p);
    res.json({ id });
  }));

  r.put('/receitas/:id', rota(async (req, res) => {
    res.json({ id: await salvarCabecalho(idParam(req), req.body || {}) });
  }));

  /** Cancelar ou excluir (RzButton1Click): só a última da ART, ainda não impressa, é apagada */
  r.delete('/receitas/:id', rota(async (req, res) => {
    const id = idParam(req);
    const rec = await carregarReceita(id);
    if (s(rec.cancelado) === 'S') throw new BmapiError('Receita já está cancelada!');
    if (n(rec.numero_receita_cidasc) > 0 && s(rec.cancelado_cidasc) !== 'S') {
      throw new BmapiError('Receita ainda não cancelada na CIDASC!');
    }
    const art = await consultarUm('SELECT ULTIMA_RECEITA u FROM REC_ARTS WHERE ID = :id', { id: rec.id_art });
    const numero = n(rec.numero_receita);
    if ((numero > 0 && numero !== n(art?.u)) || s(rec.status_imp) === 'I') {
      await executar("UPDATE REC_RECEITAS SET CANCELADO = 'S' WHERE ID = :id", { id });
      return res.json({ acao: 'cancelada', mensagem: 'Receita já com número. Foi CANCELADA!' });
    }
    await executarScript([
      ...(numero > 0 ? [`UPDATE REC_ARTS SET ULTIMA_RECEITA = ULTIMA_RECEITA - 1 WHERE ID = ${sqlInteiro(rec.id_art)}`] : []),
      `DELETE FROM REC_RECEITAS_PRO WHERE ID_RECEITA = ${sqlInteiro(id)}`,
      `DELETE FROM REC_RECEITAS WHERE ID = ${sqlInteiro(id)}`,
    ]);
    res.json({ acao: 'excluida', mensagem: 'Receita EXCLUÍDA da base de dados!' });
  }));

  // ======================= Assistente do produto =======================
  /** 1. Defensivos com uso na cultura da receita (ou em culturas genéricas, id CIDASC 132) */
  r.get('/receitas/:id/assistente/defensivos', rota(async (req, res) => {
    // Receita ainda não gravada (id 0): a cultura vem na consulta
    const id = Number(req.params.id) || 0;
    const idCultura = id ? n((await carregarReceita(id)).id_cultura) : Number(req.query.cultura) || 0;
    const token = await tokenOnline();
    if (token) {
      const c = await consultarUm('SELECT DATAHORA_API d FROM REC_NOVOREC_CULTURAS WHERE ID = :id', { id: idCultura });
      if (req.query.forcar === 'S' || vencido(c?.d)) await syncProdutosDaCultura(idCultura, token);
    }
    const somenteBm = req.query.bm !== 'N';
    const rows = await consultar(
      `SELECT A.ID id, A.NOME nome, A.REGISTRO_MAPA mapa, B.ID id_def, B.ID_CIDASC id_cidasc, C.ID_BM id_bm,
              D.DESCRICAO descricao_bm, D.UNVENDA un, E.REFERENCIA referencia,
              F.ESTOQUE - F.RESV_DAV - F.RESV_OS - F.RESV_PV - F.RESV_EF estoque
         FROM REC_NOVOREC_DEFENSIVOS A
         LEFT JOIN REC_DEFENSIVOS B ON B.ID_NOVOREC = A.ID
         LEFT JOIN REC_DEFENSIVOS_BM C ON C.ID_DEF = B.ID
         LEFT JOIN PRODUTOSPRINCIPAL D ON D.ID = C.ID_BM
         LEFT JOIN PRODUTOSREFERENCIA E ON E.ID_PRODUTO = D.ID
         LEFT JOIN PRODUTOSREFEMPRESA F ON F.ID_REF = E.ID AND F.ID_EMPRESA = :emp
        WHERE UPPER(A.NOME) LIKE :q ${somenteBm ? 'AND C.ID_BM IS NOT NULL' : ''}
          AND A.ID IN (SELECT AA.ID_PRODUTO FROM REC_NOVOREC_CULTURAS_PRODUTOS AA
                         LEFT JOIN REC_NOVOREC_CULTURAS BB ON BB.ID = AA.ID_CULTURA
                        WHERE AA.ID_CULTURA = :cult OR BB.ID_CIDASC = 132)
        ORDER BY A.NOME TOP 300`,
      { emp: config.idEmpresa, q: busca(req.query.q), cult: idCultura },
    );
    res.json(rows.map((d) => ({
      id: n(d.id), nome: s(d.nome), registroMapa: s(d.mapa), idDef: n(d.id_def), idCidasc: n(d.id_cidasc),
      idBm: n(d.id_bm), descricaoBm: s(d.descricao_bm), un: s(d.un), referencia: s(d.referencia), estoque: n(d.estoque),
    })));
  }));

  /** 2. Culturas do defensivo */
  r.get('/receitas/assistente/culturas', rota(async (req, res) => {
    const idProduto = Number(req.query.produto) || 0;
    const token = await tokenOnline();
    let atualizou = false;
    if (token) {
      const d = await consultarUm('SELECT DATAHORA_API d FROM REC_NOVOREC_DEFENSIVOS WHERE ID = :id', { id: idProduto });
      if (req.query.forcar === 'S' || vencido(d?.d)) {
        await syncCulturasDoProduto(idProduto, token);
        atualizou = true;
      }
    }
    const rows = await consultar(
      `SELECT A.ID_CULTURA id, B.NOME nome, B.ID_CIDASC id_cidasc FROM REC_NOVOREC_CULTURAS_PRODUTOS A
         LEFT JOIN REC_NOVOREC_CULTURAS B ON B.ID = A.ID_CULTURA
        WHERE A.ID_PRODUTO = :p ORDER BY B.NOME`,
      { p: idProduto },
    );
    res.json({ atualizou, culturas: rows.map((c) => ({ id: n(c.id), nome: s(c.nome), idCidasc: n(c.id_cidasc) })) });
  }));

  /** 3. Pragas do defensivo na cultura, só as que têm tratamento */
  r.get('/receitas/assistente/pragas', rota(async (req, res) => {
    const idProduto = Number(req.query.produto) || 0;
    const idCultura = Number(req.query.cultura) || 0;
    const token = req.query.atualizar === 'S' ? await tokenOnline() : null;
    if (token) await syncPragas(idProduto, idCultura, token);
    const pragas = await consultar(
      `SELECT A.ID_PRAGA id, B.NOME nome, B.NOME_CIENTIFICO cientifico, B.ID_CIDASC id_cidasc
         FROM REC_NOVOREC_PRAGAS_CULTURA_PRODUTO A
         LEFT JOIN REC_NOVOREC_PRAGAS B ON B.ID = A.ID_PRAGA
        WHERE A.ID_PRODUTO = :p AND A.ID_CULTURA = :c ORDER BY B.NOME`,
      { p: idProduto, c: idCultura },
    );
    if (token) {
      for (const g of pragas) {
        await syncTratamento(idProduto, idCultura, n(g.id), token);
        await new Promise((ok) => setTimeout(ok, 500));
      }
    }
    const contagem = await consultar(
      `SELECT ID_PRAGA id, COUNT(*) q FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO
        WHERE ID_PRODUTO = :p AND ID_CULTURA = :c GROUP BY ID_PRAGA`,
      { p: idProduto, c: idCultura },
    );
    const qtd = new Map(contagem.map((c) => [n(c.id), n(c.q)]));
    res.json(pragas
      .map((g) => ({ id: n(g.id), nome: s(g.nome), nomeCientifico: s(g.cientifico), idCidasc: n(g.id_cidasc), tratamentos: qtd.get(n(g.id)) || 0 }))
      .filter((g) => g.tratamentos > 0));
  }));

  /** 4. Tratamentos (dosagens) da praga */
  r.get('/receitas/assistente/tratamentos', rota(async (req, res) => {
    const [p, c, g] = [Number(req.query.produto) || 0, Number(req.query.cultura) || 0, Number(req.query.praga) || 0];
    const token = req.query.atualizar === 'S' ? await tokenOnline() : null;
    if (token) await syncTratamento(p, c, g, token);
    const rows = await consultar(
      `${SQL_TRATAMENTO} WHERE A.ID_PRODUTO = :p AND A.ID_CULTURA = :c AND A.ID_PRAGA = :g ORDER BY A.SEQ`,
      { p, c, g },
    );
    res.json(rows.map(mapearTratamento));
  }));

  /** Equipamento de aplicação é o único texto do tratamento editável na receita */
  r.put('/receitas/assistente/tratamentos/:id/equipamento', rota(async (req, res) => {
    await executar(`UPDATE REC_NOVOREC_CULTURA_PRAGA_PRODUTO SET EQUIP_APLICACAO = ${sqlTexto(String(req.body?.texto ?? ''))}
                     WHERE ID = ${sqlInteiro(idParam(req))}`);
    res.json({ ok: true });
  }));

  // ======================= Produtos da receita =======================
  /** 5. Finalizar: confere tudo de novo no servidor (btn_avancar_finalizarClick) e grava */
  async function salvarProduto(idReceita: number, idItem: number, b: any) {
    const rec = await carregarReceita(idReceita);
    if (n(rec.numero_receita_cidasc)) throw new BmapiError('Receita já foi enviada para CIDASC. Não pode ser alterada!');
    if (idItem && s(rec.status_imp) === 'I') throw new BmapiError('Receita já impressa: o produto não pode ser editado.');
    if (!idItem) {
      const q = await consultarUm('SELECT COUNT(*) q FROM REC_RECEITAS_PRO WHERE ID_RECEITA = :id', { id: idReceita });
      if (n(q?.q) >= 10) throw new BmapiError('O sistema aceita no máximo 10 produtos por receita.');
    }
    await gravarProduto(idReceita, idItem, await montarProduto(b));
  }

  async function gravarProduto(idReceita: number, idItem: number, campos: Record<string, string>) {
    if (idItem) {
      await executar(`UPDATE REC_RECEITAS_PRO SET ${Object.entries(campos).map(([k, v]) => `${k} = ${v}`).join(', ')}
                       WHERE ID = ${sqlInteiro(idItem)} AND ID_RECEITA = ${sqlInteiro(idReceita)}`);
    } else {
      await executar(`INSERT INTO REC_RECEITAS_PRO (ID_RECEITA, ${Object.keys(campos).join(', ')})
                      VALUES (${sqlInteiro(idReceita)}, ${Object.values(campos).join(', ')})`);
    }
    await marcarAlterada(idReceita);
  }

  /** Confere o produto (tratamento, dose, unidades) e devolve os campos de REC_RECEITAS_PRO */
  async function montarProduto(b: any): Promise<Record<string, string>> {
    const trat = await consultarUm(`${SQL_TRATAMENTO} WHERE A.ID = :id`, { id: Math.trunc(Number(b.idTratamento) || 0) });
    if (!trat) throw new BmapiError('Tratamento não encontrado. Refaça a escolha do produto.');
    const t = mapearTratamento(trat);
    const def = await consultarUm(
      'SELECT B.ID id_def, B.ID_CIDASC id_cidasc FROM REC_NOVOREC_DEFENSIVOS A LEFT JOIN REC_DEFENSIVOS B ON B.ID_NOVOREC = A.ID WHERE A.ID = :id',
      { id: t.idProduto },
    );
    const cult = await consultarUm('SELECT ID_CIDASC c FROM REC_NOVOREC_CULTURAS WHERE ID = :id', { id: t.idCultura });
    const praga = await consultarUm('SELECT ID_CIDASC c FROM REC_NOVOREC_PRAGAS WHERE ID = :id', { id: t.idPraga });

    const nrAplic = Math.trunc(Number(b.nrAplic) || 0);
    const maxAplic = b.liberarAplicacoes ? 99 : t.maximoAplicacoes || 99;
    const dose = Number(b.dose) || 0;
    const qtd = Number(b.qtdade) || 0;
    const area = Number(b.area) || 0;
    const unDose = await consultarUm('SELECT UN un FROM PRODUTOSUNDERIVADAS WHERE ID_CIDASC = :id TOP 1', { id: Number(b.idUnDose) || 0 });
    const unQtd = await consultarUm('SELECT SGUNIDADEMEDIDA s FROM REC_UN_CIDASC WHERE ID = :id', { id: Number(b.idUnQtd) || 0 });
    const unArea = await consultarUm('SELECT SGUNIDADEMEDIDA s FROM REC_UN_CIDASC WHERE ID = :id', { id: Number(b.idUnArea) || 0 });

    if (nrAplic < 1 || nrAplic > maxAplic) throw new BmapiError('Número de aplicações inválido!');
    if (!unDose) throw new BmapiError('UN da dose (CIDASC) inválida!');
    if (!doseValida(dose, s(unDose.un), t.doseMinima, t.doseMaxima, t.unidadeAplicacao)) throw new BmapiError('Dose inválida!');
    if (!(qtd > 0)) throw new BmapiError('Quantidade a adquirir inválida!');
    if (!(area > 0)) throw new BmapiError('Área inválida!');
    if (!unQtd) throw new BmapiError('UN da qtd. a adquirir (CIDASC) inválida!');
    if (!n(praga?.c)) throw new BmapiError('ID (CIDASC) da praga inválida/zerada!');

    const campos: Record<string, string> = {
      ID_NFPRODUTOS: '0',
      ID_PRODUTO: '0',
      ID_INTEGRACAO_DEF: "''",
      ID_NOVOREC: sqlInteiro(t.idProduto),
      ID_DEFENSIVO: sqlInteiro(n(def?.id_def)),
      ID_DEFENSIVO_CIDASC: sqlInteiro(n(def?.id_cidasc)),
      ID_CULTURA: sqlInteiro(t.idCultura),
      ID_CULTURA_CIDASC: sqlInteiro(n(cult?.c)),
      ID_PRAGA: sqlInteiro(t.idPraga),
      ID_PRAGA_CIDASC: sqlInteiro(n(praga?.c)),
      ID_TRATAMENTO: sqlInteiro(t.id),
      DOSE: sqlNumero(dose),
      DOSE_UN: sqlTexto(s(unDose.un), 25),
      ID_DOSE_UN_CIDASC: sqlInteiro(Number(b.idUnDose)),
      QTDADE: sqlNumero(qtd),
      QTDADE_UN: sqlTexto(s(unQtd.s), 5),
      ID_UN_CIDASC: sqlInteiro(Number(b.idUnQtd)),
      CALDA_HA: sqlNumero(Number(b.calda) || 0),
      NR_APLIC: sqlInteiro(nrAplic),
      AREA_HA: sqlNumero(area),
      AREA_UN: sqlTexto(s(unArea?.s || 'HA'), 3),
      ID_UN_AREA_CIDASC: sqlInteiro(Number(b.idUnArea) || 0),
      CARENCIA: sqlTexto(texto(b.carencia, 25), 25),
      DIAGNOSTICO: sqlTexto(String(b.diagnostico ?? '').trim()),
      APLICACAO: sqlTexto(texto(b.aplicacao, 120)),
      APLICACAO_LIBERADO: sqlTexto(texto(b.aplicacaoLiberado, 200), 200),
    };
    if (b.aplicacaoLiberado) {
      const tipos = await consultar('SELECT ID id, DESCRICAO descricao FROM REC_NOVOREC_RESTRICOES');
      const liberados = tiposAplicacaoLiberados(tipos.map((x) => ({ id: n(x.id), descricao: s(x.descricao) })), t.restricaoAplicacao, t.volumeCaldaAerea);
      if (tipos.length && !liberados.some((x) => x.descricao === texto(b.aplicacaoLiberado, 200))) {
        throw new BmapiError('Tipo de aplicação não liberado para este tratamento.');
      }
    }
    return campos;
  }

  r.post('/receitas/:id/produtos', rota(async (req, res) => {
    await salvarProduto(idParam(req), 0, req.body || {});
    res.json({ ok: true });
  }));

  r.put('/receitas/:id/produtos/:item', rota(async (req, res) => {
    await salvarProduto(idParam(req), idParam(req, 'item'), req.body || {});
    res.json({ ok: true });
  }));

  r.delete('/receitas/:id/produtos/:item', rota(async (req, res) => {
    const id = idParam(req);
    const rec = await carregarReceita(id);
    if (n(rec.numero_receita_cidasc)) throw new BmapiError('Receita já foi enviada para CIDASC. Não pode ser alterada!');
    await executar('DELETE FROM REC_RECEITAS_PRO WHERE ID = :item AND ID_RECEITA = :id', { item: idParam(req, 'item'), id });
    await marcarAlterada(id);
    res.json({ ok: true });
  }));

  // ======================= Impressão =======================
  /** Dados do receita.fr3: receita, produtos com tratamento, praga, profissional, cliente e empresa */
  r.get('/receitas/:id/impressao', rota(async (req, res) => {
    const id = idParam(req);
    const rec = await carregarReceita(id);
    const produtos = await produtosDaReceita(id);
    if (!produtos.length) throw new BmapiError('Receita sem produtos.');
    if (produtos.length > 10) throw new BmapiError('O sistema aceita (no máximo) 10 produtos por receita.');
    if (config.exigeCidascParaImprimir && !n(rec.numero_receita_cidasc)) {
      throw new BmapiError('Você deve transmitir o receituário à CIDASC antes de imprimir!');
    }
    await gerarNumero(id);
    const atual = await carregarReceita(id);

    const itens = [];
    for (const p of produtos) {
      const t = await consultarUm(
        `SELECT NOME_INGREDIENTES ingredientes, CLASSIFICACAO_TOXICOLOGICA classe, LOCAL_APLICACAO local,
                ESTAGIO_PROBLEMA estagio FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id`,
        { id: p.idTratamento },
      );
      itens.push({
        ...p,
        ingredientes: s(t?.ingredientes),
        classificacaoToxicologica: s(t?.classe),
        localAplicacao: s(t?.local),
        estagioProblema: s(t?.estagio),
        modoAplicacao: await lerMemo('SELECT MODO_APLICACAO FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id: p.idTratamento }),
        precaucoesUso: await lerMemo('SELECT PRECAUCOES_USO FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id: p.idTratamento }),
      });
    }
    const prof = await consultarUm(
      `SELECT NOME nome, TITULO titulo, REGISTRO registro, ENDERECO endereco, BAIRRO bairro, CIDADE cidade, UF uf, CPF cpf
         FROM REC_PROFISSIONAIS WHERE ID = :id`,
      { id: atual.id_prof },
    );
    const cli = await consultarUm(
      `SELECT NOME nome, CPFCNPJ doc, ENDERECO endereco, NUMERO numero, BAIRRO bairro, CIDADE cidade, UF uf, I_PRURAL iprural
         FROM PESSOAS WHERE ID = :id`,
      { id: atual.id_cliente },
    );
    const emp = await consultarUm(
      'SELECT NOMECONTRIBUINTE nome, FANTASIA fantasia, CGCMF cnpj, MUNICIPIO cidade, UF uf, FONE fone FROM EMPRESAS WHERE ID = :id',
      { id: config.idEmpresa },
    );
    const limpa = (o: Record<string, any> | null) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, s(v)]));
    res.json({
      receita: { ...mapearReceita(atual), obs9: s(atual.obs9), chavePdf: s(atual.chave_ftp) || chavePdf(s(atual.numero_art), n(atual.numero_receita)) },
      produtos: itens,
      profissional: limpa(prof),
      cliente: limpa(cli),
      empresa: limpa(emp),
    });
  }));

  /** Chamado depois de imprimir: grava a chave do PDF/QR code e marca como impressa */
  r.post('/receitas/:id/impressa', rota(async (req, res) => {
    const id = idParam(req);
    const rec = await carregarReceita(id);
    const chave = s(rec.chave_ftp) || chavePdf(s(rec.numero_art), n(rec.numero_receita));
    await executar("UPDATE REC_RECEITAS SET STATUS_IMP = 'I', CHAVE_FTP = :chave WHERE ID = :id", { chave, id });
    res.json({ ok: true });
  }));

  return r;
}
