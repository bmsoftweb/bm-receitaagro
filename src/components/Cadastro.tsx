import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, Plus, Search, Pencil, Trash2, RefreshCw, Loader2, Save, ChevronRight, Inbox } from 'lucide-react';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import {
  PAINEL, BARRA, BARRA_INFO, BTN_PRIMARIO, BTN_SECUNDARIO, GRADE_AREA, TABELA, TH, TH_INDICADOR,
  TH_ACOES, TR, TD, TD_INDICADOR, TD_ACOES, INDICADOR, TD_VAZIO,
} from '../utils/listaStyles';
import { Modal } from './Modal';
import { AvisoErro } from './AvisoErro';
import { toast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { NumberField } from './NumberField';
import { Toggle } from './Toggle';
import { BotaoAcao, MenuAcoes, SeparadorAcoes } from './MenuAcoes';
import { Opcao } from '../types';

/**
 * Tela de cadastro padrão (lista + formulário em modal + exclusão com confirmação).
 * Profissionais, ARTs, observações, diagnósticos, clientes, culturas e pragas usam esta tela.
 */

export interface Campo<T> {
  chave: keyof T & string;
  rotulo: string;
  tipo?: 'texto' | 'digitos' | 'inteiro' | 'decimal' | 'select' | 'toggle' | 'textarea' | 'senha';
  obrigatorio?: boolean;
  max?: number;
  opcoes?: Opcao[];
  /** Colunas ocupadas na grade de 4 do formulário */
  largura?: 1 | 2 | 3 | 4;
  dica?: string;
  maiusculo?: boolean;
}

export interface Coluna<T> {
  titulo: string;
  valor: (t: T) => React.ReactNode;
  /** text-right para números, text-center para datas */
  classe?: string;
}

export interface AcaoExtra<T> {
  icone: React.ComponentProps<typeof BotaoAcao>['icone'];
  titulo: string;
  descricao: string;
  tom?: 'normal' | 'verde' | 'perigo';
  executar: (t: T) => Promise<string | void> | void;
  /** Ação só abre um diálogo: não recarrega a lista */
  semRecarga?: boolean;
}

interface Props<T extends { id: number }> {
  /** Nome no singular, minúsculo: "profissional" */
  nome: string;
  carregar: (q: string) => Promise<T[]>;
  colunas: Coluna<T>[];
  campos: Campo<T>[];
  novo: () => Partial<T>;
  salvar: (item: Partial<T>) => Promise<void>;
  excluir?: (item: T) => Promise<void>;
  descrever: (t: T) => string;
  acoes?: AcaoExtra<T>[];
  /** Texto exibido quando a tela não permite incluir/alterar (ex.: clientes mantidos no BMsoft) */
  somenteLeitura?: string | null;
  tamanho?: 'sm' | 'md' | 'lg' | 'xl';
  /** Campos extras do formulário (pesquisa CIDASC etc.) */
  extraFormulario?: (item: Partial<T>, alterar: (p: Partial<T>) => void) => React.ReactNode;
  /** Filtra no navegador (endpoint sem busca) */
  filtroLocal?: boolean;
  /** Muda para recarregar (filtros externos) */
  chaveRecarga?: string;
  barra?: React.ReactNode;
  /** false: registros vêm só da API (culturas, pragas) */
  podeIncluir?: boolean;
}

export function Cadastro<T extends { id: number }>(p: Props<T>) {
  const [lista, setLista] = useState<T[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<T> | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<T | null>(null);
  const [processando, setProcessando] = useState(false);
  const form = useRef<HTMLFormElement>(null);

  const avisar = toast;

  const carregar = async (q = busca) => {
    try {
      setLoading(true);
      setErro(null);
      setLista(await p.carregar(p.filtroLocal ? '' : q));
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Busca no servidor com atraso curto enquanto digita
  useEffect(() => {
    const t = setTimeout(() => carregar(busca), p.filtroLocal ? 0 : 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.filtroLocal ? '' : busca, p.chaveRecarga]);

  // Foco no primeiro campo vazio (inclusão) ou no primeiro campo (edição)
  useEffect(() => {
    if (!editando) return;
    const t = setTimeout(() => {
      const els = [...(form.current?.querySelectorAll<HTMLInputElement>('input:not([type=checkbox]):not([disabled]), select, textarea') || [])];
      (editando.id ? els[0] : els.find((e) => !e.value) || els[0])?.focus();
    }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando?.id, editando === null]);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    try {
      setSalvando(true);
      setErro(null);
      await p.salvar(editando);
      avisar(`${p.nome[0].toUpperCase()}${p.nome.slice(1)} ${editando.id ? 'atualizado' : 'incluído'} com sucesso.`);
      setEditando(null);
      carregar();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const confirmarExclusao = async () => {
    if (!excluindo || !p.excluir) return;
    try {
      setProcessando(true);
      await p.excluir(excluindo);
      avisar(`"${p.descrever(excluindo)}" excluído.`);
      carregar();
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setProcessando(false);
      setExcluindo(null);
    }
  };

  const executarAcao = async (a: AcaoExtra<T>, t: T) => {
    try {
      setErro(null);
      const msg = await a.executar(t);
      if (msg) avisar(msg);
      if (!a.semRecarga) carregar();
    } catch (err: any) {
      setErro(err.message);
    }
  };

  const termo = busca.trim().toUpperCase();
  const filtrados = p.filtroLocal && termo ? lista.filter((t) => JSON.stringify(t).toUpperCase().includes(termo)) : lista;
  const podeEditar = !p.somenteLeitura;
  // O cabeçalho já está montado quando o efeito roda
  const [seloTitulo, setSeloTitulo] = useState<HTMLElement | null>(null);
  useEffect(() => setSeloTitulo(document.getElementById('titulo-extra')), []);
  const totalAcoes = (p.acoes?.length || 0) + (podeEditar ? 1 : 0) + (p.excluir && podeEditar ? 1 : 0);

  const acoesDaLinha = (t: T) => (
    <>
      {p.acoes?.map((a) => (
        <BotaoAcao key={a.titulo} icone={a.icone} titulo={a.titulo} descricao={a.descricao} tom={a.tom} onClick={() => executarAcao(a, t)} />
      ))}
      {p.acoes?.length ? <SeparadorAcoes /> : null}
      {podeEditar && <BotaoAcao icone={Pencil} titulo="Editar" descricao={`alterar ${p.nome}`} onClick={() => setEditando({ ...t })} />}
      {podeEditar && p.excluir && <BotaoAcao icone={Trash2} titulo="Excluir" descricao={`excluir ${p.nome}`} tom="perigo" onClick={() => setExcluindo(t)} />}
    </>
  );

  const alterar = (parcial: Partial<T>) => setEditando((e) => ({ ...e, ...parcial }));

  const renderCampo = (c: Campo<T>) => {
    const v: any = (editando as any)?.[c.chave];
    const span = { 1: 'sm:col-span-1', 2: 'sm:col-span-2', 3: 'sm:col-span-3', 4: 'sm:col-span-4' }[c.largura || 4];
    const set = (valor: unknown) => alterar({ [c.chave]: valor } as Partial<T>);
    let input: React.ReactNode;
    switch (c.tipo) {
      case 'toggle':
        input = <div className="py-1"><Toggle checked={Boolean(v)} onChange={set} /></div>;
        break;
      case 'inteiro':
      case 'decimal':
        input = (
          <div className={FIELD_WRAPPER_CLASS}>
            <NumberField scale={c.tipo === 'inteiro' ? 0 : 2} required={c.obrigatorio} value={v ?? ''} onChange={(x) => set(Number(x) || 0)} className={`${INPUT_CLASS} text-right`} />
          </div>
        );
        break;
      case 'select':
        input = (
          <select required={c.obrigatorio} value={v ?? 0} onChange={(e) => set(Number(e.target.value))} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
            <option value={0}>Selecione…</option>
            {c.opcoes?.map((o) => <option key={o.id} value={o.id}>{o.descricao}</option>)}
          </select>
        );
        break;
      case 'textarea':
        input = (
          <textarea required={c.obrigatorio} maxLength={c.max} rows={5} value={v ?? ''} onChange={(e) => set(e.target.value)} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} resize-y`} />
        );
        break;
      default:
        input = (
          <input
            type={c.tipo === 'senha' ? 'password' : 'text'}
            inputMode={c.tipo === 'digitos' ? 'numeric' : undefined}
            required={c.obrigatorio}
            maxLength={c.max}
            value={v ?? ''}
            autoComplete={c.tipo === 'senha' ? 'new-password' : 'off'}
            onChange={(e) => {
              let x = e.target.value;
              if (c.tipo === 'digitos') x = x.replace(/\D/g, '');
              if (c.maiusculo) x = x.toUpperCase();
              set(x);
            }}
            className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}
          />
        );
    }
    return (
      <div key={c.chave} className={`col-span-4 ${span}`}>
        <label className={LABEL_CLASS}>{c.rotulo}</label>
        {input}
        {c.dica && <p className="text-[10px] text-stone-400 mt-0.5">{c.dica}</p>}
      </div>
    );
  };

  return (
    <div className={PAINEL}>
      <div className={BARRA}>
        <div className={BARRA_INFO}>{loading ? 'Carregando…' : `${filtrados.length} registro(s)`}</div>
        <div className="flex items-center gap-2.5 shrink-0">
          {p.barra}
          <div className="relative w-52 sm:w-64 shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} pl-9`} />
          </div>
          <button type="button" onClick={() => carregar()} disabled={loading} title="Recarregar" className={BTN_SECUNDARIO}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {podeEditar && p.podeIncluir !== false && (
            <button type="button" onClick={() => setEditando(p.novo())} className={BTN_PRIMARIO}>
              <Plus className="w-3.5 h-3.5" />
              <span>Novo</span>
            </button>
          )}
        </div>
      </div>

      {p.somenteLeitura && seloTitulo && createPortal(
        <span title={p.somenteLeitura} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap text-emerald-700 bg-emerald-50 border border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900">
          <Lock className="w-3 h-3" /> Somente Leitura
        </span>, seloTitulo)}
      {erro && !editando && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="mx-4 mt-3 shrink-0" />}

      <div className={GRADE_AREA}>
        <table className={TABELA}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={TH_INDICADOR} />
              {p.colunas.map((c) => <th key={c.titulo} className={TH}>{c.titulo}</th>)}
              {totalAcoes > 0 && <th className={TH_ACOES}>Ações</th>}
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={p.colunas.length + 2} className={TD_VAZIO}>
                  {loading ? (
                    <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</span>
                  ) : (
                    <div className="flex flex-col items-center gap-2"><Inbox className="w-8 h-8" /><span className="text-sm font-medium">Nenhum registro encontrado</span></div>
                  )}
                </td>
              </tr>
            ) : (
              filtrados.map((t) => (
                <tr key={t.id} className={TR} onDoubleClick={() => podeEditar && setEditando({ ...t })}>
                  <td className={TD_INDICADOR}><ChevronRight className={INDICADOR} /></td>
                  {p.colunas.map((c) => <td key={c.titulo} className={`${TD} ${c.classe || ''}`}>{c.valor(t)}</td>)}
                  {totalAcoes > 0 && (
                    <td className={TD_ACOES}>
                      {totalAcoes > 3 ? <MenuAcoes>{acoesDaLinha(t)}</MenuAcoes> : <div className="inline-flex items-center gap-1">{acoesDaLinha(t)}</div>}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editando && (
        <Modal isOpen onClose={() => setEditando(null)} title={`${editando.id ? 'Editar' : 'Novo'} ${p.nome}`} size={p.tamanho || 'md'}>
          <form ref={form} onSubmit={salvar} className="space-y-4">
            {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}
            <div className="grid grid-cols-4 gap-3">{p.campos.map(renderCampo)}</div>
            {p.extraFormulario?.(editando, alterar)}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
              <button type="button" onClick={() => setEditando(null)} className={BTN_SECUNDARIO}>Cancelar</button>
              <button type="submit" disabled={salvando} className={BTN_PRIMARIO}>
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Salvar</span>
              </button>
            </div>
          </form>
        </Modal>
      )}

      {excluindo && (
        <ConfirmModal
          titulo={`Excluir ${p.nome}`}
          mensagem={<>Tem certeza que deseja excluir <strong>{p.descrever(excluindo)}</strong>?</>}
          processando={processando}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  );
}
