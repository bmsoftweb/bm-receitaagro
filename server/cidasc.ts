import { consultar, consultarUm, executar, lerMemo, BmapiError } from './bmapi.js';
import { lerRecConfig } from './cadastros.js';
import { semAcento } from './util.js';

/**
 * Envio do receituário ao SIGEN da CIDASC (receita_e.exe, ufrmEnviarReceita.btnEnviarReceitaClick):
 *  1. Acesso/Login com authToken = base64("usuário:senha" do SIGEN do profissional);
 *  2. Receituario/Incluir (ou Receituario/Cancelar) com o JSON do layout_receita.json,
 *     na mesma sessão (cookie do login).
 * A URL vem de rec_config.url_ws (homologação ou produção, conforme o cliente).
 */

const s = (v: unknown) => String(v ?? '').trim();
const n = (v: unknown) => Number(v || 0);

/** Texto fixo de orientação do Delphi (qrReceitasPro.ORIENTACAO) */
const ORIENTACAO =
  'Realizar o manejo integrado de pragas e resistência. Adotar medidas favoráveis que visem a redução ou o ' +
  'controle populacional do problema fitossanitário compondo um programa de manejo integrado.';

/** Decimal com vírgula, como o SIGEN pede ("se decimal separar por vírgula") */
const virgula = (v: number, casas?: number) => (casas === undefined ? String(v) : v.toFixed(casas)).replace('.', ',');
const dataBR = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

/** Mensagens de erro: { Msg: [] } (400/401) ou { Data: { Msg: [] } } */
function mensagens(corpo: any): string {
  const lista = corpo?.Msg ?? corpo?.Data?.Msg;
  return Array.isArray(lista) ? lista.map(String).join('\n') : '';
}

async function chamar(url: string, init: RequestInit): Promise<{ status: number; corpo: any; texto: string; cookie: string }> {
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000), headers: { 'Cache-Control': 'no-store, no-cache', Accept: 'application/json', ...init.headers } });
  } catch (err: any) {
    throw new BmapiError(`Não foi possível acessar o SIGEN da CIDASC (${err?.cause?.code || err?.message}).`, 503);
  }
  const texto = await resp.text();
  let corpo: any = null;
  try { corpo = JSON.parse(texto); } catch { /* HTML de erro do IIS */ }
  const cookie = (resp.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return { status: resp.status, corpo, texto, cookie };
}

/** Consistências do Delphi antes de transmitir; devolve os dados já prontos para o JSON */
async function montar(id: number) {
  const r = await consultarUm(
    `SELECT A.ID id, A.NUMERO_RECEITA nr, A.NUMERO_RECEITA_FULL full, A.NUMERO_RECEITA_CIDASC cidasc, A.DATA data,
            A.CODIGO_IBGE ibge, A.NOME_PROPRIEDADE propriedade, A.ID_LOCALIDADE localidade, A.ID_TIPO_LOGRADOURO tipo,
            A.LOGRADOURO logradouro, A.NUMERO_LOGRADOURO numero, A.COMPLEMENTO_LOGRADOURO complemento, A.CEP_LOGRADOURO cep,
            A.ALTITUDE alt, A.LATITUDE lat, A.LONGITUDE lon, A.ID_CULTURA_CIDASC cultura, A.CANCELADO cancelado,
            A.CANCELADO_CIDASC cancelado_cidasc, E.CIDASC registro, P.NOME produtor, P.CPFCNPJ doc,
            T.SIGEN_CREASC crea, T.SIGEN_USUARIO usuario, T.SIGEN_SENHA senha
       FROM REC_RECEITAS A
       LEFT JOIN EMPRESAS E ON E.ID = A.ID_EMP
       LEFT JOIN PESSOAS P ON P.ID = A.ID_CLIENTE
       LEFT JOIN REC_PROFISSIONAIS T ON T.ID = A.ID_PROF
      WHERE A.ID = :id`,
    { id },
  );
  if (!r) throw new BmapiError('Receita não encontrada.', 404);

  const produtos = await consultar(
    `SELECT A.ID id, A.ID_DEFENSIVO_CIDASC def, A.ID_PRAGA praga, A.ID_PRAGA_CIDASC praga_cidasc, A.ID_TRATAMENTO tratamento,
            A.ID_UN_CIDASC un_qtd, A.ID_UN_AREA_CIDASC un_area, A.ID_DOSE_UN_CIDASC un_dose, A.QTDADE qtd, A.AREA_HA area,
            A.DOSE dose, A.CARENCIA carencia, G.NOME praga_nome, G.NOME_CIENTIFICO praga_cientifico
       FROM REC_RECEITAS_PRO A
       LEFT JOIN REC_NOVOREC_PRAGAS G ON G.ID = A.ID_PRAGA
       LEFT JOIN REC_NOVOREC_CULTURA_PRAGA_PRODUTO T ON T.ID = A.ID_TRATAMENTO
      WHERE A.ID_RECEITA = :id ORDER BY A.ID`,
    { id },
  );

  const erros: string[] = [];
  if (!n(r.registro)) erros.push('Nr do registro da empresa na CIDASC inválido!');
  if (!s(r.crea)) erros.push('Nr do CREA do profissional inválido!');
  if (!s(r.usuario) || !s(r.senha)) erros.push('Usuário ou senha do profissional para o SIGEN inválido!');
  if (!s(r.ibge)) erros.push('Código IBGE do município inválido!');
  if (!n(r.cultura)) erros.push('Código da cultura (CIDASC) inválido!');
  if (!n(r.localidade)) erros.push('Código da localidade do endereço do produtor inválido!');
  if (!n(r.tipo)) erros.push('Código do tipo do logradouro do produtor inválido!');
  // O SIGEN exige a georreferência (recusa zerada)
  if (!n(r.lat) || !n(r.lon)) erros.push('Latitude e longitude do local de aplicação não informadas!');
  if (!n(r.alt)) erros.push('Altitude do local de aplicação não informada!');
  if (!produtos.length) erros.push('Receita sem produtos.');

  const cfg = await lerRecConfig();
  const diagnosticos = [];
  for (const [i, p] of produtos.entries()) {
    const nr = `${i + 1}o.`;
    const modalidade = await lerMemo('SELECT MODO_APLICACAO FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id: p.tratamento });
    const precaucao = await lerMemo('SELECT PRECAUCOES_USO FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id: p.tratamento });
    if (!n(p.def)) erros.push(`ID (CIDASC) do ${nr} agrotóxico inválido!`);
    if (!n(p.un_qtd)) erros.push(`ID (CIDASC) da unidade adquirida do ${nr} agrotóxico inválida!`);
    if (!n(p.un_area)) erros.push(`ID (CIDASC) da unidade da área do ${nr} agrotóxico inválida!`);
    if (!n(p.un_dose)) erros.push(`ID (CIDASC) da unidade da dose do ${nr} agrotóxico inválida!`);
    const epi = await lerMemo('SELECT EPI FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id: p.tratamento });
    if (!modalidade.trim()) erros.push(`Modalidade da época do ${nr} produto está em branco!`);
    if (!epi.trim()) erros.push(`EPI do ${nr} produto está em branco!`);
    diagnosticos.push({
      cdAgrotoxico: String(n(p.def)),
      cdPraga: String(n(p.praga) ? n(p.praga_cidasc) : cfg.idPragaGenericaCidasc || 1561),
      cdUnidadeMedidaAdquirida: String(n(p.un_qtd)),
      cdUnidadeMedidaArea: String(n(p.un_area)),
      cdUnidadeMedidaDosagem: String(n(p.un_dose)),
      qtAdquirida: virgula(n(p.qtd)),
      qtArea: virgula(n(p.area)),
      qtDosagem: virgula(n(p.dose)),
      // Carência vem como "7 DIAS": o SIGEN aceita só o número
      nrIntervalo: s(p.carencia).match(/\d+/)?.[0] || '0',
      dsDiagnostico: semAcento(`${s(p.praga_nome)} (${s(p.praga_cientifico)})`),
      dsModalidadeEpoca: semAcento(modalidade.trim()),
      dsPrecaucao: semAcento(precaucao.trim()),
      dsOrientacao: semAcento(ORIENTACAO),
      dsEPI: semAcento(epi.trim()),
      dsOutros: '',
    });
  }
  if (erros.length) throw new BmapiError(erros.join('\n'));
  if (!cfg.urlWs) throw new BmapiError('URL do SIGEN da CIDASC não configurada (rec_config.url_ws).');

  return {
    r,
    url: cfg.urlWs.replace(/\/+$/, ''),
    corpo: {
      nrReceituario: s(r.full),
      dtEmissao: dataBR(s(r.data)),
      cdMunicipioIbge: s(r.ibge),
      nrDocumentoProdutor: s(r.doc).replace(/\D/g, ''),
      nmProdutor: s(r.produtor),
      nmPropriedade: s(r.propriedade),
      cdNomeComumEspecieVegetal: String(n(r.cultura)),
      endereco: {
        cdLocalidade: String(n(r.localidade)),
        cdTipoLogradouro: String(n(r.tipo)),
        dsLogradouro: s(r.logradouro),
        dsNumeroLogradouro: s(r.numero),
        dsComplementoLogradouro: s(r.complemento),
        nrCepLogradouro: s(r.cep).replace(/\D/g, ''),
      },
      // Altitude é número; latitude/longitude são texto com vírgula (como número o SIGEN responde "tem que ser informado")
      georreferenciamento: { nrAltitude: n(r.alt), nrLatitude: virgula(n(r.lat), 6), nrLongitude: virgula(n(r.lon), 6) },
      listaDiagnosticos: diagnosticos,
    },
  };
}

/** Transmite (ou cancela) a receita no SIGEN; devolve a mensagem para o usuário */
export async function transmitirCidasc(id: number, cancelar = false): Promise<string> {
  const { r, url, corpo } = await montar(id);
  if (!n(r.nr)) throw new BmapiError('Receita ainda sem número!');
  if (cancelar) {
    if (!n(r.cidasc)) throw new BmapiError('Receita ainda não foi enviada para a CIDASC.');
    if (s(r.cancelado_cidasc) === 'S') throw new BmapiError('Receita já cancelada na CIDASC.');
  } else if (n(r.cidasc)) {
    throw new BmapiError('Receita já enviada para a CIDASC.');
  }

  const login = await chamar(`${url}/Acesso/Login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ authToken: Buffer.from(`${s(r.usuario)}:${s(r.senha)}`).toString('base64') }),
  });
  const sessao = s(login.corpo?.SessionID);
  if (login.status !== 200 || !sessao) {
    throw new BmapiError(mensagens(login.corpo) || `Falha no login do profissional no SIGEN (HTTP ${login.status}).`);
  }

  const envio = await chamar(`${url}/Receituario/${cancelar ? 'Cancelar' : 'Incluir'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(login.cookie ? { Cookie: login.cookie } : {}) },
    body: JSON.stringify(corpo),
  });

  if (cancelar) {
    if (envio.status !== 200) throw new BmapiError(mensagens(envio.corpo) || `SIGEN recusou o cancelamento (HTTP ${envio.status}).`);
    await executar("UPDATE REC_RECEITAS SET CANCELADO_CIDASC = 'S' WHERE ID = :id", { id });
    return mensagens(envio.corpo) || 'Receita cancelada na CIDASC.';
  }

  if (envio.status !== 200) {
    const msg =
      envio.status === 404 ? 'Erro 404 - Nenhum registro encontrado!'
        : mensagens(envio.corpo) || `SIGEN recusou o envio (HTTP ${envio.status}).`;
    // "Este receituário já foi informado... Código no sistema NNN": guarda o número que o SIGEN já tem
    const ja = envio.texto.match(/C[óo]digo no sistema\D*(\d+)/i);
    if (ja) await executar('UPDATE REC_RECEITAS SET NUMERO_RECEITA_CIDASC = :nr, SESSIONID = :sess WHERE ID = :id', { nr: Number(ja[1]), sess: sessao, id });
    // O SIGEN junta essa recusa ao texto da regra do campo IBGE, que confunde: explica o que corrigir
    if (/coordenadas inv[áa]lidas/i.test(msg)) {
      throw new BmapiError(
        `A latitude/longitude da receita (${n(r.lat)}; ${n(r.lon)}) não fica no município do cliente (IBGE ${s(r.ibge)}). ` +
        'Corrija o local da aplicação nos dados iniciais da receita. "Usar minha localização" só serve quando você está na propriedade.',
      );
    }
    throw new BmapiError(msg);
  }

  const idReceituario = n(envio.corpo?.Data?.IdReceituario);
  if (!idReceituario) throw new BmapiError('Número do receituário retornado = 0 (verifique no SIGEN possível erro no cadastro do técnico).');
  await executar('UPDATE REC_RECEITAS SET NUMERO_RECEITA_CIDASC = :nr, SESSIONID = :sess WHERE ID = :id', { nr: idReceituario, sess: sessao, id });
  return `Receita enviada à CIDASC: nº ${idReceituario}.`;
}
