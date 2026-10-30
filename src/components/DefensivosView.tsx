import React, { useEffect, useRef, useState } from 'react';
import {
  Package, Link2, ListChecks, CloudDownload, Eraser, Copy, RefreshCw, Wrench, Loader2, Plus, Trash2, Save, Pencil, Layers,
} from 'lucide-react';
import { get, send, qs } from '../services/api';
import { Cadastro } from './Cadastro';
import { Modal } from './Modal';
import { AvisoErro } from './AvisoErro';
import { toast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { useProgresso, ProgressoModal } from './ProgressoModal';
import { Andamento } from '../services/api';
import { NumberField } from './NumberField';
import { Pesquisa } from './Pesquisa';
import { Opcao, Tratamento } from '../types';
import { formatDecimal } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { BTN_PRIMARIO, BTN_SECUNDARIO, TABELA, TH, TD, TR, BTN_ACAO, BTN_ACAO_EXCLUIR } from '../utils/listaStyles';

interface Defensivo {
  id: number; nome: string; registroMapa: string; ativo: boolean; idDef: number; idBm: number; idCidasc: number;
  cidascManual: boolean; tratamentos: number;
}

/** Erro com "x" e fechamento automático (AvisoErro do crmWeb) */
const Erro: React.FC<{ msg: string | null; onFechar: () => void }> = ({ msg, onFechar }) =>
  msg ? <AvisoErro mensagem={msg} onFechar={onFechar} /> : null;

// ---------------- Produtos do ERP (ufrmProBM) ----------------
const ProdutosErpModal: React.FC<{ def: Defensivo; onFechar: () => void }> = ({ def, onFechar }) => {
  const [lista, setLista] = useState<Opcao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    get<{ id: number; descricao: string; un: string }[]>(`/api/defensivos/${def.id}/bm`)
      .then((l) => setLista(l.map((p) => ({ id: p.id, descricao: `${p.descricao} (${p.un})` }))))
      .catch((e) => setErro(e.message));
  }, [def.id]);
  const salvar = async () => {
    try {
      setSalvando(true);
      await send('PUT', `/api/defensivos/${def.id}/bm`, { ids: lista.map((p) => p.id) });
      onFechar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal isOpen onClose={onFechar} title="Produtos do ERP" subtitle={def.nome} size="lg"
      footer={<>
        <button type="button" onClick={onFechar} className={BTN_SECUNDARIO}>Cancelar</button>
        <button type="button" onClick={salvar} disabled={salvando} className={BTN_PRIMARIO}>{salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Salvar</button>
      </>}>
      {/* Altura mínima: a lista da pesquisa abre dentro do modal */}
      <div className="min-h-[26rem] flex flex-col gap-3">
      <Erro msg={erro} onFechar={() => setErro(null)} />
      <label className={LABEL_CLASS}>Adicionar produto</label>
      <Pesquisa
        valor={null}
        buscar={async (q) => (await get<{ id: number; descricao: string; un: string }[]>(`/api/produtos-erp${qs({ q })}`)).map((p) => ({ id: p.id, descricao: `${p.descricao} (${p.un})` }))}
        onEscolher={(o) => setLista((l) => (l.some((x) => x.id === o.id) ? l : [...l, o]))}
      />
      <table className={TABELA}>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} className={TR}>
              <td className={`${TD} text-right font-mono w-16`}>{p.id}</td>
              <td className={TD}>{p.descricao}</td>
              <td className={`${TD} w-10 text-center`}>
                {/* Remoção só na lista da tela; vale ao salvar */}
                <button type="button" title="Remover da lista" className={BTN_ACAO_EXCLUIR} onClick={() => setLista((l) => l.filter((x) => x.id !== p.id))}><Trash2 className="w-3.5 h-3.5" /></button>
              </td>
            </tr>
          ))}
          {!lista.length && <tr><td className={`${TD} text-stone-400`}>Nenhum produto associado.</td></tr>}
        </tbody>
      </table>
      </div>
    </Modal>
  );
};

// ---------------- Vínculo CIDASC (ufrmProCIDASC) ----------------
const CidascModal: React.FC<{ def: Defensivo; onFechar: () => void }> = ({ def, onFechar }) => {
  const [erro, setErro] = useState<string | null>(null);
  const escolher = async (o: Opcao & { mapa?: string }) => {
    try {
      await send('PUT', `/api/defensivos/${def.id}/cidasc`, { idCidasc: o.id, registroMapa: o.mapa || def.registroMapa });
      onFechar();
    } catch (e: any) {
      setErro(e.message);
    }
  };
  return (
    <Modal isOpen onClose={onFechar} title="Vincular à CIDASC" subtitle={`${def.nome} • MAPA ${def.registroMapa || '–'} • atual ${def.idCidasc || 'sem vínculo'}`} size="lg">
      <div className="min-h-[26rem] flex flex-col gap-3">
      <Erro msg={erro} onFechar={() => setErro(null)} />
      <label className={LABEL_CLASS}>Marca comercial ou registro MAPA</label>
      <Pesquisa
        valor={null}
        placeholder={def.registroMapa || def.nome}
        buscar={async (q) => (await get<{ id: number; nome: string; registroMapa: string; situacao: string }[]>(`/api/cidasc/defensivos${qs({ q: q || def.registroMapa || def.nome })}`))
          .map((c) => ({ id: c.id, mapa: c.registroMapa, descricao: `${c.id} • ${c.nome} • MAPA ${c.registroMapa} ${c.situacao ? `(${c.situacao})` : ''}` }))}
        onEscolher={escolher}
      />
      <p className="text-[11px] text-stone-400">O vínculo manual não é sobrescrito pela atualização automática.</p>
      </div>
    </Modal>
  );
};

// ---------------- Tratamentos ----------------
const MEMOS: [string, string][] = [
  ['modo_aplicacao', 'Modo de aplicação'], ['equip_aplicacao', 'Equipamento'], ['prevencao', 'Prevenção'], ['antidoto', 'Antídoto'],
  ['incompatibilidade', 'Incompatibilidade'], ['precaucoes_uso', 'Precauções'], ['epi', 'EPI'], ['risco', 'Risco'],
];

const NUM: [keyof Tratamento, string, number][] = [
  ['seq', 'Seq.', 0], ['doseMinima', 'Dose mínima', 4], ['doseMaxima', 'Dose máxima', 4], ['volumeCalda', 'Calda terrestre (L/ha)', 0],
  ['volumeCaldaAerea', 'Calda aérea (L/ha)', 0], ['minimoAplicacoes', 'Mín. aplicações', 0], ['maximoAplicacoes', 'Máx. aplicações', 0],
  ['intervaloSeguranca', 'Carência (dias)', 0],
];
const TXT: [keyof Tratamento, string, number][] = [
  ['unidadeAplicacao', 'Unidade da dose', 30], ['classificacaoToxicologica', 'Classe toxicológica', 200], ['nomeIngredientes', 'Ingredientes', 500],
  ['estagioCultura', 'Estágio da cultura', 50], ['estagioProblema', 'Estágio da praga', 50], ['localAplicacao', 'Local de aplicação', 200],
  ['modalidadeAplicacao', 'Modalidade', 80], ['frase1', 'Frase 1', 500], ['frase2', 'Frase 2', 500],
];

const buscarComp = (tipo: 'culturas' | 'pragas') => async (q: string) =>
  (await get<{ itens: { id: number; nome: string; nomeCientifico: string }[] }>(`/api/${tipo}${qs({ q })}`)).itens
    .slice(0, 50).map((i) => ({ id: i.id, descricao: i.nomeCientifico && tipo === 'pragas' ? `${i.nome} (${i.nomeCientifico})` : i.nome }));

const TratamentoForm: React.FC<{ def: Defensivo; inicial: Partial<Tratamento>; onFechar: (salvou: boolean) => void }> = ({ def, inicial, onFechar }) => {
  const [t, setT] = useState<Partial<Tratamento>>(inicial);
  const [memos, setMemos] = useState<Record<string, string> | null>(inicial.id ? null : Object.fromEntries(MEMOS.map(([k]) => [k, ''])));
  const [aba, setAba] = useState('dados');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (inicial.id) get<Record<string, string>>(`/api/tratamentos/${inicial.id}/memos`).then(setMemos).catch((e) => setErro(e.message));
  }, [inicial.id]);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSalvando(true);
      const corpo = { ...t, memos: memos || undefined };
      await send(t.id ? 'PUT' : 'POST', t.id ? `/api/tratamentos/${t.id}` : `/api/defensivos/${def.id}/tratamentos`, corpo);
      onFechar(true);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };
  const abas = [['dados', 'Dados'], ...MEMOS];
  return (
    <Modal isOpen onClose={() => onFechar(false)} title={t.id ? 'Editar tratamento' : 'Novo tratamento'} subtitle={def.nome} size="xl">
      <form onSubmit={salvar} className="space-y-4">
        <Erro msg={erro} onFechar={() => setErro(null)} />
        <div className="flex flex-wrap gap-1 border-b border-stone-200 dark:border-stone-800">
          {abas.map(([k, r]) => (
            <button key={k} type="button" onClick={() => setAba(k)} className={`px-3 py-1.5 text-xs font-semibold border-b-2 cursor-pointer ${aba === k ? 'border-amber-500 text-amber-700 dark:text-amber-400' : 'border-transparent text-stone-500'}`}>{r}</button>
          ))}
        </div>
        {aba === 'dados' ? (
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-4 sm:col-span-2">
              <label className={LABEL_CLASS}>Cultura</label>
              <Pesquisa obrigatorio valor={t.idCultura ? { id: t.idCultura, descricao: t.cultura || '' } : null} buscar={buscarComp('culturas')} onEscolher={(o) => setT({ ...t, idCultura: o.id, cultura: o.descricao })} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <label className={LABEL_CLASS}>Praga</label>
              <Pesquisa obrigatorio valor={t.idPraga ? { id: t.idPraga, descricao: t.praga || '' } : null} buscar={buscarComp('pragas')} onEscolher={(o) => setT({ ...t, idPraga: o.id, praga: o.descricao })} />
            </div>
            {NUM.map(([k, r, casas]) => (
              <div key={k} className="col-span-2 sm:col-span-1">
                <label className={LABEL_CLASS}>{r}</label>
                <div className={FIELD_WRAPPER_CLASS}>
                  <NumberField scale={casas} value={(t[k] as number) ?? ''} onChange={(v) => setT({ ...t, [k]: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} />
                </div>
              </div>
            ))}
            {TXT.map(([k, r, max]) => (
              <div key={k} className={`col-span-4 ${max > 100 ? 'sm:col-span-4' : 'sm:col-span-2'}`}>
                <label className={LABEL_CLASS}>{r}</label>
                <input maxLength={max} value={(t[k] as string) ?? ''} onChange={(e) => setT({ ...t, [k]: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
              </div>
            ))}
          </div>
        ) : memos === null ? (
          <div className="text-xs text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Carregando textos…</div>
        ) : (
          <textarea rows={14} value={memos[aba] || ''} onChange={(e) => setMemos({ ...memos, [aba]: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} resize-y`} />
        )}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
          <button type="button" onClick={() => onFechar(false)} className={BTN_SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={salvando || (Boolean(t.id) && memos === null)} className={BTN_PRIMARIO}>{salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Salvar</button>
        </div>
      </form>
    </Modal>
  );
};

const TratamentosModal: React.FC<{ def: Defensivo; onFechar: () => void }> = ({ def, onFechar }) => {
  const [lista, setLista] = useState<Tratamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Tratamento> | null>(null);
  const [excluir, setExcluir] = useState<Tratamento | 'todos' | null>(null);
  const [processando, setProcessando] = useState(false);
  const carregar = () => get<Tratamento[]>(`/api/defensivos/${def.id}/tratamentos`).then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, [def.id]);
  const confirmar = async () => {
    try {
      setProcessando(true);
      await send('DELETE', excluir === 'todos' ? `/api/defensivos/${def.id}/tratamentos` : `/api/tratamentos/${(excluir as Tratamento).id}`);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessando(false);
      setExcluir(null);
    }
  };
  return (
    <Modal isOpen onClose={onFechar} title="Tratamentos (dosagens)" subtitle={def.nome} size="full"
      footer={<>
        {Boolean(lista?.length) && <button type="button" onClick={() => setExcluir('todos')} className={`${BTN_SECUNDARIO} text-rose-600`}><Trash2 className="w-3.5 h-3.5" />Excluir todos</button>}
        <button type="button" onClick={() => setEditando({ idProduto: def.id, seq: (lista?.length || 0) + 1 })} className={BTN_PRIMARIO}><Plus className="w-3.5 h-3.5" />Novo</button>
      </>}>
      <Erro msg={erro} onFechar={() => setErro(null)} />
      {lista === null ? (
        <div className="text-xs text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Carregando…</div>
      ) : (
        <div className="overflow-auto">
          <table className={TABELA}>
            <thead>
              <tr>
                {['Cultura', 'Praga', 'Seq.', 'Dose mín.', 'Dose máx.', 'Unidade', 'Calda', 'Aplic.', 'Carência', ''].map((h) => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id} className={TR} onDoubleClick={() => setEditando(t)}>
                  <td className={TD}>{t.cultura}</td>
                  <td className={TD}>{t.praga} <i className="text-stone-400">{t.pragaCientifico}</i></td>
                  <td className={`${TD} text-right font-mono`}>{t.seq}</td>
                  <td className={`${TD} text-right font-mono`}>{formatDecimal(t.doseMinima, 4)}</td>
                  <td className={`${TD} text-right font-mono`}>{formatDecimal(t.doseMaxima, 4)}</td>
                  <td className={TD}>{t.unidadeAplicacao}</td>
                  <td className={`${TD} text-right font-mono`}>{t.volumeCalda || '–'}</td>
                  <td className={`${TD} text-right font-mono`}>{t.minimoAplicacoes}–{t.maximoAplicacoes}</td>
                  <td className={`${TD} text-right font-mono`}>{t.intervaloSeguranca}</td>
                  <td className={`${TD} text-center`}>
                    <button type="button" title="Editar: alterar tratamento" className={BTN_ACAO} onClick={() => setEditando(t)}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Excluir: excluir tratamento" className={BTN_ACAO_EXCLUIR} onClick={() => setExcluir(t)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={10} className={`${TD} text-center text-stone-400 py-8`}>Nenhum tratamento. Use "Buscar tratamentos" na lista ou inclua à mão.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editando && <TratamentoForm def={def} inicial={editando} onFechar={(salvou) => { setEditando(null); if (salvou) carregar(); }} />}
      {excluir && (
        <ConfirmModal
          titulo="Excluir tratamento"
          mensagem={excluir === 'todos' ? <>Excluir <strong>todos</strong> os tratamentos de {def.nome}?</> : <>Excluir o tratamento de <strong>{excluir.cultura} / {excluir.praga}</strong>?</>}
          processando={processando}
          onConfirmar={confirmar}
          onCancelar={() => setExcluir(null)}
        />
      )}
    </Modal>
  );
};

// ---------------- Tela ----------------
export const DefensivosView: React.FC = () => {
  const [dialogo, setDialogo] = useState<{ tipo: 'bm' | 'cidasc' | 'trat'; def: Defensivo } | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<{ produtos: number; linhas: number; conflitos: number } | null>(null);
  const progresso = useProgresso();
  const [confirmarTodos, setConfirmarTodos] = useState(false);
  const [lote, setLote] = useState<Andamento | null>(null);
  const parar = useRef(false);

  /** Buscar tratamentos de todos os defensivos ativos: um por chamada, para não estourar o tempo da rota */
  const buscarTodos = async () => {
    setConfirmarTodos(false);
    setOcupado('todos');
    parar.current = false;
    try {
      setLote({ etapa: 'Lendo os defensivos', feitos: 0, total: 0 });
      const defs = await get<{ id: number; nome: string }[]>('/api/defensivos/ativos');
      let feitos = 0, tratamentos = 0, erros = 0, seguidos = 0;
      for (const d of defs) {
        if (parar.current) break;
        setLote({ etapa: d.nome, feitos, total: defs.length });
        try {
          tratamentos += (await send<{ consultas: number }>('POST', `/api/defensivos/${d.id}/buscar-tratamentos`)).consultas;
          seguidos = 0;
        } catch (e: any) {
          erros++;
          if (++seguidos >= 5) throw new Error(`Parou depois de 5 erros seguidos (${feitos} de ${defs.length} feitos): ${e.message}`);
        }
        feitos++;
      }
      toast(`${parar.current ? 'Interrompido: ' : ''}tratamentos de ${feitos} de ${defs.length} defensivo(s) atualizados (${tratamentos} tratamento(s)${erros ? `, ${erros} defensivo(s) com erro` : ''}).`);
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setLote(null);
      setOcupado(null);
      setRecarga((n) => n + 1);
    }
  };

  const acaoGeral = async (nome: string, url: string, msg: (r: any) => string) => {
    try {
      setOcupado(nome);
      toast(msg(await send('POST', url)));
      setRecarga((n) => n + 1);
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setOcupado(null);
    }
  };
  /** Ação longa com o modal de progresso */
  const acaoProgresso = async (nome: string, titulo: string, url: string, msg: (r: any) => string) => {
    try {
      setOcupado(nome);
      toast(msg(await progresso.executar(titulo, url)));
      setRecarga((n) => n + 1);
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setOcupado(null);
    }
  };
  const fechar = () => { setDialogo(null); setRecarga((n) => n + 1); };

  /** Primeiro a prévia (nada é apagado), depois a confirmação */
  const verDuplicados = async () => {
    try {
      setOcupado('duplicados');
      const r = await send<{ produtos: number; linhas: number; conflitos: number }>('POST', '/api/defensivos/limpar-duplicados?simular=S');
      if (r.linhas) setDuplicados(r);
      else toast(r.conflitos ? `Nenhuma linha a apagar; ${r.conflitos} produto(s) com linhas de dados diferentes ficam como estão.` : 'Nenhuma linha duplicada.');
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setOcupado(null);
    }
  };
  const limparDuplicados = async () => {
    setDuplicados(null);
    await acaoGeral('duplicados', '/api/defensivos/limpar-duplicados', (r) => `${r.linhas} linha(s) duplicada(s) apagada(s).`);
  };

  return (
    <>
      {aviso && <AvisoErro mensagem={aviso} onFechar={() => setAviso(null)} className="mx-4 mt-3 shrink-0" />}
      <Cadastro<Defensivo>
        nome="defensivo"
        titulo="Defensivos"
        chaveRecarga={String(recarga)}
        carregar={async (q) => (await get<{ defensivos: Defensivo[] }>(`/api/defensivos${qs({ q })}`)).defensivos}
        descrever={(d) => d.nome}
        barra={<>
          <button type="button" disabled={Boolean(ocupado)} onClick={() => acaoProgresso('api', 'Atualizando da API do Novo Receituário', '/api/defensivos/atualizar', (r: { defensivos: number; culturas: number; pragas: number; desde: string }) => `Catálogo atualizado${r.desde ? ` (alterações desde ${r.desde.split('-').reverse().join('/')})` : ''}: ${r.defensivos} defensivo(s), ${r.culturas} cultura(s) e ${r.pragas} praga(s).`)} title="Baixar produtos, culturas e pragas do Novo Receituário" className={BTN_SECUNDARIO}>
            {ocupado === 'api' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}Atualizar da API
          </button>
          <button type="button" disabled={Boolean(ocupado)} onClick={() => setConfirmarTodos(true)} title="Baixar as dosagens de todos os defensivos ativos na API do Novo Receituário" className={BTN_SECUNDARIO}>
            {ocupado === 'todos' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}Buscar tratamentos
          </button>
          <button type="button" disabled={Boolean(ocupado)} onClick={() => acaoGeral('acertar', '/api/defensivos/acertar-tabelas', () => 'Tabelas acertadas.')} title="Refazer os vínculos entre culturas, pragas e produtos" className={BTN_SECUNDARIO}>
            {ocupado === 'acertar' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}Acertar tabelas
          </button>
          <button type="button" disabled={Boolean(ocupado)} onClick={verDuplicados} title="Apagar as linhas repetidas do mesmo produto na ponte REC_DEFENSIVOS" className={BTN_SECUNDARIO}>
            {ocupado === 'duplicados' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}Limpar duplicados
          </button>
        </>}
        colunas={[
          { titulo: 'ID', valor: (d) => d.id, classe: 'text-right font-mono' },
          { titulo: 'Nome', valor: (d) => <span className={`font-semibold ${d.ativo ? '' : 'line-through text-stone-400'}`}>{d.nome}</span> },
          { titulo: 'Registro MAPA', valor: (d) => d.registroMapa, classe: 'font-mono' },
          { titulo: 'ID CIDASC', valor: (d) => (d.idCidasc ? `${d.idCidasc}${d.cidascManual ? ' (manual)' : ''}` : <span className="text-rose-600">sem vínculo</span>), classe: 'text-right font-mono' },
          { titulo: 'Produto ERP', valor: (d) => (d.idBm ? d.idBm : '–'), classe: 'text-right font-mono' },
          { titulo: 'Tratamentos', valor: (d) => d.tratamentos, classe: 'text-right font-mono' },
        ]}
        campos={[
          { chave: 'nome', rotulo: 'Nome', obrigatorio: true, max: 80, maiusculo: true, largura: 3 },
          { chave: 'registroMapa', rotulo: 'Registro MAPA', max: 15, largura: 1 },
          { chave: 'ativo', rotulo: 'Ativo', tipo: 'toggle', largura: 1 },
        ]}
        novo={() => ({ nome: '', registroMapa: '', ativo: true })}
        salvar={async (d) => { await send(d.id ? 'PUT' : 'POST', d.id ? `/api/defensivos/${d.id}` : '/api/defensivos', d); }}
        excluir={async (d) => { await send('DELETE', `/api/defensivos/${d.id}`); }}
        acoes={[
          { icone: ListChecks, titulo: 'Tratamentos', descricao: 'dosagens por cultura e praga', semRecarga: true, executar: (def) => setDialogo({ tipo: 'trat', def }) },
          { icone: Package, titulo: 'Produtos do ERP', descricao: 'associar produtos do BMsoft', semRecarga: true, executar: (def) => setDialogo({ tipo: 'bm', def }) },
          { icone: Link2, titulo: 'Vincular CIDASC', descricao: 'escolher o agrotóxico na tabela da CIDASC', semRecarga: true, executar: (def) => setDialogo({ tipo: 'cidasc', def }) },
          {
            icone: CloudDownload, titulo: 'Buscar tratamentos', descricao: 'baixar as dosagens na API do Novo Receituário',
            executar: async (d) => (toast(`Buscando os tratamentos de ${d.nome} na API…`), `Tratamentos de ${d.nome} atualizados (${(await send<{ consultas: number }>('POST', `/api/defensivos/${d.id}/buscar-tratamentos`)).consultas} tratamento(s)).`),
          },
          {
            icone: Eraser, titulo: 'Limpar consulta', descricao: 'a próxima receita consulta a API de novo',
            executar: async (d) => { await send('POST', `/api/defensivos/${d.id}/limpar-consulta`); return 'Data da última consulta limpa.'; },
          },
          {
            icone: Copy, titulo: 'Duplicar', descricao: 'cópia manual com todos os tratamentos',
            executar: async (d) => { await send('POST', `/api/defensivos/${d.id}/duplicar`); return `${d.nome} duplicado.`; },
          },
        ]}
      />
      {dialogo?.tipo === 'bm' && <ProdutosErpModal def={dialogo.def} onFechar={fechar} />}
      {dialogo?.tipo === 'cidasc' && <CidascModal def={dialogo.def} onFechar={fechar} />}
      {dialogo?.tipo === 'trat' && <TratamentosModal def={dialogo.def} onFechar={fechar} />}
      {progresso.modal}
      {lote && <ProgressoModal titulo="Buscando os tratamentos de todos os defensivos" andamento={lote} onParar={() => { parar.current = true; setLote({ ...lote, etapa: 'Parando depois deste defensivo…' }); }} />}
      {confirmarTodos && (
        <ConfirmModal
          titulo="Buscar tratamentos"
          mensagem={<>Buscar na API os tratamentos de <strong>todos os defensivos ativos</strong>? São milhares de produtos e pode levar horas; dá para parar a qualquer momento e o que já foi feito fica gravado.</>}
          textoConfirmar="Buscar tratamentos"
          onConfirmar={buscarTodos}
          onCancelar={() => setConfirmarTodos(false)}
        />
      )}
      {duplicados && (
        <ConfirmModal
          titulo="Limpar duplicados"
          mensagem={<>
            Apagar <strong>{duplicados.linhas}</strong> linha(s) repetida(s) de {duplicados.produtos} produto(s)? Fica em cada produto a linha com
            código CIDASC e produto do ERP; associações e receitas passam para ela.
            {duplicados.conflitos > 0 && <> {duplicados.conflitos} produto(s) têm linhas com dados diferentes (outro código CIDASC ou produto do ERP), que ficam como estão.</>}
          </>}
          textoConfirmar="Apagar duplicados"
          onConfirmar={limparDuplicados}
          onCancelar={() => setDuplicados(null)}
        />
      )}
    </>
  );
};
