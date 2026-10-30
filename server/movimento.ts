import { Router } from 'express';
import { config } from './config.js';
import {
  consultar, consultarUm, executar, executarScript, BmapiError, sqlTexto, sqlNumero, sqlInteiro, sqlData,
  sqlListaInteiros, tabelaMemoria, hojeISO, agoraISO,
} from './bmapi.js';
import { rota, idParam, semAcento } from './util.js';
import { lerRecConfig } from './cadastros.js';
import { chamar, loginSigen, mensagens } from './cidasc.js';

/**
 * Envio do movimento de agrotóxicos ao SIGEN (receita_e.exe, ufrmEnviarMovimento):
 *  gerar  → sql_movimento.txt sobre o PROLOTESCARDEX do período (ainda não enviado);
 *  gravar → REC_CIDASC_MOV_MESTRE + REC_CIDASC_MOV, marca o cardex (e a NF de compra) com 'E';
 *  enviar → AgrotoxicoMovimentacao/Incluir (ou /Cancelar), logado com o responsável legal.
 */

const s = (v: unknown) => String(v ?? '').trim();
const n = (v: unknown) => Number(v || 0);
const dataBR = (v: unknown) => s(v).slice(0, 10).split('-').reverse().join('/');

function periodo(b: any): { d1: string; d2: string } {
  const d1 = s(b?.d1).slice(0, 10);
  const d2 = s(b?.d2).slice(0, 10);
  sqlData(d1); sqlData(d2); // valida o formato
  if (!d1 || !d2) throw new BmapiError('Informe o período.');
  if (d1 > d2) throw new BmapiError('A data inicial é maior que a final.');
  return { d1, d2 };
}

/** sql_consiste_movimento.txt + sql_movimento.txt, com tabelas MEMORY próprias da requisição */
async function gerar(d1: string, d2: string) {
  const [x1, x2, x3] = [tabelaMemoria('MV'), tabelaMemoria('MV'), tabelaMemoria('MV')];
  const cardex = `SELECT A.*,
         IF(POSITION('ACERTO MANUAL',NOME)>0,SUBSTRING(NOME,POSITION('ACERTO MANUAL:',NOME)+15,80),'') JUSTIFICATIVA,
         IF(LINK_TP='CO',LINK_ID,NULL) ID_COMPRA,
         IF(LINK_TP='NF',LINK_ID,NULL) ID_VENDA
    INTO ${x1}
    FROM PROLOTESCARDEX A
    LEFT JOIN PRODUTOSPRINCIPAL B ON B.ID = A.ID_PRO
   WHERE (A.DATA BETWEEN ${sqlData(d1)} AND ${sqlData(d2)})
     AND (STATUS_ENVIO <> 'E')
     AND (ID_EMPRESA = ${sqlInteiro(config.idEmpresa)})
     AND (B.RECEITA='S')`;
  const soltar = () => executar([x1, x2, x3].map((t) => `DROP TABLE IF EXISTS ${t}`).join(';\n')).catch(() => {});

  try {
    const semDefensivo = await consultar(`${cardex};
      SELECT A.ID_PRO id_pro, P.DESCRICAO descricao FROM ${x1} A
        LEFT JOIN REC_DEFENSIVOS_BM B ON B.ID_BM = A.ID_PRO
        LEFT JOIN PRODUTOSPRINCIPAL P ON P.ID = A.ID_PRO
       WHERE B.ID IS NULL`);
    if (semDefensivo.length) {
      const p = semDefensivo[0];
      throw new BmapiError(`Produto (Id no BM): ${p.id_pro}${p.descricao ? ` – ${s(p.descricao)}` : ''} não associado nos defensivos!`);
    }
    await executar(`DROP TABLE IF EXISTS ${x1}`);

    return await consultar(`${cardex};

      /* VENDAS */
      SELECT A.ID ID_PROLOTESCARDEX, A.ID_LOTE ID_LOTE, E.CIDASC,
             CASE
                WHEN (N.TIPO_OP='1' OR N.TIPO_OP='6') THEN 'VE'
                WHEN N.TIPO_OP='4' THEN 'TR'
                WHEN N.TIPO_OP='2' OR N.TIPO_OP='3' THEN 'DE'
                WHEN N.TIPO_OP='9' THEN 'US'
                WHEN N.TIPO_OP='8' THEN 'AC'
             ELSE 'AC'
             END AS TIPO_OPERACAO,
             A.FLUXO NATUREZA_OPERACAO, A.ID_VENDA, N.SERIE, N.NUMERO, N.ID_CLIENTE, N.CLIENTE_DOC,
             N.CLIENTE_NOME NOME_PESSOA, PP.COD_CIDADE, A.DATA DATA_EMISSAO, '' JUSTIFICATIVA, L.LOTE, A.ID_PRO ID_BM,
             IF(D.ID_CIDASC=NULL,CAST(P.COD_INTEGRACAO AS INTEGER),D.ID_CIDASC) ID_CIDASC_DEF,
             P.DESCRICAO DESCRICAO_PRODUTO, P.UNVENDA, M.idAgrotoxicoMedida ID_CIDASC_UN, A.NUMERO_ART,
             R.NUMERO_RECEITA_FULL NUMERO_RECEITA, A.QTD
        INTO ${x2}
        FROM ${x1} A
        LEFT JOIN NFMESTRE N ON N.ID = A.ID_VENDA
        LEFT JOIN EMPRESAS E ON E.ID = A.ID_EMPRESA
        LEFT JOIN PROLOTES L ON L.ID = A.ID_LOTE
        LEFT JOIN REC_DEFENSIVOS_BM B ON B.ID_BM = A.ID_PRO
        LEFT JOIN REC_DEFENSIVOS D ON ((D.ID = B.ID_DEF) and (d.id_bm = a.id_pro))
        LEFT JOIN PRODUTOSPRINCIPAL P ON P.ID = A.ID_PRO
        LEFT JOIN REC_RECEITAS R ON R.ID = A.ID_RECEITA
        LEFT JOIN REC_UN_MEDIDAS_CIDASC M ON M.ID = P.ID_EMBALAGEM
        LEFT JOIN PESSOAS PP ON PP.ID = N.ID_CLIENTE
       WHERE (ID_VENDA<>NULL) AND (P.RECEITA='S') AND (N.TIPO_OP NOT IN ('5','7')) AND (D.ID_CIDASC<> NULL)

      UNION

      /* COMPRAS */
      SELECT A.ID ID_PROLOTESCARDEX, A.ID_LOTE ID_LOTE, E.CIDASC, 'CO' TIPO_OPERACAO,
             A.FLUXO NATUREZA_OPERACAO, A.ID_VENDA, N.SERIE, N.NUMERO, N.ID_FORNEC, F.CPFCNPJ CLIENTE_DOC,
             F.NOME NOME_PESSOA, F.COD_CIDADE, A.DATA DATA_EMISSAO, '' JUSTIFICATIVA, L.LOTE, A.ID_PRO ID_BM,
             IF(D.ID_CIDASC=NULL,CAST(P.COD_INTEGRACAO AS INTEGER),D.ID_CIDASC) ID_CIDASC_DEF,
             P.DESCRICAO DESCRICAO_PRODUTO, P.UNVENDA, M.idAgrotoxicoMedida ID_CIDASC_UN, '' NUMERO_ART,
             '' NUMERO_RECEITA, A.QTD
        FROM ${x1} A
        LEFT JOIN ENTRADASM N ON N.ID = A.ID_COMPRA
        LEFT JOIN EMPRESAS E ON E.ID = A.ID_EMPRESA
        LEFT JOIN PESSOAS F ON F.ID = N.ID_FORNEC
        LEFT JOIN PROLOTES L ON L.ID = A.ID_LOTE
        LEFT JOIN REC_DEFENSIVOS_BM B ON B.ID_BM = A.ID_PRO
        LEFT JOIN REC_DEFENSIVOS D ON ((D.ID = B.ID_DEF) and (d.id_bm = a.id_pro))
        LEFT JOIN PRODUTOSPRINCIPAL P ON P.ID = A.ID_PRO
        LEFT JOIN REC_UN_MEDIDAS_CIDASC M ON M.ID = P.ID_EMBALAGEM
       WHERE (ID_COMPRA<>NULL) AND (P.RECEITA='S') AND (D.ID_CIDASC<>NULL);

      SELECT A.*, B.SERIE SERIE_DE, B.NUMERO NUMERO_DE
        INTO ${x3}
        FROM ${x2} A
        LEFT JOIN NFREFERENCIADAS B ON B.ID_NF = A.ID_VENDA;

      /* Devolução: série/número da nota referenciada */
      UPDATE ${x3} SET SERIE = SERIE_DE, NUMERO = NUMERO_DE
       WHERE (SERIE_DE<>NULL) AND (NUMERO_DE<>NULL) AND (TIPO_OPERACAO = 'DE');

      SELECT * FROM ${x3} ORDER BY DESCRICAO_PRODUTO, DATA_EMISSAO, NATUREZA_OPERACAO`);
  } finally {
    await soltar();
  }
}

/** O que o usuário corrige para cada recusa conhecida do SIGEN (mensagens vistas nos envios gravados) */
const DICAS: [RegExp, string][] = [
  [/ja existe uma movimentacao|ja foi lancada no sistema|correspondem a uma movimentacao existente/,
    'O item já está no SIGEN (enviado antes, talvez pelo sistema antigo): não precisa reenviar. Se o lançamento de lá estiver errado, cancele no SIGEN.'],
  [/codigo da medida do agrotoxico/,
    'Falta a embalagem CIDASC no cadastro do produto no ERP (ou ela não vale para este agrotóxico): corrija a embalagem e gere o movimento de novo.'],
  [/codigo do agrotoxico|agrotoxico nao informado/,
    'Produto do ERP sem vínculo com a CIDASC: em Defensivos, associe o produto ("Produtos do ERP") e confira o "Vincular CIDASC"; depois gere o movimento de novo.'],
  [/numero do art|receituario (tem que ser informado|e obrigatorio)|numero do receituario/,
    'Venda sem receita: vincule a receita (já enviada à CIDASC, com número) à venda no ERP e gere o movimento de novo.'],
  [/movimentacao de saida do tipo venda/,
    'A venda desta devolução não está no SIGEN: envie a venda antes e depois a devolução.'],
  [/movimentacao de entrada do tipo compra/,
    'A compra desta devolução não está no SIGEN: envie a compra antes e depois a devolução.'],
  [/entrada no estoque|com a embalagem codigo|maior que o saldo/,
    'O SIGEN não tem entrada (compra) deste lote/embalagem ou o saldo não basta: envie antes a compra do lote e confira se lote e embalagem são iguais na compra e na venda.'],
  [/ajuste de saldo|nao pode ser menor que/,
    'Movimento anterior ao ajuste de saldo feito no SIGEN: não é aceito. Se o saldo lá já considera este movimento, ignore o item.'],
  [/tipo operacao (incorreto|nao valida)/,
    'O SIGEN não aceita esse tipo de operação para a nota (ex.: entrada que não é compra): confira a natureza/tipo de operação da nota no ERP.'],
  [/lote 0|lote nao informado/,
    'Compra sem lote: informe o lote na nota de entrada e gere o movimento de novo.'],
];
export function dicaSigen(msg: string): string {
  const m = semAcento(msg).toLowerCase();
  return DICAS.find(([re]) => re.test(m))?.[1] || '';
}

/** Linha do movimento como o app mostra (gerado ou gravado) */
function mapear(r: any) {
  return {
    id: n(r.id),
    idCardex: n(r.id_prolotescardex),
    tipo: s(r.tipo_operacao),
    natureza: s(r.natureza_operacao),
    serie: s(r.serie),
    numero: n(r.numero),
    documento: s(r.numero_doc ?? r.cliente_doc),
    pessoa: s(r.nome_pessoa),
    ibge: s(r.cod_municipio_ibge ?? r.cod_cidade),
    data: s(r.data_emissao).slice(0, 10),
    lote: s(r.lote),
    produto: s(r.descricao_produto),
    un: s(r.un_venda ?? r.unvenda),
    qtd: n(r.qtd),
    art: s(r.numero_art),
    receita: s(r.numero_receita),
    statusEnvio: s(r.status_envio),
    statusCanc: s(r.status_canc),
    mensagem: s(r.mensagem),
    dica: s(r.status_envio) === 'E' || s(r.status_canc) === 'E' ? dicaSigen(s(r.mensagem)) : '',
  };
}

const SQL_ITENS = `SELECT ID id, ID_MOV id_mov, ID_PROLOTESCARDEX id_prolotescardex, COD_EMPRESA_CIDASC cod_empresa_cidasc,
       TIPO_OPERACAO tipo_operacao, NATUREZA_OPERACAO natureza_operacao, SERIE serie, NUMERO numero, NUMERO_DOC numero_doc,
       NOME_PESSOA nome_pessoa, COD_MUNICIPIO_IBGE cod_municipio_ibge, DATA_EMISSAO data_emissao, JUSTIFICATIVA justificativa,
       LOTE lote, ID_PRO id_pro, ID_CIDASC_DEF id_cidasc_def, DESCRICAO_PRODUTO descricao_produto, UN_VENDA un_venda,
       ID_CIDASC_UN id_cidasc_un, NUMERO_ART numero_art, NUMERO_RECEITA numero_receita, QTD qtd,
       STATUS_ENVIO status_envio, STATUS_CANC status_canc, MENSAGEM mensagem
  FROM REC_CIDASC_MOV`;

/** NF de compra (ENTRADASM) localizada por série e número, como o Locate do Delphi */
const statusCompra = (r: any, valor: string) =>
  `UPDATE ENTRADASM SET STATUS_PV = ${sqlTexto(valor)} WHERE SERIE = ${sqlTexto(s(r.serie))} AND NUMERO = ${sqlInteiro(n(r.numero))}`;

/** layout_movimento.json */
function corpoSigen(r: any) {
  return {
    nrRegistro: s(r.cod_empresa_cidasc),
    csTipoOperacao: s(r.tipo_operacao),
    flOperacao: s(r.natureza_operacao),
    dsSerieNotaFiscal: s(r.serie),
    nrNotaFiscal: n(r.numero),
    nrDocumento: s(r.numero_doc),
    cdMunicipio: s(r.cod_municipio_ibge),
    dtOperacao: dataBR(r.data_emissao),
    dsObservacao: s(r.justificativa),
    nrLote: s(r.lote),
    cdAgrotoxico: n(r.id_cidasc_def),
    cdAgrotoxicoMedida: n(r.id_cidasc_un),
    nrArt: s(r.numero_art),
    nrReceituario: s(r.numero_receita),
    qtMovimentada: n(r.qtd),
  };
}

export function createMovimentoRouter() {
  const router = Router();

  /** Movimentos gravados, com a contagem de itens enviados */
  router.get('/movimentos', rota(async (_req, res) => {
    const mestres = await consultar(
      `SELECT ID id, DATA_GERACAO data_geracao, HORA_GERACAO hora_geracao, DATA_INICIAL data_inicial, DATA_FINAL data_final
         FROM REC_CIDASC_MOV_MESTRE ORDER BY ID DESC TOP 200`,
    );
    const contagem = mestres.length
      ? await consultar(
        `SELECT ID_MOV id_mov, COUNT(*) total, SUM(IF(STATUS_ENVIO='S',1,0)) enviados, SUM(IF(STATUS_ENVIO='E',1,0)) erros
           FROM REC_CIDASC_MOV WHERE ID_MOV IN (${sqlListaInteiros(mestres.map((m) => m.id))}) GROUP BY ID_MOV`,
      )
      : [];
    const por = new Map(contagem.map((c) => [n(c.id_mov), c]));
    res.json(mestres.map((m) => {
      const c = por.get(n(m.id));
      return {
        id: n(m.id),
        geradoEm: `${s(m.data_geracao).slice(0, 10)} ${s(m.hora_geracao).slice(0, 8)}`.trim(),
        dataInicial: s(m.data_inicial).slice(0, 10),
        dataFinal: s(m.data_final).slice(0, 10),
        total: n(c?.total),
        enviados: n(c?.enviados),
        erros: n(c?.erros),
      };
    }));
  }));

  router.get('/movimentos/:id', rota(async (req, res) => {
    const itens = await consultar(`${SQL_ITENS} WHERE ID_MOV = :id ORDER BY DESCRICAO_PRODUTO, DATA_EMISSAO, NATUREZA_OPERACAO`, { id: idParam(req) });
    res.json(itens.map(mapear));
  }));

  /** Prévia: o que entraria no movimento do período */
  router.post('/movimentos/gerar', rota(async (req, res) => {
    const { d1, d2 } = periodo(req.body);
    res.json((await gerar(d1, d2)).map(mapear));
  }));

  /** Gera de novo (não confia na prévia do navegador) e grava */
  router.post('/movimentos', rota(async (req, res) => {
    const { d1, d2 } = periodo(req.body);
    const linhas = await gerar(d1, d2);
    if (!linhas.length) throw new BmapiError('Não existem movimentos!');

    const [dia, hora] = [hojeISO(), agoraISO().slice(11, 19)];
    await executar(
      `INSERT INTO REC_CIDASC_MOV_MESTRE (DATA_GERACAO, HORA_GERACAO, DATA_INICIAL, DATA_FINAL)
       VALUES (${sqlData(dia)}, ${sqlTexto(hora)}, ${sqlData(d1)}, ${sqlData(d2)})`,
    );
    const mestre = await consultarUm(
      `SELECT ID id FROM REC_CIDASC_MOV_MESTRE WHERE DATA_GERACAO = ${sqlData(dia)} AND HORA_GERACAO = ${sqlTexto(hora)}
        ORDER BY ID DESC TOP 1`,
    );
    const idMov = n(mestre?.id);
    if (!idMov) throw new BmapiError('Falha ao gravar o movimento.');

    const comandos: string[] = [];
    for (const r of linhas) {
      comandos.push(
        `INSERT INTO REC_CIDASC_MOV (ID_MOV, ID_PROLOTESCARDEX, COD_EMPRESA_CIDASC, TIPO_OPERACAO, NATUREZA_OPERACAO, SERIE, NUMERO,
           NUMERO_DOC, NOME_PESSOA, COD_MUNICIPIO_IBGE, DATA_EMISSAO, JUSTIFICATIVA, LOTE, ID_PRO, ID_CIDASC_DEF, DESCRICAO_PRODUTO,
           UN_VENDA, ID_CIDASC_UN, NUMERO_ART, NUMERO_RECEITA, QTD)
         VALUES (${idMov}, ${sqlInteiro(r.id_prolotescardex)}, ${sqlTexto(s(r.cidasc), 5)}, ${sqlTexto(s(r.tipo_operacao), 2)},
           ${sqlTexto(s(r.natureza_operacao), 1)}, ${sqlTexto(s(r.serie), 3)}, ${sqlInteiro(n(r.numero))}, ${sqlTexto(s(r.cliente_doc), 20)},
           ${sqlTexto(s(r.nome_pessoa), 50)}, ${sqlTexto(s(r.cod_cidade), 7)}, ${sqlData(r.data_emissao)}, ${sqlTexto(s(r.justificativa), 512)},
           ${sqlTexto(s(r.lote), 20)}, ${sqlInteiro(r.id_bm)}, ${sqlInteiro(n(r.id_cidasc_def))}, ${sqlTexto(s(r.descricao_produto), 80)},
           ${sqlTexto(s(r.unvenda), 6)}, ${sqlInteiro(n(r.id_cidasc_un))}, ${sqlTexto(s(r.numero_art), 15)}, ${sqlTexto(s(r.numero_receita), 15)},
           ${sqlNumero(n(r.qtd))})`,
        `UPDATE PROLOTESCARDEX SET STATUS_ENVIO = 'E' WHERE ID = ${sqlInteiro(r.id_prolotescardex)}`,
      );
      if (s(r.tipo_operacao) === 'CO') comandos.push(statusCompra(r, 'E'));
    }
    await executarScript(comandos);
    res.json({ id: idMov, itens: linhas.length });
  }));

  /**
   * Envia (ou cancela) os itens do movimento; sem "itens", todos.
   * Envio pula os já enviados; cancelamento só vale para os enviados.
   */
  router.post('/movimentos/:id/enviar', rota(async (req, res) => {
    const idMov = idParam(req);
    const cancelar = Boolean(req.body?.cancelar);
    const ids: number[] = Array.isArray(req.body?.itens) ? req.body.itens.map(Number).filter(Boolean) : [];
    const itens = (await consultar(`${SQL_ITENS} WHERE ID_MOV = :id ORDER BY DESCRICAO_PRODUTO, DATA_EMISSAO, NATUREZA_OPERACAO`, { id: idMov }))
      .filter((r) => !ids.length || ids.includes(n(r.id)))
      .filter((r) => (cancelar ? s(r.status_envio) === 'S' : s(r.status_envio) !== 'S'));
    if (!itens.length) throw new BmapiError(cancelar ? 'Nenhum item enviado para cancelar.' : 'Nenhum item a enviar.');

    const { urlWs } = await lerRecConfig();
    if (!/^https:\/\//i.test(urlWs)) throw new BmapiError('Endereço do SIGEN não configurado (Configurações).');
    const prof = await consultarUm(
      `SELECT ID id, SIGEN_USUARIO usuario, SIGEN_SENHA senha FROM REC_PROFISSIONAIS
        WHERE ID_EMP = :emp AND SIGEN_RESPONSAVEL_LEGAL = 'X' ORDER BY ID TOP 1`,
      { emp: config.idEmpresa },
    );
    if (!prof) throw new BmapiError('Sem profissional responsável! Marque o responsável legal no cadastro de profissionais.');
    const url = urlWs.replace(/\/+$/, '');
    const { cookie } = await loginSigen(url, s(prof.usuario), s(prof.senha));

    let ok = 0;
    const falhas: string[] = [];
    for (const r of itens) {
      const envio = await chamar(`${url}/AgrotoxicoMovimentacao/${cancelar ? 'Cancelar' : 'Incluir'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(corpoSigen(r)),
      });
      const msg = (mensagens(envio.corpo) || (envio.status === 200 ? '' : `HTTP ${envio.status}`)).replace(/\r?\n/g, ' / ');
      const sucesso = envio.status === 200;
      // Cancelamento recusado mantém o item como enviado (no Delphi voltava a 'E' e podia ser enviado em dobro)
      const envioNovo = cancelar ? (sucesso ? '' : 'S') : (sucesso ? 'S' : 'E');
      const cancNovo = cancelar ? (sucesso ? 'S' : 'E') : '';
      const comandos = [
        `UPDATE REC_CIDASC_MOV SET STATUS_ENVIO = ${sqlTexto(envioNovo)}, STATUS_CANC = ${sqlTexto(cancNovo)},
           MENSAGEM = ${sqlTexto(msg, 500)} WHERE ID = ${sqlInteiro(r.id)}`,
      ];
      if (cancelar && sucesso && s(r.tipo_operacao) === 'CO') comandos.push(statusCompra(r, ''));
      await executarScript(comandos);
      if (sucesso) ok++;
      else {
        const dica = dicaSigen(msg);
        falhas.push(`${s(r.descricao_produto)} (${dataBR(r.data_emissao)}): ${msg}${dica ? ` Como resolver: ${dica}` : ''}`);
      }
    }
    res.json({ ok, falhas });
  }));

  /** Exclui os itens ainda não enviados (liberando o cardex para um novo movimento); sem itens, o mestre some */
  router.delete('/movimentos/:id', rota(async (req, res) => {
    const idMov = idParam(req);
    const itens = (await consultar(`${SQL_ITENS} WHERE ID_MOV = :id`, { id: idMov })).filter((r) => s(r.status_envio) !== 'S');
    const comandos: string[] = [];
    for (const r of itens) {
      comandos.push(`UPDATE PROLOTESCARDEX SET STATUS_ENVIO = '' WHERE ID = ${sqlInteiro(r.id_prolotescardex)}`);
      if (s(r.tipo_operacao) === 'CO') comandos.push(statusCompra(r, ''));
      comandos.push(`DELETE FROM REC_CIDASC_MOV WHERE ID = ${sqlInteiro(r.id)}`);
    }
    await executarScript(comandos);
    const resta = await consultarUm('SELECT COUNT(*) total FROM REC_CIDASC_MOV WHERE ID_MOV = :id', { id: idMov });
    if (!n(resta?.total)) await executar('DELETE FROM REC_CIDASC_MOV_MESTRE WHERE ID = :id', { id: idMov });
    res.json({ excluidos: itens.length, restantes: n(resta?.total) });
  }));

  return router;
}
