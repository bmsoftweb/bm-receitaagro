import { Router, Request, Response } from 'express';
import { config } from './config.js';
import { consultar, consultarUm, executar, BmapiError, sqlTexto, sqlInteiro, hojeISO } from './bmapi.js';
import { rota, texto, maiusculo, soDigitos, idParam, busca, documentoValido } from './util.js';

/**
 * Cadastros simples do receituário (telas ufrmProf, ufrmArts, ufrmObs, ufrmDiagnosticos
 * e ufrmClientes do Delphi). Exclusões são físicas, como no Delphi, mas bloqueadas quando
 * o registro já tem receita.
 */

async function contarReceitas(campo: 'ID_PROF' | 'ID_ART' | 'ID_CLIENTE', id: number): Promise<number> {
  const r = await consultarUm(`SELECT COUNT(*) n FROM REC_RECEITAS WHERE ${campo} = :id`, { id });
  return Number(r?.n || 0);
}

/** rec_config.usa_bmsoft = 'S': clientes são mantidos no BMsoft, não aqui */
export async function lerRecConfig() {
  const c = await consultarUm(
    `SELECT TIPO_IMPRESSORA tipo_impressora, USA_BMSOFT usa_bmsoft, URL_WS url_ws,
            ID_PRAGA_GENERICA_CIDASC id_praga_generica_cidasc, USA_SISTEMAS_TERCEIROS usa_terceiros,
            COMPENDIO_ONLINE compendio_online, TOKENID_NOVOREC token_novorec
       FROM REC_CONFIG TOP 1`,
  );
  return {
    usaBmsoft: String(c?.usa_bmsoft || '').trim() === 'S',
    usaSistemasTerceiros: String(c?.usa_terceiros || '').trim() === 'S',
    compendioOnline: String(c?.compendio_online || '').trim() === 'S',
    idPragaGenericaCidasc: Number(c?.id_praga_generica_cidasc || 0),
    urlWs: String(c?.url_ws || '').trim(),
    /** Só para o servidor: nunca vai ao navegador */
    tokenNovoRec: String(c?.token_novorec || '').trim(),
  };
}

// ------------------------------------------------------------
// Profissionais (REC_PROFISSIONAIS)
// ------------------------------------------------------------
function dadosProfissional(b: any) {
  const cpf = soDigitos(b.cpf, 14);
  if (!texto(b.nome, 50)) throw new BmapiError('Informe o nome do profissional.');
  if (!documentoValido(cpf)) throw new BmapiError('CPF inválido.');
  return {
    nome: maiusculo(b.nome, 50),
    cpf,
    titulo: texto(b.titulo, 30),
    registro: texto(b.registro, 20),
    endereco: maiusculo(b.endereco, 50),
    bairro: maiusculo(b.bairro, 30),
    cep: soDigitos(b.cep, 8),
    cidade: maiusculo(b.cidade, 30),
    uf: maiusculo(b.uf, 2),
    fone: soDigitos(b.fone, 15),
    celular: soDigitos(b.celular, 15),
    cidasc: texto(b.cidascCodigo, 10),
    crea: texto(b.sigenCreasc, 10),
    sigen_usuario: texto(b.sigenUsuario, 15),
  };
}

// ------------------------------------------------------------
// Clientes (PESSOAS com Perfil_Cli)
// ------------------------------------------------------------
function dadosCliente(b: any) {
  const doc = soDigitos(b.cpfCnpj, 14);
  if (!texto(b.nome, 60)) throw new BmapiError('Informe o nome do cliente.');
  if (!documentoValido(doc)) throw new BmapiError('CPF/CNPJ inválido.');
  return {
    tipo: b.juridicaFisica === 'J' ? 'J' : 'F',
    nome: maiusculo(b.nome, 60),
    fantasia: maiusculo(b.fantasia, 40),
    endereco: maiusculo(b.endereco, 60),
    numero: texto(b.numero, 5),
    complemento: maiusculo(b.complemento, 30),
    bairro: maiusculo(b.bairro, 25),
    cep: soDigitos(b.cep, 8),
    cidade: maiusculo(b.cidade, 30),
    uf: maiusculo(b.uf, 2),
    fone1: soDigitos(b.fone1, 15),
    fone2: soDigitos(b.fone2, 15),
    celular: soDigitos(b.celular, 15),
    email: texto(b.email, 100).toLowerCase(),
    doc,
    ie: texto(b.ie, 20),
    rg: texto(b.rg, 20),
    iprural: texto(b.iPRural, 20),
    lembrete: texto(b.lembrete, 80),
  };
}

async function exigirClientesLocais() {
  if ((await lerRecConfig()).usaBmsoft) {
    throw new BmapiError('Faça a manutenção de clientes no BMsoft.', 403);
  }
}

export function createCadastrosRouter() {
  const r = Router();

  // ---------------- Profissionais ----------------
  r.get('/profissionais', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT ID id, NOME nome, CPF cpf, TITULO titulo, REGISTRO registro, ENDERECO endereco,
              BAIRRO bairro, CEP cep, CIDADE cidade, UF uf, FONE fone, CELULAR celular,
              CIDASC_CODIGO cidasc_codigo, SIGEN_CREASC sigen_creasc, SIGEN_USUARIO sigen_usuario,
              SIGEN_RESPONSAVEL_LEGAL responsavel, ANO_ATUAL ano_atual, ULTIMA_RECEITA ultima_receita
         FROM REC_PROFISSIONAIS
        WHERE UPPER(NOME) LIKE :q
        ORDER BY NOME`,
      { q: busca(req.query.q) },
    );
    res.json(rows.map((p) => ({
      id: Number(p.id),
      nome: String(p.nome || '').trim(),
      cpf: String(p.cpf || '').trim(),
      titulo: String(p.titulo || '').trim(),
      registro: String(p.registro || '').trim(),
      endereco: String(p.endereco || '').trim(),
      bairro: String(p.bairro || '').trim(),
      cep: String(p.cep || '').trim(),
      cidade: String(p.cidade || '').trim(),
      uf: String(p.uf || '').trim(),
      fone: String(p.fone || '').trim(),
      celular: String(p.celular || '').trim(),
      cidascCodigo: String(p.cidasc_codigo || '').trim(),
      sigenCreasc: String(p.sigen_creasc || '').trim(),
      sigenUsuario: String(p.sigen_usuario || '').trim(),
      responsavelLegal: String(p.responsavel || '').trim() === 'X',
      anoAtual: Number(p.ano_atual || 0),
      ultimaReceita: Number(p.ultima_receita || 0),
    })));
  }));

  r.post('/profissionais', rota(async (req, res) => {
    const d = dadosProfissional(req.body || {});
    await executar(
      `INSERT INTO REC_PROFISSIONAIS (ID_EMP, NOME, CPF, TITULO, REGISTRO, ENDERECO, BAIRRO, CEP, CIDADE, UF,
              FONE, CELULAR, CIDASC_CODIGO, SIGEN_CREASC, SIGEN_USUARIO, SIGEN_SENHA, SIGEN_RESPONSAVEL_LEGAL)
       VALUES (:emp, :nome, :cpf, :titulo, :registro, :endereco, :bairro, :cep, :cidade, :uf,
              :fone, :celular, :cidasc, :crea, :sigen_usuario, :senha, '')`,
      { emp: config.idEmpresa, ...d, senha: texto(req.body?.sigenSenha, 15) },
    );
    res.json({ ok: true });
  }));

  r.put('/profissionais/:id', rota(async (req, res) => {
    const d = dadosProfissional(req.body || {});
    const senha = texto(req.body?.sigenSenha, 15);
    // Senha do SIGEN só é trocada quando informada (não volta para o navegador)
    await executar(
      `UPDATE REC_PROFISSIONAIS SET NOME = :nome, CPF = :cpf, TITULO = :titulo, REGISTRO = :registro,
              ENDERECO = :endereco, BAIRRO = :bairro, CEP = :cep, CIDADE = :cidade, UF = :uf, FONE = :fone,
              CELULAR = :celular, CIDASC_CODIGO = :cidasc, SIGEN_CREASC = :crea, SIGEN_USUARIO = :sigen_usuario
              ${senha ? ', SIGEN_SENHA = :senha' : ''}
        WHERE ID = :id`,
      { ...d, senha, id: idParam(req) },
    );
    res.json({ ok: true });
  }));

  // Responsável legal é exclusivo
  r.put('/profissionais/:id/responsavel', rota(async (req, res) => {
    const id = idParam(req);
    await executar(
      `UPDATE REC_PROFISSIONAIS SET SIGEN_RESPONSAVEL_LEGAL = CASE WHEN ID = ${sqlInteiro(id)} THEN 'X' ELSE '' END`,
    );
    res.json({ ok: true });
  }));

  r.delete('/profissionais/:id', rota(async (req, res) => {
    const id = idParam(req);
    if (await contarReceitas('ID_PROF', id)) {
      throw new BmapiError('Este profissional já tem receita. Não pode ser excluído!');
    }
    await executar('DELETE FROM REC_PROFISSIONAIS WHERE ID = :id', { id });
    res.json({ ok: true });
  }));

  // ---------------- ARTs / TRTs ----------------
  r.get('/arts', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT A.ID id, A.NUMERO_ART numero, A.ID_PROF id_prof, P.NOME prof, A.QTDADE_RECEITAS qtdade,
              A.OBS obs, A.ULTIMA_RECEITA ultima, A.STATUS status
         FROM REC_ARTS A
         LEFT JOIN REC_PROFISSIONAIS P ON P.ID = A.ID_PROF
        WHERE UPPER(A.NUMERO_ART) LIKE :q
        ORDER BY A.NUMERO_ART`,
      { q: busca(req.query.q) },
    );
    // DBISAM não aceita subconsulta na lista do SELECT: a contagem vem à parte
    const contagem = await consultar('SELECT ID_ART id, COUNT(*) n FROM REC_RECEITAS GROUP BY ID_ART');
    const emitidas = new Map(contagem.map((c) => [Number(c.id), Number(c.n)]));
    res.json(rows.map((a) => ({
      id: Number(a.id),
      numero: String(a.numero || '').trim(),
      idProf: Number(a.id_prof || 0),
      profissional: String(a.prof || '').trim(),
      qtdadeReceitas: Number(a.qtdade || 0),
      obs: String(a.obs || '').trim(),
      ultimaReceita: Number(a.ultima || 0),
      ativa: String(a.status || 'A').trim() !== 'D',
      receitasEmitidas: emitidas.get(Number(a.id)) || 0,
    })));
  }));

  const dadosArt = (b: any) => {
    const numero = texto(b.numero, 15);
    if (!numero) throw new BmapiError('Informe o número da ART/TRT.');
    if (!Number(b.idProf)) throw new BmapiError('Informe o profissional da ART/TRT.');
    return {
      numero,
      prof: Math.trunc(Number(b.idProf)),
      qtd: Math.max(0, Math.trunc(Number(b.qtdadeReceitas) || 0)),
      obs: texto(b.obs, 80),
      ultima: Math.max(0, Math.trunc(Number(b.ultimaReceita) || 0)),
    };
  };

  r.post('/arts', rota(async (req, res) => {
    const d = dadosArt(req.body || {});
    await executar(
      `INSERT INTO REC_ARTS (ID_EMPRESA, NUMERO_ART, ID_PROF, QTDADE_RECEITAS, OBS, ULTIMA_RECEITA, STATUS)
       VALUES (:emp, :numero, :prof, :qtd, :obs, :ultima, 'A')`,
      { emp: config.idEmpresa, ...d },
    );
    res.json({ ok: true });
  }));

  r.put('/arts/:id', rota(async (req, res) => {
    const id = idParam(req);
    const d = dadosArt(req.body || {});
    const atual = await consultarUm('SELECT NUMERO_ART numero FROM REC_ARTS WHERE ID = :id', { id });
    const numeroAntigo = String(atual?.numero || '').trim();
    if (numeroAntigo && numeroAntigo !== d.numero && (await contarReceitas('ID_ART', id))) {
      throw new BmapiError('ART/TRT já tem receita, número não pode ser alterado!');
    }
    await executar(
      `UPDATE REC_ARTS SET NUMERO_ART = :numero, ID_PROF = :prof, QTDADE_RECEITAS = :qtd, OBS = :obs,
              ULTIMA_RECEITA = :ultima
        WHERE ID = :id`,
      { ...d, id },
    );
    res.json({ ok: true });
  }));

  r.put('/arts/:id/status', rota(async (req, res) => {
    await executar('UPDATE REC_ARTS SET STATUS = :s WHERE ID = :id', {
      s: req.body?.ativa ? 'A' : 'D',
      id: idParam(req),
    });
    res.json({ ok: true });
  }));

  r.delete('/arts/:id', rota(async (req, res) => {
    const id = idParam(req);
    if (await contarReceitas('ID_ART', id)) throw new BmapiError('Esta ART/TRT já tem receita!');
    await executar('DELETE FROM REC_ARTS WHERE ID = :id', { id });
    res.json({ ok: true });
  }));

  // ---------------- Observações (REC_OBS) e Diagnósticos (REC_DIAGNOSTICOS) ----------------
  r.get('/observacoes', rota(async (_req, res) => {
    const rows = await consultar('SELECT ID id, OBS obs FROM REC_OBS ORDER BY OBS');
    res.json(rows.map((o) => ({ id: Number(o.id), texto: String(o.obs || '').trim() })));
  }));

  const obs = (b: any) => {
    const t = texto(b?.texto, 120);
    if (!t) throw new BmapiError('Observação não pode ficar em branco!');
    return t;
  };
  r.post('/observacoes', rota(async (req, res) => {
    await executar('INSERT INTO REC_OBS (OBS) VALUES (:t)', { t: obs(req.body) });
    res.json({ ok: true });
  }));
  r.put('/observacoes/:id', rota(async (req, res) => {
    await executar('UPDATE REC_OBS SET OBS = :t WHERE ID = :id', { t: obs(req.body), id: idParam(req) });
    res.json({ ok: true });
  }));
  r.delete('/observacoes/:id', rota(async (req, res) => {
    await executar('DELETE FROM REC_OBS WHERE ID = :id', { id: idParam(req) });
    res.json({ ok: true });
  }));

  r.get('/diagnosticos', rota(async (_req, res) => {
    // Memo chega como [blob] sem o CAST; 512 é o limite do CAST no DBISAM via bmAPI
    const rows = await consultar('SELECT ID id, CAST(DIAGNOSTICO AS VARCHAR(512)) diagnostico FROM REC_DIAGNOSTICOS ORDER BY ID');
    res.json(rows.map((d) => ({ id: Number(d.id), texto: String(d.diagnostico || '').trim() })));
  }));

  const diag = (b: any) => {
    const t = texto(b?.texto, 512);
    if (t.length < 10) throw new BmapiError('Diagnóstico deve ter no mínimo 10 caracteres.');
    return t;
  };
  r.post('/diagnosticos', rota(async (req, res) => {
    await executar(`INSERT INTO REC_DIAGNOSTICOS (DIAGNOSTICO) VALUES (${sqlTexto(diag(req.body))})`);
    res.json({ ok: true });
  }));
  r.put('/diagnosticos/:id', rota(async (req, res) => {
    await executar(`UPDATE REC_DIAGNOSTICOS SET DIAGNOSTICO = ${sqlTexto(diag(req.body))} WHERE ID = ${sqlInteiro(idParam(req))}`);
    res.json({ ok: true });
  }));
  r.delete('/diagnosticos/:id', rota(async (req, res) => {
    await executar('DELETE FROM REC_DIAGNOSTICOS WHERE ID = :id', { id: idParam(req) });
    res.json({ ok: true });
  }));

  // ---------------- Clientes (PESSOAS) ----------------
  r.get('/clientes', rota(async (req, res) => {
    const somenteAtivos = req.query.ativos === 'S';
    const { rows, truncated } = await (async () => {
      const lista = await consultar(
        `SELECT ID id, JURIDICAFISICA tipo, NOME nome, FANTASIA fantasia, ENDERECO endereco, NUMERO numero,
                COMPLEMENTO complemento, BAIRRO bairro, CEP cep, CIDADE cidade, UF uf, FONE1 fone1, FONE2 fone2,
                CELULAR celular, EMAIL email, CPFCNPJ doc, IE ie, RG rg, I_PRURAL iprural, LEMBRETE lembrete,
                ATIVO ativo, DATA_CADASTRO cadastro
           FROM PESSOAS
          WHERE PERFIL_CLI = TRUE AND (UPPER(NOME) LIKE :q OR CPFCNPJ LIKE :doc)
                ${somenteAtivos ? "AND ATIVO = 'S'" : ''}
          ORDER BY NOME TOP 301`,
        { q: busca(req.query.q), doc: `${soDigitos(req.query.q, 14) || '#'}%` },
      );
      return { rows: lista.slice(0, 300), truncated: lista.length > 300 };
    })();
    res.json({
      truncated,
      clientes: rows.map((c) => ({
        id: Number(c.id),
        juridicaFisica: String(c.tipo || 'F').trim() === 'J' ? 'J' : 'F',
        nome: String(c.nome || '').trim(),
        fantasia: String(c.fantasia || '').trim(),
        endereco: String(c.endereco || '').trim(),
        numero: String(c.numero || '').trim(),
        complemento: String(c.complemento || '').trim(),
        bairro: String(c.bairro || '').trim(),
        cep: String(c.cep || '').trim(),
        cidade: String(c.cidade || '').trim(),
        uf: String(c.uf || '').trim(),
        fone1: String(c.fone1 || '').trim(),
        fone2: String(c.fone2 || '').trim(),
        celular: String(c.celular || '').trim(),
        email: String(c.email || '').trim(),
        cpfCnpj: String(c.doc || '').replace(/\D/g, ''),
        ie: String(c.ie || '').trim(),
        rg: String(c.rg || '').trim(),
        iPRural: String(c.iprural || '').trim(),
        lembrete: String(c.lembrete || '').trim(),
        ativo: String(c.ativo || 'S').trim() !== 'N',
        dataCadastro: c.cadastro ? String(c.cadastro).slice(0, 10) : '',
      })),
    });
  }));

  r.post('/clientes', rota(async (req, res) => {
    await exigirClientesLocais();
    const d = dadosCliente(req.body || {});
    await executar(
      `INSERT INTO PESSOAS (JURIDICAFISICA, NOME, FANTASIA, ENDERECO, NUMERO, COMPLEMENTO, BAIRRO, CEP, CIDADE, UF,
              FONE1, FONE2, CELULAR, EMAIL, CPFCNPJ, IE, RG, I_PRURAL, LEMBRETE, ATIVO, DATA_CADASTRO, PERFIL_CLI)
       VALUES (:tipo, :nome, :fantasia, :endereco, :numero, :complemento, :bairro, :cep, :cidade, :uf,
              :fone1, :fone2, :celular, :email, :doc, :ie, :rg, :iprural, :lembrete, 'S', :hoje, TRUE)`,
      { ...d, hoje: hojeISO() },
    );
    res.json({ ok: true });
  }));

  r.put('/clientes/:id', rota(async (req, res) => {
    await exigirClientesLocais();
    const d = dadosCliente(req.body || {});
    await executar(
      `UPDATE PESSOAS SET JURIDICAFISICA = :tipo, NOME = :nome, FANTASIA = :fantasia, ENDERECO = :endereco,
              NUMERO = :numero, COMPLEMENTO = :complemento, BAIRRO = :bairro, CEP = :cep, CIDADE = :cidade, UF = :uf,
              FONE1 = :fone1, FONE2 = :fone2, CELULAR = :celular, EMAIL = :email, CPFCNPJ = :doc, IE = :ie, RG = :rg,
              I_PRURAL = :iprural, LEMBRETE = :lembrete
        WHERE ID = :id AND PERFIL_CLI = TRUE`,
      { ...d, id: idParam(req) },
    );
    res.json({ ok: true });
  }));

  r.put('/clientes/:id/ativo', rota(async (req, res) => {
    await exigirClientesLocais();
    await executar('UPDATE PESSOAS SET ATIVO = :a WHERE ID = :id AND PERFIL_CLI = TRUE', {
      a: req.body?.ativo ? 'S' : 'N',
      id: idParam(req),
    });
    res.json({ ok: true });
  }));

  // Pessoa com receita não é apagada: inativar pelo toggle (exclusão lógica do padrão BMsoft)
  r.delete('/clientes/:id', rota(async (req, res) => {
    await exigirClientesLocais();
    const id = idParam(req);
    if (await contarReceitas('ID_CLIENTE', id)) {
      throw new BmapiError('Este cliente já tem receita. Desative-o em vez de excluir.');
    }
    const nf = await consultarUm('SELECT COUNT(*) n FROM NFMESTRE WHERE ID_CLIENTE = :id', { id });
    if (Number(nf?.n || 0)) throw new BmapiError('Este cliente tem notas fiscais no ERP. Desative-o em vez de excluir.');
    await executar('DELETE FROM PESSOAS WHERE ID = :id AND PERFIL_CLI = TRUE', { id });
    res.json({ ok: true });
  }));

  r.get('/rec-config', rota(async (_req: Request, res: Response) => {
    const { tokenNovoRec, ...publico } = await lerRecConfig();
    res.json({ ...publico, temTokenNovoRec: Boolean(tokenNovoRec) });
  }));

  return r;
}
