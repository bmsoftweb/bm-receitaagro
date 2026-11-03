import React, { useEffect, useMemo, useState } from 'react';
import { ListChecks, FileText, Loader2, Save, Pencil, Trash2, CheckCheck, AlertTriangle } from 'lucide-react';
import { get, send, getBlob, qs } from '../services/api';
import { Cadastro } from './Cadastro';
import { Modal } from './Modal';
import { AvisoErro } from './AvisoErro';
import { ConfirmModal } from './ConfirmModal';
import { NumberField } from './NumberField';
import { Selecao } from './Selecao';
import { Toggle } from './Toggle';
import { toast } from './Toast';
import { formatDateBR, formatDateTimeBR } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { BTN_PRIMARIO, BTN_SECUNDARIO, TABELA, TH, TD, TR, BTN_ACAO, BTN_ACAO_EXCLUIR } from '../utils/listaStyles';

/**
 * Conferência do compêndio próprio: tratamentos lidos das bulas do AGROFIT pela Claude
 * (MySQL central receitaagro, scripts/carga-compendio.ts). Salvar um tratamento já o marca como conferido.
 */

interface Produto {
  id: number; registroMapa: string; marca: string; titular: string; classe: string; ingredienteAtivo: string;
  dataBula: string; status: string; aviso: string; tratamentos: number; conferidos: number; inferidos: number;
}

interface Trat {
  id: number; cultura: string; pragaComum: string; pragaCientifico: string; doseMin: number | null; doseMax: number | null;
  unidadeDose: string; volumeCalda: string; aplicMin: number | null; aplicMax: number | null; intervaloAplicDias: number | null;
  carenciaDias: number | null; epocaAplicacao: string; observacao: string; inferido: boolean; conferido: boolean;
  conferidoPor: string; conferidoEm: string;
}

const SITUACOES: [string, string][] = [
  ['', 'Todos'], ['conferir', 'A conferir'], ['aviso', 'Leitura incompleta (aviso)'], ['conferidos', 'Conferidos'],
  ['erro', 'Com erro'], ['sem_bula', 'Sem bula'],
];

const STATUS: Record<string, string> = { erro: 'Erro', incompleto: 'Incompleto', pendente: 'Pendente', sem_bula: 'Sem bula' };

const fmt = (v: number | null) => (v === null || v === undefined ? '–' : v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }));
const faixa = (a: number | null, b: number | null) =>
  a === null ? (b === null ? '–' : `até ${fmt(b)}`) : a === b || b === null ? fmt(a) : `${fmt(a)} – ${fmt(b)}`;
const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const selecionar = (e: React.FocusEvent<HTMLInputElement>) => e.target.select();

/** Abre o PDF numa aba nova: a janela abre antes do download para o navegador não bloquear */
async function abrirBula(p: Produto) {
  const janela = window.open('', '_blank');
  try {
    const blob = await getBlob(`/api/compendio-bulas/produtos/${p.id}/bula`);
    const url = URL.createObjectURL(blob);
    if (janela) janela.location.href = url;
    else {
      // Pop-up bloqueado: baixa o arquivo
      const a = Object.assign(document.createElement('a'), { href: url, download: `bula-${p.registroMapa}.pdf` });
      a.click();
      toast('O navegador bloqueou a aba nova; a bula foi baixada.');
    }
  } catch (e: any) {
    janela?.close();
    toast(e.message);
  }
}

// ---------------- Edição de um tratamento ----------------
const NUMEROS: [keyof Trat, string, number][] = [
  ['doseMin', 'Dose mínima', 4], ['doseMax', 'Dose máxima', 4], ['aplicMin', 'Mín. aplicações', 0], ['aplicMax', 'Máx. aplicações', 0],
  ['intervaloAplicDias', 'Intervalo (dias)', 0],
];

const TratamentoForm: React.FC<{ produto: Produto; inicial: Trat; onFechar: (salvou: boolean) => void }> = ({ produto, inicial, onFechar }) => {
  const [t, setT] = useState<Trat>(inicial);
  // O campo bancário não distingue 0 de vazio: carência nula (UNA) fica num toggle à parte
  const [una, setUna] = useState(inicial.carenciaDias === null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSalvando(true);
      await send('PUT', `/api/compendio-bulas/tratamentos/${t.id}`, { ...t, carenciaDias: una ? null : t.carenciaDias ?? 0, conferido: true });
      onFechar(true);
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };
  const texto = (k: keyof Trat, rotulo: string, max: number, largura = 'sm:col-span-2', obrigatorio = false) => (
    <div className={`col-span-4 ${largura}`}>
      <label className={LABEL_CLASS}>{rotulo}</label>
      <input required={obrigatorio} maxLength={max} value={(t[k] as string) ?? ''} onFocus={selecionar} onChange={(e) => setT({ ...t, [k]: e.target.value })}
        className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} data-obrigatorio={obrigatorio || undefined} />
    </div>
  );
  return (
    <Modal isOpen onClose={() => onFechar(false)} title="Conferir tratamento" subtitle={`${produto.marca} • MAPA ${produto.registroMapa}`} size="xl">
      <form onSubmit={salvar} className="space-y-4">
        {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
        <div className="grid grid-cols-4 gap-3">
          {texto('cultura', 'Cultura', 100, 'sm:col-span-4', true)}
          {texto('pragaComum', 'Praga (nome comum)', 200)}
          {texto('pragaCientifico', 'Praga (nome científico)', 200)}
          {NUMEROS.map(([k, rotulo, casas]) => (
            <div key={k} className="col-span-2 sm:col-span-1">
              <label className={LABEL_CLASS}>{rotulo}</label>
              <div className={FIELD_WRAPPER_CLASS}>
                <NumberField scale={casas} value={(t[k] as number | null) ?? ''} onChange={(v) => setT({ ...t, [k]: v === '' ? null : Number(v) })} className={`${INPUT_CLASS} text-right`} />
              </div>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-1">
            <label className={LABEL_CLASS}>Carência (dias)</label>
            <div className={FIELD_WRAPPER_CLASS}>
              <NumberField scale={0} disabled={una} placeholder={una ? 'UNA' : '0'} value={una ? '' : t.carenciaDias ?? ''} onChange={(v) => setT({ ...t, carenciaDias: v === '' ? null : Number(v) })} className={`${INPUT_CLASS} text-right`} />
            </div>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-end pb-1.5">
            <Toggle checked={una} onChange={setUna} label="Não determinada (UNA)" size="sm" />
          </div>
          {texto('unidadeDose', 'Unidade da dose', 50)}
          {texto('volumeCalda', 'Volume de calda', 100)}
          <div className="col-span-4">
            <label className={LABEL_CLASS}>Época de aplicação</label>
            <textarea rows={2} value={t.epocaAplicacao} onChange={(e) => setT({ ...t, epocaAplicacao: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} resize-y`} />
          </div>
          <div className="col-span-4">
            <label className={LABEL_CLASS}>Observação</label>
            <textarea rows={3} value={t.observacao} onChange={(e) => setT({ ...t, observacao: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} resize-y`} />
          </div>
        </div>
        <p className="text-[11px] text-stone-400">Salvar marca o tratamento como conferido.</p>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
          <button type="button" onClick={() => abrirBula(produto)} className={`${BTN_SECUNDARIO} mr-auto`}><FileText className="w-3.5 h-3.5" />Ver bula</button>
          <button type="button" onClick={() => onFechar(false)} className={BTN_SECUNDARIO}>Cancelar</button>
          <button type="submit" disabled={salvando} className={BTN_PRIMARIO}>{salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Salvar e conferir</button>
        </div>
      </form>
    </Modal>
  );
};

// ---------------- Tratamentos de um produto ----------------
const TratamentosModal: React.FC<{ produto: Produto; onFechar: () => void }> = ({ produto, onFechar }) => {
  const [lista, setLista] = useState<Trat[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const [editando, setEditando] = useState<Trat | null>(null);
  const [excluir, setExcluir] = useState<Trat | null>(null);
  const [processando, setProcessando] = useState(false);
  const carregar = () => get<Trat[]>(`/api/compendio-bulas/produtos/${produto.id}/tratamentos`).then(setLista).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, [produto.id]);

  const visiveis = useMemo(() => {
    const f = sem(filtro);
    return (lista || []).filter((t) => (!soPendentes || !t.conferido) && (!f || sem(`${t.cultura} ${t.pragaComum} ${t.pragaCientifico}`).includes(f)));
  }, [lista, filtro, soPendentes]);
  const pendentesVisiveis = visiveis.filter((t) => !t.conferido);

  const alternar = async (t: Trat, conferido: boolean) => {
    try {
      await send('PUT', `/api/compendio-bulas/tratamentos/${t.id}`, { ...t, conferido });
      carregar();
    } catch (e: any) {
      setErro(e.message);
    }
  };
  const conferirVisiveis = async () => {
    try {
      setProcessando(true);
      const r = await send<{ conferidos: number }>('POST', `/api/compendio-bulas/produtos/${produto.id}/conferir`, { ids: pendentesVisiveis.map((t) => t.id) });
      toast(`${r.conferidos} tratamento(s) conferido(s).`);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessando(false);
    }
  };
  const confirmarExclusao = async () => {
    try {
      setProcessando(true);
      await send('DELETE', `/api/compendio-bulas/tratamentos/${excluir!.id}`);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessando(false);
      setExcluir(null);
    }
  };

  const conferidos = lista?.filter((t) => t.conferido).length || 0;
  return (
    <Modal isOpen onClose={onFechar} title="Conferência dos tratamentos" subtitle={`${produto.marca} • MAPA ${produto.registroMapa} • ${conferidos} de ${lista?.length ?? '…'} conferido(s)`} size="full"
      footer={<>
        <button type="button" onClick={() => abrirBula(produto)} className={`${BTN_SECUNDARIO} mr-auto`}><FileText className="w-3.5 h-3.5" />Ver bula</button>
        <button type="button" disabled={processando || !pendentesVisiveis.length} onClick={conferirVisiveis} title="Marca como conferidos os tratamentos pendentes da lista abaixo (respeita o filtro)" className={BTN_PRIMARIO}>
          {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}Conferir {pendentesVisiveis.length} pendente(s)
        </button>
      </>}>
      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
      {produto.aviso && (
        <div className="mb-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400"><AlertTriangle className="w-3.5 h-3.5" />Leitura possivelmente incompleta: {produto.aviso}. Compare com a bula.</div>
      )}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} onFocus={selecionar} placeholder="Filtrar por cultura ou praga…" className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} max-w-sm`} />
        <Toggle checked={soPendentes} onChange={setSoPendentes} label="Só pendentes" size="sm" />
        <span className="text-[11px] text-stone-400">{visiveis.length} linha(s)</span>
      </div>
      {lista === null ? (
        <div className="text-xs text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Carregando…</div>
      ) : (
        <div className="overflow-auto max-h-[60vh]">
          <table className={TABELA}>
            <thead className="sticky top-0 z-10">
              <tr>
                {['Cultura', 'Praga', 'Dose', 'Unidade', 'Calda', 'Aplic.', 'Intervalo', 'Carência', 'Inferido', 'Conferido', 'Ações'].map((h) => <th key={h} className={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((t) => (
                <tr key={t.id} className={TR} onDoubleClick={() => setEditando(t)}>
                  <td className={TD}>{t.cultura}</td>
                  <td className={TD}>{t.pragaComum || '–'} {t.pragaCientifico && <i className="text-stone-400">{t.pragaCientifico}</i>}</td>
                  <td className={`${TD} text-right font-mono`}>{faixa(t.doseMin, t.doseMax)}</td>
                  <td className={TD}>{t.unidadeDose}</td>
                  <td className={`${TD} max-w-48 truncate`} title={t.volumeCalda}>{t.volumeCalda || '–'}</td>
                  <td className={`${TD} text-right font-mono`}>{faixa(t.aplicMin, t.aplicMax)}</td>
                  <td className={`${TD} text-right font-mono`}>{fmt(t.intervaloAplicDias)}</td>
                  <td className={`${TD} text-right font-mono`} title={t.carenciaDias === null ? t.observacao : undefined}>{t.carenciaDias === null ? 'UNA/ND' : t.carenciaDias}</td>
                  <td className={`${TD} text-center`}>{t.inferido ? <span title="Valor deduzido de célula mesclada ou de outra parte da bula" className="text-amber-600">sim</span> : ''}</td>
                  <td className={`${TD} text-center`} title={t.conferido ? `${t.conferidoPor} em ${formatDateTimeBR(t.conferidoEm)}` : 'Pendente'}>
                    <Toggle checked={t.conferido} onChange={(v) => alternar(t, v)} size="sm" />
                  </td>
                  <td className={`${TD} text-center`}>
                    <button type="button" title="Editar: corrigir e conferir o tratamento" className={BTN_ACAO} onClick={() => setEditando(t)}><Pencil className="w-3.5 h-3.5" /></button>
                    <button type="button" title="Excluir: tratamento que não está na bula" className={BTN_ACAO_EXCLUIR} onClick={() => setExcluir(t)}><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
              {!visiveis.length && <tr><td colSpan={11} className={`${TD} text-center text-stone-400 py-8`}>Nenhum tratamento{filtro || soPendentes ? ' com este filtro' : ''}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {editando && <TratamentoForm produto={produto} inicial={editando} onFechar={(salvou) => { setEditando(null); if (salvou) carregar(); }} />}
      {excluir && (
        <ConfirmModal
          titulo="Excluir tratamento"
          mensagem={<>Excluir o tratamento de <strong>{excluir.cultura} / {excluir.pragaComum || excluir.pragaCientifico}</strong>? Use quando a leitura trouxe uma linha que não está na bula.</>}
          processando={processando}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setExcluir(null)}
        />
      )}
    </Modal>
  );
};

// ---------------- Tela ----------------
export const CompendioBulasView: React.FC = () => {
  const [situacao, setSituacao] = useState('conferir');
  const [aberto, setAberto] = useState<Produto | null>(null);
  const [recarga, setRecarga] = useState(0);
  return (
    <>
      <Cadastro<Produto>
        nome="produto"
        titulo="Compêndio das bulas"
        somenteLeitura="Lido das bulas do AGROFIT; corrija na conferência dos tratamentos"
        podeIncluir={false}
        chaveRecarga={`${situacao}|${recarga}`}
        carregar={(q) => get<Produto[]>(`/api/compendio-bulas/produtos${qs({ q, situacao })}`)}
        descrever={(p) => p.marca}
        barra={
          <div className="w-56">
            <Selecao value={situacao} onChange={(e) => setSituacao(e.target.value)} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
              {SITUACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
          </div>
        }
        colunas={[
          { titulo: 'Registro MAPA', valor: (p) => p.registroMapa, classe: 'text-right font-mono' },
          { titulo: 'Marca', valor: (p) => <span className="font-semibold">{p.marca}</span> },
          { titulo: 'Classe', valor: (p) => p.classe },
          { titulo: 'Titular', valor: (p) => <span className="max-w-64 truncate inline-block align-bottom" title={p.titular}>{p.titular}</span> },
          { titulo: 'Data da bula', valor: (p) => formatDateBR(p.dataBula), classe: 'text-center' },
          { titulo: 'Tratamentos', valor: (p) => p.tratamentos, classe: 'text-right font-mono' },
          { titulo: 'Conferidos', valor: (p) => p.conferidos, classe: 'text-right font-mono' },
          {
            titulo: 'Situação', classe: 'text-center',
            valor: (p) => STATUS[p.status]
              ? <span className="text-rose-600" title={p.aviso}>{STATUS[p.status]}</span>
              : p.aviso
                ? <span className="text-amber-600" title={p.aviso}>Aviso</span>
                : p.tratamentos && p.conferidos === p.tratamentos
                  ? <span className="text-emerald-700 dark:text-emerald-400">Conferido</span>
                  : p.conferidos ? 'Parcial' : 'A conferir',
          },
        ]}
        campos={[]}
        novo={() => ({})}
        salvar={async () => {}}
        acoes={[
          { icone: ListChecks, titulo: 'Conferir', descricao: 'tratamentos lidos da bula', semRecarga: true, executar: (p) => setAberto(p) },
          { icone: FileText, titulo: 'Ver bula', descricao: 'PDF guardado na carga', semRecarga: true, executar: (p) => { abrirBula(p); } },
        ]}
      />
      {aberto && <TratamentosModal produto={aberto} onFechar={() => { setAberto(null); setRecarga((n) => n + 1); }} />}
    </>
  );
};
