import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Pencil, Trash2, Printer, RefreshCw, Loader2, Save, ChevronRight, Lock, Inbox, MapPin,
  Mountain, ArrowLeft, ArrowRight, Check, CloudDownload, ExternalLink, Send, Ban, Copy, ClipboardPaste,
} from 'lucide-react';
import { get, send, qs } from '../services/api';
import { Opcao, Receita, ProdutoReceita, Tratamento } from '../types';
import { formatDateBR, formatDecimal, formatDoc, hojeISO } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import {
  PAINEL, BARRA, BARRA_INFO, BTN_PRIMARIO, BTN_SECUNDARIO, GRADE_AREA, TABELA, TH, TH_INDICADOR, TH_ACOES, TR, TD,
  TD_INDICADOR, TD_ACOES, INDICADOR, TD_VAZIO, BTN_ACAO, BTN_ACAO_EXCLUIR,
} from '../utils/listaStyles';
import { Modal } from './Modal';
import { AvisoErro } from './AvisoErro';
import { toast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { NumberField } from './NumberField';
import { DateField } from './DateField';
import { Toggle } from './Toggle';
import { Selecao } from './Selecao';
import { Pesquisa } from './Pesquisa';
import { BotaoAcao } from './MenuAcoes';
import { BarraAbas } from './BarraAbas';
import {
  calcularQuantidade, calcularArea, doseValida, textoAplicacoes, tiposAplicacaoLiberados, acertaUnidade,
} from '../../shared/receita';

interface Apoio {
  arts: { id: number; numero: string; idProf: number; profissional: string }[];
  tiposLogradouro: Opcao[];
  culturas: { id: number; nome: string; idCidasc: number }[];
  unDerivadas: { id: number; un: string; descricao: string; idEmpregada: number }[];
  unCidasc: { id: number; sigla: string; descricao: string }[];
  tiposAplicacao: Opcao[];
  compendioOnline: boolean;
}

/** Erro com "x" e fechamento automático (AvisoErro do crmWeb) */
const Erro: React.FC<{ msg: string | null; onFechar: () => void; inline?: boolean }> = ({ msg, onFechar, inline }) =>
  msg ? <AvisoErro mensagem={msg} onFechar={onFechar} className={inline ? '' : 'mx-4 my-3 shrink-0'} /> : null;

const Campo: React.FC<{ rotulo: string; className?: string; children: React.ReactNode }> = ({ rotulo, className, children }) => (
  <div className={className}>
    <label className={LABEL_CLASS}>{rotulo}</label>
    {children}
  </div>
);

const situacao = (r: Receita) =>
  r.cancelada ? <span className="text-rose-600 font-semibold">Cancelada</span>
    : r.impressa ? <span className="text-emerald-600 font-semibold">Impressa</span>
      : r.numeroReceitaCidasc ? <span className="text-blue-600">Na CIDASC</span> : <span className="text-stone-500">Aberta</span>;

// =====================================================================
// Assistente do produto: defensivo → cultura → praga → tratamento → dose
// =====================================================================
interface Escolha {
  produto?: { id: number; nome: string; un: string };
  cultura?: { id: number; nome: string };
  praga?: { id: number; nome: string };
  tratamento?: Tratamento;
}

const Lista: React.FC<{ itens: { id: number; titulo: React.ReactNode; detalhe?: React.ReactNode }[]; carregando: boolean; onEscolher: (id: number) => void; selecionado?: number }> = ({ itens, carregando, onEscolher, selecionado }) => (
  <div className="max-h-[50vh] overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800 text-xs border border-stone-200 dark:border-stone-800 rounded-lg">
    {carregando && <div className="p-3 text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Carregando (pode consultar a API do Novo Receituário)…</div>}
    {!carregando && !itens.length && <div className="p-3 text-stone-400">Nada encontrado.</div>}
    {!carregando && itens.map((i) => (
      <button key={i.id} type="button" onClick={() => onEscolher(i.id)} className={`w-full text-left px-3 py-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30 ${selecionado === i.id ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
        <div className="font-semibold text-stone-800 dark:text-stone-100">{i.titulo}</div>
        {i.detalhe && <div className="text-stone-500 mt-0.5">{i.detalhe}</div>}
      </button>
    ))}
  </div>
);

/** Produto de receita ainda não gravada: fica na tela com o corpo que vai ao servidor no Gravar */
type ProdutoLocal = ProdutoReceita & { corpo?: Record<string, unknown> };

const Assistente: React.FC<{ receita: Receita; apoio: Apoio; item: ProdutoLocal | null; onFechar: (salvou: boolean, local?: ProdutoLocal) => void }> = ({ receita, apoio, item, onFechar }) => {
  const [passo, setPasso] = useState(item ? 5 : 1);
  const [esc, setEsc] = useState<Escolha>({});
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [somenteBm, setSomenteBm] = useState(true);
  const [defensivos, setDefensivos] = useState<any[]>([]);
  const [culturas, setCulturas] = useState<{ id: number; nome: string }[]>([]);
  const [pragas, setPragas] = useState<{ id: number; nome: string; nomeCientifico: string; tratamentos: number }[]>([]);
  const [tratamentos, setTratamentos] = useState<Tratamento[]>([]);
  const [diagnosticos, setDiagnosticos] = useState<{ id: number; texto: string }[]>([]);
  const [equip, setEquip] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [f, setF] = useState({
    dose: 0, idUnDose: 0, calda: 0, nrAplic: 1, area: 0, qtdade: 0, idUnQtd: 0, idUnArea: 0,
    carencia: '', aplicacao: '', aplicacaoLiberado: '', diagnostico: '', liberarAplicacoes: false,
  });

  const carregar = async <T,>(fn: () => Promise<T>, set: (v: T) => void) => {
    try {
      setCarregando(true);
      setErro(null);
      set(await fn());
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };

  // Passo 1: defensivos com uso na cultura da receita
  useEffect(() => {
    if (passo !== 1) return;
    const t = setTimeout(() => carregar(() => get<any[]>(`/api/receitas/${receita.id || 0}/assistente/defensivos${qs({ q: busca, bm: somenteBm ? 'S' : 'N', cultura: receita.idCultura })}`), setDefensivos), 350);
    return () => clearTimeout(t);
  }, [passo, busca, somenteBm]);

  useEffect(() => { get<{ id: number; texto: string }[]>('/api/diagnosticos').then(setDiagnosticos).catch(() => {}); }, []);

  // Edição: recupera o tratamento do item e vai direto à dose
  useEffect(() => {
    if (!item) return;
    carregar(() => get<Tratamento[]>(`/api/receitas/assistente/tratamentos${qs({ produto: item.idNovoRec, cultura: item.idCultura, praga: item.idPraga })}`), (l) => {
      const t = l.find((x) => x.id === item.idTratamento);
      if (!t) { setErro('O tratamento deste produto não existe mais. Exclua o produto e inclua de novo.'); return; }
      setEsc({ produto: { id: item.idNovoRec, nome: item.defensivo, un: '' }, cultura: { id: item.idCultura, nome: item.cultura }, praga: { id: item.idPraga, nome: item.praga }, tratamento: t });
      setF((x) => ({
        ...x,
        dose: item.dose, calda: item.calda, nrAplic: item.nrAplic, area: item.area, qtdade: item.qtdade,
        idUnDose: apoio.unDerivadas.find((u) => u.un === item.doseUn)?.id || 0,
        idUnQtd: apoio.unCidasc.find((u) => u.sigla === item.qtdadeUn)?.id || 0,
        idUnArea: apoio.unCidasc.find((u) => u.sigla === item.areaUn)?.id || 0,
        carencia: item.carencia, aplicacao: item.aplicacao, aplicacaoLiberado: item.aplicacaoLiberado, diagnostico: item.diagnostico,
      }));
      get<Record<string, string>>(`/api/tratamentos/${t.id}/memos`).then((m) => setEquip(m.equip_aplicacao || '')).catch(() => setEquip(''));
    });
  }, [item?.id]);

  const escolherProduto = (id: number) => {
    const d = defensivos.find((x) => x.id === id);
    setEsc({ produto: { id, nome: d.nome, un: d.un } });
    setPasso(2);
    carregar(() => get<{ culturas: { id: number; nome: string }[] }>(`/api/receitas/assistente/culturas${qs({ produto: id })}`), (r) => {
      setCulturas(r.culturas);
      // Mesma cultura da receita: pula direto para a praga
      const mesma = r.culturas.find((c) => c.id === receita.idCultura);
      if (mesma) escolherCultura(mesma.id, mesma.nome, id);
    });
  };

  const escolherCultura = (id: number, nome: string, produto = esc.produto!.id, atualizar = false) => {
    setEsc((e) => ({ ...e, cultura: { id, nome }, praga: undefined, tratamento: undefined }));
    setPasso(3);
    carregar(() => get<any[]>(`/api/receitas/assistente/pragas${qs({ produto, cultura: id, atualizar: atualizar ? 'S' : '' })}`), setPragas);
  };

  const escolherPraga = (id: number, atualizar = false) => {
    const g = pragas.find((x) => x.id === id)!;
    setEsc((e) => ({ ...e, praga: { id, nome: g.nome }, tratamento: undefined }));
    setPasso(4);
    carregar(() => get<Tratamento[]>(`/api/receitas/assistente/tratamentos${qs({ produto: esc.produto!.id, cultura: esc.cultura!.id, praga: id, atualizar: atualizar ? 'S' : '' })}`), setTratamentos);
  };

  const escolherTratamento = (id: number) => {
    const t = tratamentos.find((x) => x.id === id)!;
    setEsc((e) => ({ ...e, tratamento: t }));
    const unDose = apoio.unDerivadas.find((u) => acertaUnidade(u.un) === acertaUnidade(t.unidadeAplicacao));
    const sigla = (esc.produto?.un || t.unidadeAplicacao.split('/')[0] || '').trim().toUpperCase();
    setF((x) => ({
      ...x,
      dose: t.doseMaxima || t.doseMinima, idUnDose: unDose?.id || 0, calda: t.volumeCalda, nrAplic: t.minimoAplicacoes || 1,
      idUnQtd: apoio.unCidasc.find((u) => u.sigla.toUpperCase() === sigla)?.id || 0,
      idUnArea: apoio.unCidasc.find((u) => u.sigla.toUpperCase() === 'HA')?.id || 0,
      carencia: t.intervaloSeguranca ? `${t.intervaloSeguranca} DIAS` : '',
      aplicacao: textoAplicacoes(t.minimoAplicacoes, t.maximoAplicacoes, t.localAplicacao).slice(0, 120),
      aplicacaoLiberado: '',
    }));
    setEquip(null);
    get<Record<string, string>>(`/api/tratamentos/${t.id}/memos`).then((m) => setEquip(m.equip_aplicacao || '')).catch(() => setEquip(''));
    setPasso(5);
  };

  const t = esc.tratamento;
  const unDose = apoio.unDerivadas.find((u) => u.id === f.idUnDose)?.un || '';
  const unQtd = apoio.unCidasc.find((u) => u.id === f.idUnQtd)?.sigla || '';
  const liberados = useMemo(() => (t ? tiposAplicacaoLiberados(apoio.tiposAplicacao, t.restricaoAplicacao, t.volumeCaldaAerea) : []), [t?.id]);
  const dadosCalc = { dose: f.dose, unDose, unAdquirir: unQtd, calda: f.calda, nrAplic: f.nrAplic };
  const doseOk = t ? doseValida(f.dose, unDose, t.doseMinima, t.doseMaxima, t.unidadeAplicacao) : false;

  const calcQtd = (area = f.area) => {
    const q = calcularQuantidade({ ...dadosCalc, area });
    setF((x) => ({ ...x, area, qtdade: q ?? x.qtdade }));
  };
  const calcArea = () => {
    const a = calcularArea({ ...dadosCalc, qtd: f.qtdade, unTratamento: t?.unidadeAplicacao || '' });
    if (a !== null) setF((x) => ({ ...x, area: a }));
  };

  const finalizar = async () => {
    if (!t) return;
    try {
      setSalvando(true);
      setErro(null);
      if (equip !== null) await send('PUT', `/api/receitas/assistente/tratamentos/${t.id}/equipamento`, { texto: equip });
      const corpo = { ...f, idTratamento: t.id };
      if (!receita.id) {
        // Receita nova: só monta a linha da grade; o servidor confere tudo no Gravar
        return onFechar(true, {
          ...(item || {}), corpo, id: item?.id || -Date.now(), idTratamento: t.id,
          idNovoRec: esc.produto!.id, idCultura: esc.cultura!.id, idPraga: esc.praga!.id,
          defensivo: esc.produto!.nome, cultura: esc.cultura!.nome, praga: esc.praga!.nome, pragaCientifico: pragas.find((g) => g.id === esc.praga!.id)?.nomeCientifico || item?.pragaCientifico || '',
          dose: f.dose, doseUn: unDose, calda: f.calda, nrAplic: f.nrAplic, area: f.area,
          areaUn: apoio.unCidasc.find((u) => u.id === f.idUnArea)?.sigla || '', qtdade: f.qtdade, qtdadeUn: unQtd,
          carencia: f.carencia, aplicacao: f.aplicacao, aplicacaoLiberado: f.aplicacaoLiberado, diagnostico: f.diagnostico,
        } as ProdutoLocal);
      }
      await send(item ? 'PUT' : 'POST', item ? `/api/receitas/${receita.id}/produtos/${item.id}` : `/api/receitas/${receita.id}/produtos`, corpo);
      onFechar(true);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const passos = ['Defensivo', 'Cultura', 'Praga', 'Tratamento', 'Dose'];
  const resumo = [esc.produto?.nome, esc.cultura?.nome, esc.praga?.nome].filter(Boolean).join(' › ');
  const voltar = () => setPasso((p) => Math.max(item ? 5 : 1, p - 1));

  return (
    <Modal isOpen onClose={() => onFechar(false)} title={item ? 'Alterar produto' : 'Incluir produto'} subtitle={resumo || `Cultura da receita: ${receita.culturaNome}`} size="xl"
      footer={<>
        {passo > 1 && !item && <button type="button" onClick={voltar} className={BTN_SECUNDARIO}><ArrowLeft className="w-3.5 h-3.5" />Voltar</button>}
        <button type="button" onClick={() => onFechar(false)} className={BTN_SECUNDARIO}>Cancelar</button>
        {passo === 5 && (
          <button type="button" onClick={finalizar} disabled={salvando || !t} className={BTN_PRIMARIO}>
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Finalizar
          </button>
        )}
      </>}>
      <div className="flex gap-1 text-[11px] font-semibold">
        {passos.map((n, i) => (
          <span key={n} className={`px-2 py-1 rounded ${passo === i + 1 ? 'bg-amber-600 text-white' : passo > i + 1 ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-stone-100 text-stone-400 dark:bg-stone-800'}`}>{i + 1}. {n}</span>
        ))}
      </div>
      <Erro msg={erro} inline onFechar={() => setErro(null)} />

      {passo === 1 && (
        <>
          <div className="flex items-end gap-3">
            <Campo rotulo="Defensivo" className="flex-1">
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do defensivo…" className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
            </Campo>
            <Toggle checked={somenteBm} onChange={setSomenteBm} label="Só com produto no ERP" />
          </div>
          <Lista
            carregando={carregando}
            onEscolher={escolherProduto}
            itens={defensivos.map((d) => ({
              id: d.id,
              titulo: d.nome,
              detalhe: <>MAPA {d.registroMapa || '–'}{d.idBm ? <> • ERP {d.descricaoBm} • estoque <b className="font-mono">{formatDecimal(d.estoque, 2)} {d.un}</b></> : ' • sem produto no ERP'}{!d.idCidasc && <span className="text-rose-600"> • sem vínculo CIDASC</span>}</>,
            }))}
          />
        </>
      )}

      {passo === 2 && (
        <Lista carregando={carregando} onEscolher={(id) => escolherCultura(id, culturas.find((c) => c.id === id)!.nome)} itens={culturas.map((c) => ({ id: c.id, titulo: c.nome }))} />
      )}

      {passo === 3 && (
        <>
          {apoio.compendioOnline && (
            <button type="button" disabled={carregando} onClick={() => escolherCultura(esc.cultura!.id, esc.cultura!.nome, esc.produto!.id, true)} className={BTN_SECUNDARIO}>
              <CloudDownload className="w-3.5 h-3.5" />Atualizar pragas e tratamentos da API
            </button>
          )}
          <Lista carregando={carregando} onEscolher={(id) => escolherPraga(id)} itens={pragas.map((g) => ({ id: g.id, titulo: g.nome, detalhe: <><i>{g.nomeCientifico}</i> • {g.tratamentos} tratamento(s)</> }))} />
        </>
      )}

      {passo === 4 && (
        <>
          {apoio.compendioOnline && (
            <button type="button" disabled={carregando} onClick={() => escolherPraga(esc.praga!.id, true)} className={BTN_SECUNDARIO}>
              <CloudDownload className="w-3.5 h-3.5" />Atualizar tratamento da API
            </button>
          )}
          <Lista
            carregando={carregando}
            onEscolher={escolherTratamento}
            itens={tratamentos.map((x) => ({
              id: x.id,
              titulo: <>Dose {formatDecimal(x.doseMinima, 4)} a {formatDecimal(x.doseMaxima, 4)} {x.unidadeAplicacao} • calda {x.volumeCalda || '–'} L/ha • {x.minimoAplicacoes}–{x.maximoAplicacoes} aplicações</>,
              detalhe: <>{x.localAplicacao} {x.modalidadeAplicacao && `• ${x.modalidadeAplicacao}`} • carência {x.intervaloSeguranca} dias • {x.classificacaoToxicologica} {x.estadosRestritos && <span className="text-rose-600">• restrito em {x.estadosRestritos}</span>}</>,
            }))}
          />
        </>
      )}

      {passo === 5 && t && (
        <div className="space-y-3">
          <div className="text-[11px] p-2 rounded bg-stone-50 dark:bg-stone-800/60 text-stone-600 dark:text-stone-300">
            Recomendado: dose <b>{formatDecimal(t.doseMinima, 4)} a {formatDecimal(t.doseMaxima, 4)} {t.unidadeAplicacao}</b> • calda {t.volumeCalda || '–'} L/ha
            {t.volumeCaldaAerea ? ` (aérea ${t.volumeCaldaAerea})` : ''} • {t.minimoAplicacoes} a {t.maximoAplicacoes} aplicações • {t.nomeIngredientes}
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Campo rotulo="Dose" className="col-span-2 sm:col-span-1">
              <div className={FIELD_WRAPPER_CLASS}><NumberField scale={4} required value={f.dose} onChange={(v) => setF({ ...f, dose: Number(v) || 0 })} className={`${INPUT_CLASS} text-right ${doseOk ? '' : 'text-rose-600'}`} /></div>
            </Campo>
            <Campo rotulo="UN da dose (CIDASC)" className="col-span-2 sm:col-span-1">
              <Selecao required value={f.idUnDose} onChange={(e) => setF({ ...f, idUnDose: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
                <option value={0}>Selecione…</option>
                {apoio.unDerivadas.map((u) => <option key={u.id} value={u.id}>{u.un} – {u.descricao}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Calda (L/ha)" className="col-span-2 sm:col-span-1">
              <div className={FIELD_WRAPPER_CLASS}><NumberField scale={0} value={f.calda} onChange={(v) => setF({ ...f, calda: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} /></div>
            </Campo>
            <Campo rotulo={`Nº de aplicações (máx. ${f.liberarAplicacoes ? 99 : t.maximoAplicacoes || 99})`} className="col-span-2 sm:col-span-1">
              <div className={FIELD_WRAPPER_CLASS}><NumberField scale={0} required value={f.nrAplic} onChange={(v) => setF({ ...f, nrAplic: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} /></div>
            </Campo>
            <Campo rotulo="Área" className="col-span-2 sm:col-span-1">
              <div className={FIELD_WRAPPER_CLASS}><NumberField scale={2} required value={f.area} onChange={(v) => calcQtd(Number(v) || 0)} className={`${INPUT_CLASS} text-right`} /></div>
            </Campo>
            <Campo rotulo="UN da área" className="col-span-2 sm:col-span-1">
              <Selecao value={f.idUnArea} onChange={(e) => setF({ ...f, idUnArea: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
                <option value={0}>HA</option>
                {apoio.unCidasc.map((u) => <option key={u.id} value={u.id}>{u.sigla}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Qtd. a adquirir" className="col-span-2 sm:col-span-1">
              <div className="flex gap-1">
                <div className={`${FIELD_WRAPPER_CLASS} flex-1`}><NumberField scale={4} required value={f.qtdade} onChange={(v) => setF({ ...f, qtdade: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} /></div>
                <button type="button" onClick={calcArea} title="Calcular a área pela quantidade" className={BTN_SECUNDARIO}>Área</button>
              </div>
            </Campo>
            <Campo rotulo="UN a adquirir (CIDASC)" className="col-span-2 sm:col-span-1">
              <Selecao required value={f.idUnQtd} onChange={(e) => setF({ ...f, idUnQtd: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
                <option value={0}>Selecione…</option>
                {apoio.unCidasc.map((u) => <option key={u.id} value={u.id}>{u.sigla} – {u.descricao}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Carência" className="col-span-2 sm:col-span-1">
              <input maxLength={25} value={f.carencia} onChange={(e) => setF({ ...f, carencia: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
            </Campo>
            <Campo rotulo="Tipo de aplicação" className="col-span-2 sm:col-span-1">
              <Selecao value={f.aplicacaoLiberado} onChange={(e) => setF({ ...f, aplicacaoLiberado: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
                <option value="">–</option>
                {liberados.map((x) => <option key={x.id} value={x.descricao}>{x.descricao}</option>)}
              </Selecao>
            </Campo>
            <div className="col-span-4 sm:col-span-2 flex items-end pb-1">
              <Toggle checked={f.liberarAplicacoes} onChange={(v) => setF({ ...f, liberarAplicacoes: v })} label="Liberar nº de aplicações acima do máximo" />
            </div>
            <Campo rotulo="Aplicação (época e intervalo)" className="col-span-4">
              <input maxLength={120} value={f.aplicacao} onChange={(e) => setF({ ...f, aplicacao: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
            </Campo>
            <Campo rotulo="Diagnóstico" className="col-span-4">
              {diagnosticos.length > 0 && (
                <Selecao value="" onChange={(e) => { const d = diagnosticos.find((x) => x.id === Number(e.target.value)); if (d) setF({ ...f, diagnostico: d.texto }); }} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} mb-1`}>
                  <option value="">Usar um diagnóstico cadastrado…</option>
                  {diagnosticos.map((d) => <option key={d.id} value={d.id}>{d.texto.slice(0, 100)}</option>)}
                </Selecao>
              )}
              <textarea rows={3} value={f.diagnostico} onChange={(e) => setF({ ...f, diagnostico: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} resize-y`} />
            </Campo>
            <Campo rotulo="Equipamento de aplicação (texto do tratamento)" className="col-span-4">
              {equip === null ? <div className="text-xs text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Carregando…</div> : (
                <textarea rows={2} value={equip} onChange={(e) => setEquip(e.target.value)} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} resize-y`} />
              )}
            </Campo>
          </div>
          {!doseOk && f.dose > 0 && <p className="text-[11px] text-rose-600">Dose fora da faixa recomendada (ou unidade incompatível).</p>}
        </div>
      )}
      {passo < 5 && passo > 1 && !carregando && <p className="text-[11px] text-stone-400 flex items-center gap-1"><ArrowRight className="w-3 h-3" />Escolha um item para avançar.</p>}
    </Modal>
  );
};

// =====================================================================
// Cabeçalho da receita
// =====================================================================
const vazia = (): Partial<Receita> => ({
  idArt: 0, idCliente: 0, cliente: '', idCultura: 0, idLocalidade: 0, idTipoLogradouro: 0, localAplicacao: '',
  altitude: 0, latitude: 0, longitude: 0, recomendacoes: '', obs: Array(8).fill(''), produtos: [],
});

const ETAPAS = ['Dados iniciais', 'Produtos', 'Recomendações e observações'];

/** Receita aberta numa aba, em 3 etapas com Voltar / Avançar */
const ReceitaForm: React.FC<{ apoio: Apoio; idInicial: number; clonarDe?: number; onFechar: (gravou?: boolean) => void; onCarregou: (r: Receita) => void; onAlterou: (alterada: boolean) => void }> = ({ apoio, idInicial, clonarDe, onFechar, onCarregou, onAlterou }) => {
  const [r, setR] = useState<Partial<Receita>>(vazia);
  const [etapa, setEtapa] = useState(0);
  // Retrato do que está gravado (ou da receita em branco): diferente dele = alteração não gravada
  const [base, setBase] = useState('');
  const alterada = base !== '' && JSON.stringify(r) !== base;
  useEffect(() => { onAlterou(alterada); }, [alterada]);
  const [localidades, setLocalidades] = useState<Opcao[]>([]);
  const [observacoes, setObservacoes] = useState<{ id: number; texto: string }[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [geo, setGeo] = useState<'gps' | 'alt' | null>(null);
  const [assistente, setAssistente] = useState<{ item: ProdutoLocal | null } | null>(null);
  const [removendo, setRemovendo] = useState<ProdutoLocal | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const bloqueada = Boolean(r.numeroReceitaCidasc) || Boolean(r.cancelada);

  const carregar = async (id: number) => {
    const rec = await get<Receita>(`/api/receitas/${id}`);
    setR(rec);
    setBase(JSON.stringify(rec));
    onCarregou(rec);
    if (rec.idCliente) get<any>(`/api/receitas/clientes/${rec.idCliente}`).then((c) => setLocalidades(c.localidades)).catch(() => {});
  };

  /** Clonar: receita nova com o cabeçalho e os produtos de outra; número e CIDASC só no Gravar */
  const clonar = async (id: number) => {
    const o = await get<Receita>(`/api/receitas/${id}`);
    const nova: Partial<Receita> = {
      ...vazia(),
      idArt: o.idArt, idCliente: o.idCliente, cliente: o.cliente, idCultura: o.idCultura, idLocalidade: o.idLocalidade,
      idTipoLogradouro: o.idTipoLogradouro, localAplicacao: o.localAplicacao, altitude: o.altitude, latitude: o.latitude,
      longitude: o.longitude, recomendacoes: o.recomendacoes, obs: [...o.obs],
      produtos: (o.produtos || []).map((p, i): ProdutoLocal => ({
        ...p, id: -(Date.now() + i),
        // Mesmo corpo que o assistente monta; a original já passou pela conferência do nº de aplicações
        corpo: {
          idTratamento: p.idTratamento, dose: p.dose, idUnDose: p.idUnDose || 0, calda: p.calda, nrAplic: p.nrAplic, area: p.area,
          qtdade: p.qtdade, idUnQtd: p.idUnQtd || 0, idUnArea: p.idUnArea || 0, carencia: p.carencia, aplicacao: p.aplicacao,
          aplicacaoLiberado: p.aplicacaoLiberado, diagnostico: p.diagnostico, liberarAplicacoes: true,
        },
      })),
    };
    setR(nova);
    setBase(JSON.stringify(nova));
    if (o.idCliente) get<any>(`/api/receitas/clientes/${o.idCliente}`).then((c) => setLocalidades(c.localidades)).catch(() => {});
  };

  useEffect(() => {
    get<{ id: number; texto: string }[]>('/api/observacoes').then(setObservacoes).catch(() => {});
    if (idInicial) carregar(idInicial).catch((e) => setErro(e.message));
    else if (clonarDe) clonar(clonarDe).catch((e) => setErro(e.message));
    else {
      // Inclusão: ART única já vem marcada; foco no primeiro campo vazio
      const inicial = { ...vazia(), idArt: apoio.arts.length === 1 ? apoio.arts[0].id : 0 };
      setR(inicial);
      setBase(JSON.stringify(inicial));
      setTimeout(() => {
        const els = [...(form.current?.querySelectorAll<HTMLInputElement>('input, select') || [])];
        (els.find((e) => !e.value || e.value === '0') || els[0])?.focus();
      }, 80);
    }
  }, [idInicial]);

  const escolherCliente = async (o: Opcao) => {
    try {
      const c = await get<any>(`/api/receitas/clientes/${o.id}`);
      setLocalidades(c.localidades);
      setR((x) => ({
        ...x, idCliente: c.id, cliente: c.nome, localAplicacao: x.localAplicacao || c.localAplicacao,
        idLocalidade: c.idLocalidade || (c.localidades.length === 1 ? c.localidades[0].id : 0), idTipoLogradouro: c.idTipoLogradouro,
        ...(c.ultimaGeo && !x.latitude ? c.ultimaGeo : {}),
      }));
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const minhaLocalizacao = () => {
    if (!navigator.geolocation) return setErro('Este navegador não informa a localização.');
    setGeo('gps');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const latitude = Number(p.coords.latitude.toFixed(6));
        const longitude = Number(p.coords.longitude.toFixed(6));
        setR((x) => ({ ...x, latitude, longitude, altitude: p.coords.altitude ? Math.round(p.coords.altitude) : x.altitude }));
        // Já busca a altitude do ponto (a do GPS costuma faltar ou vir imprecisa)
        buscarAltitude(latitude, longitude);
      },
      (e) => { setErro(`Localização indisponível: ${e.message}`); setGeo(null); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  /** Coordenadas copiadas do Google Maps (botão direito no ponto → clicar nos números): "-27.41234, -49.60123" */
  const colarCoordenadas = (texto: string) => {
    const m = texto.match(/(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)/);
    if (!m) return false;
    const latitude = Number(Number(m[1].replace(',', '.')).toFixed(6));
    const longitude = Number(Number(m[2].replace(',', '.')).toFixed(6));
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
    setR((x) => ({ ...x, latitude, longitude }));
    buscarAltitude(latitude, longitude);
    toast('Coordenadas do Google Maps aplicadas.');
    return true;
  };

  const colarDaAreaDeTransferencia = async () => {
    try {
      if (!colarCoordenadas(await navigator.clipboard.readText())) setErro('Não há coordenadas copiadas. No Google Maps, clique com o botão direito no ponto e depois nos números (latitude, longitude).');
    } catch {
      setErro('O navegador não liberou a área de transferência. Use Ctrl+V nesta tela.');
    }
  };

  /** Google Maps em satélite no ponto atual ou, sem ele, na localidade do cliente */
  const abrirMaps = () => {
    const loc = localidades.find((l) => l.id === r.idLocalidade)?.descricao;
    const url = r.latitude && r.longitude
      ? `https://www.google.com/maps/@${r.latitude},${r.longitude},17z/data=!3m1!1e3`
      : `https://www.google.com/maps/search/${encodeURIComponent(`${loc || r.localAplicacao || ''} SC`)}/data=!3m1!1e3`;
    window.open(url, '_blank', 'noopener');
  };

  // Ctrl+V com coordenadas em qualquer lugar dos dados iniciais (fora de outro campo de texto) preenche latitude/longitude
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      if (etapa !== 0 || bloqueada || !form.current?.offsetParent) return;
      const alvo = e.target as HTMLElement;
      // Em outro campo, o Ctrl+V é normal; na latitude/longitude, o par preenche as duas
      if (!alvo.closest?.('[data-coord]') && alvo.matches?.('textarea, input')) return;
      if (colarCoordenadas(e.clipboardData?.getData('text') || '')) { e.preventDefault(); e.stopPropagation(); }
    };
    // Captura: roda antes do onPaste do NumberField
    document.addEventListener('paste', colar, true);
    return () => document.removeEventListener('paste', colar, true);
  });

  const buscarAltitude = async (lat = r.latitude, lon = r.longitude) => {
    try {
      setGeo('alt');
      const { altitude } = await get<{ altitude: number }>(`/api/receitas/altitude${qs({ lat, lon })}`);
      setR((x) => ({ ...x, altitude }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setGeo(null);
    }
  };

  const salvar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    try {
      setSalvando(true);
      setErro(null);
      // Inclusão: os produtos montados na tela vão junto com o cabeçalho
      const corpo = r.id ? r : { ...r, itens: (r.produtos as ProdutoLocal[] || []).map((p) => p.corpo) };
      const { id } = await send<{ id: number }>(r.id ? 'PUT' : 'POST', r.id ? `/api/receitas/${r.id}` : '/api/receitas', corpo);
      await carregar(id);
      toast('Receita gravada.');
      return id;
    } catch (err: any) {
      setErro(err.message);
      return 0;
    } finally {
      setSalvando(false);
    }
  };

  const incluirProduto = () => {
    // A cultura da receita filtra os defensivos
    if (!r.idCultura) return setErro('Escolha a cultura nos dados iniciais antes de incluir produtos.');
    setAssistente({ item: null });
  };

  // Receita nova: o produto só está na tela
  const fecharAssistente = (salvou: boolean, local?: ProdutoLocal) => {
    setAssistente(null);
    if (!salvou) return;
    if (r.id) return void carregar(r.id);
    if (local) {
      const lista = (r.produtos || []) as ProdutoLocal[];
      setR({ ...r, produtos: lista.some((p) => p.id === local.id) ? lista.map((p) => (p.id === local.id ? local : p)) : [...lista, local] });
    }
  };

  const removerProduto = async () => {
    if (!removendo) return;
    if (!r.id) {
      setR({ ...r, produtos: (r.produtos || []).filter((p) => p.id !== removendo.id) });
      return setRemovendo(null);
    }
    try {
      await send('DELETE', `/api/receitas/${r.id}/produtos/${removendo.id}`);
      await carregar(r.id);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setRemovendo(null);
    }
  };

  const usarObs = (texto: string) => {
    const obs = [...(r.obs || Array(8).fill(''))];
    const i = obs.findIndex((o) => !o);
    if (i < 0) return setErro('As 8 linhas de observação já estão preenchidas.');
    obs[i] = texto;
    setR({ ...r, obs });
  };

  const art = apoio.arts.find((a) => a.id === r.idArt);
  const dis = bloqueada;

  // Gravar (última etapa) fecha a aba: o que estava na tela acabou de ir para o banco
  const gravarEFechar = async () => {
    if (await salvar()) onFechar(true);
  };

  // Avançar só confere os campos; a receita é gravada no Gravar da última etapa
  const avancar = () => {
    if (etapa === 0 && !dis && !form.current?.reportValidity()) return;
    setEtapa((e) => Math.min(ETAPAS.length - 1, e + 1));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900">
      {/* Etapas: com a receita gravada dá para pular direto clicando */}
      <div className={BARRA}>
        <div className="min-w-0">
          <h3 className="text-sm font-bold truncate">{r.id ? `Receita ${r.numeroReceitaFull || r.numeroReceita || `#${r.id}`}` : 'Nova receita'}</h3>
          {bloqueada && (
            <span title={r.cancelada ? 'Receita cancelada.' : 'Receita já enviada à CIDASC: não pode ser alterada.'} className="inline-flex items-center gap-1 mb-0.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap text-rose-700 bg-rose-50 border border-rose-200 dark:text-rose-300 dark:bg-rose-950/40 dark:border-rose-900">
              <Lock className="w-3 h-3" /> {r.cancelada ? 'Cancelada' : 'Enviada à CIDASC: somente leitura'}
            </span>
          )}
          {r.id ? <p className="text-[11px] text-stone-500 truncate">ART {r.numeroArt} • {formatDateBR(r.data)}{r.numeroReceitaCidasc ? ` • CIDASC nº ${r.numeroReceitaCidasc}` : ''}</p> : null}
        </div>
        <ol className="flex items-center gap-1 shrink-0">
          {ETAPAS.map((nome, i) => (
            <li key={nome} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-stone-300" />}
              <button type="button" disabled={!r.id && i > etapa} onClick={() => setEtapa(i)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer disabled:cursor-default ${i === etapa ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:hover:bg-transparent disabled:opacity-50'}`}>
                <span className={`w-4 h-4 rounded-full grid place-items-center text-[10px] ${i < etapa ? 'bg-emerald-600 text-white' : i === etapa ? 'bg-amber-600 text-white' : 'bg-stone-200 dark:bg-stone-700'}`}>{i < etapa ? <Check className="w-2.5 h-2.5" /> : i + 1}</span>
                {nome}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex-1 overflow-auto min-h-0 p-4 space-y-3">
      <Erro msg={erro} inline onFechar={() => setErro(null)} />

      {etapa !== 1 && <form ref={form} onSubmit={(e) => { e.preventDefault(); etapa === 0 ? avancar() : gravarEFechar(); }} className="grid grid-cols-6 gap-3">
        {etapa === 0 && <>
        <Campo rotulo="ART / TRT" className="col-span-6 sm:col-span-2">
          <Selecao required disabled={dis} value={r.idArt || 0} onChange={(e) => setR({ ...r, idArt: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
            <option value={0}>Selecione…</option>
            {apoio.arts.map((a) => <option key={a.id} value={a.id}>{a.numero} – {a.profissional}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Profissional" className="col-span-6 sm:col-span-2">
          <input disabled value={art?.profissional || r.profissional || ''} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
        </Campo>
        <Campo rotulo="Cultura" className="col-span-6 sm:col-span-2">
          <Selecao required disabled={dis} value={r.idCultura || 0} onChange={(e) => setR({ ...r, idCultura: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
            <option value={0}>Selecione…</option>
            {apoio.culturas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.idCidasc ? '' : ' (sem CIDASC)'}</option>)}
          </Selecao>
        </Campo>

        <Campo rotulo="Cliente" className="col-span-6 sm:col-span-3">
          <Pesquisa
            obrigatorio
            disabled={dis}
            valor={r.idCliente ? { id: r.idCliente, descricao: r.cliente || '' } : null}
            buscar={async (q) => (await get<any[]>(`/api/receitas/clientes${qs({ q })}`)).map((c) => ({ id: c.id, descricao: `${c.nome}${c.cidade ? ` – ${c.cidade}` : ''}${c.cpfCnpj ? ` – ${formatDoc(c.cpfCnpj)}` : ''}` }))}
            onEscolher={escolherCliente}
          />
        </Campo>
        <Campo rotulo="Tipo de logradouro" className="col-span-3 sm:col-span-1">
          <Selecao required disabled={dis} value={r.idTipoLogradouro || 0} onChange={(e) => setR({ ...r, idTipoLogradouro: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
            <option value={0}>Selecione…</option>
            {apoio.tiposLogradouro.map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
          </Selecao>
        </Campo>
        <Campo rotulo="Localidade" className="col-span-3 sm:col-span-2">
          <Selecao required disabled={dis} value={r.idLocalidade || 0} onChange={(e) => setR({ ...r, idLocalidade: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
            <option value={0}>{r.idCliente && !localidades.length ? 'Nenhuma localidade no município do cliente' : 'Selecione…'}</option>
            {localidades.map((l) => <option key={l.id} value={l.id}>{l.descricao}</option>)}
          </Selecao>
        </Campo>

        <Campo rotulo="Local da aplicação" className="col-span-6 sm:col-span-3">
          <input required disabled={dis} maxLength={80} value={r.localAplicacao || ''} onChange={(e) => setR({ ...r, localAplicacao: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
        </Campo>
        <Campo rotulo="Latitude" className="col-span-2 sm:col-span-1">
          <div data-coord className={FIELD_WRAPPER_CLASS}><NumberField scale={6} allowNegative required disabled={dis} value={r.latitude} onChange={(v) => setR({ ...r, latitude: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} /></div>
        </Campo>
        <Campo rotulo="Longitude" className="col-span-2 sm:col-span-1">
          <div data-coord className={FIELD_WRAPPER_CLASS}><NumberField scale={6} allowNegative required disabled={dis} value={r.longitude} onChange={(v) => setR({ ...r, longitude: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} /></div>
        </Campo>
        <Campo rotulo="Altitude (m)" className="col-span-2 sm:col-span-1">
          <div className={FIELD_WRAPPER_CLASS}><NumberField scale={0} required disabled={dis} value={r.altitude} onChange={(v) => setR({ ...r, altitude: Number(v) || 0 })} className={`${INPUT_CLASS} text-right`} /></div>
        </Campo>
        {!dis && (
          <div className="col-span-6 flex flex-wrap gap-2 -mt-1">
            <button type="button" onClick={minhaLocalizacao} disabled={Boolean(geo)} className={BTN_SECUNDARIO}>{geo === 'gps' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}Usar minha localização</button>
            <button type="button" onClick={() => buscarAltitude()} disabled={Boolean(geo) || !r.latitude || !r.longitude} className={BTN_SECUNDARIO}>{geo === 'alt' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mountain className="w-3.5 h-3.5" />}Buscar altitude</button>
            <button type="button" onClick={abrirMaps} className={BTN_SECUNDARIO} title="No Google Maps, clique com o botão direito no ponto e depois nos números para copiar; volte aqui e use Ctrl+V"><ExternalLink className="w-3.5 h-3.5" />Escolher no Google Maps</button>
            <button type="button" onClick={colarDaAreaDeTransferencia} disabled={Boolean(geo)} className={BTN_SECUNDARIO} title="Cola as coordenadas copiadas do Google Maps (ou Ctrl+V)"><ClipboardPaste className="w-3.5 h-3.5" />Colar coordenadas</button>
            <span className="self-center text-[11px] text-stone-500">No Maps: botão direito no ponto → clique nos números → volte e Ctrl+V.</span>
          </div>
        )}
        </>}

        {etapa === 2 && <>
        <Campo rotulo="Recomendações" className="col-span-6">
          <input disabled={dis} maxLength={120} value={r.recomendacoes || ''} onChange={(e) => setR({ ...r, recomendacoes: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} />
        </Campo>
        <div className="col-span-6">
          <div className="flex items-center justify-between gap-3">
            <label className={LABEL_CLASS}>Observações</label>
            {!dis && observacoes.length > 0 && (
              <Selecao value="" onChange={(e) => { const o = observacoes.find((x) => x.id === Number(e.target.value)); if (o) usarObs(o.texto); }} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} max-w-sm`}>
                <option value="">Incluir observação cadastrada…</option>
                {observacoes.map((o) => <option key={o.id} value={o.id}>{o.texto}</option>)}
              </Selecao>
            )}
          </div>
          {/* 8 linhas coladas, como um texto: Enter e setas passam de linha */}
          <div className={`mt-1 flex flex-col ${FIELD_WRAPPER_CLASS}`}>
            {(r.obs || []).map((o, i) => (
              <input
                key={i}
                data-obs={i}
                disabled={dis}
                maxLength={120}
                value={o}
                onChange={(e) => { const obs = [...r.obs!]; obs[i] = e.target.value; setR({ ...r, obs }); }}
                onKeyDown={(e) => {
                  const destino = e.key === 'Enter' || e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : -1;
                  if (destino < 0 || destino > 7) { if (e.key === 'Enter') e.preventDefault(); return; }
                  e.preventDefault();
                  (e.currentTarget.parentElement?.querySelector(`[data-obs="${destino}"]`) as HTMLInputElement | null)?.focus();
                }}
                className={`${INPUT_CLASS} !py-0.5 font-mono rounded-none bg-transparent`}
              />
            ))}
          </div>
        </div>
        </>}
        {/* Enter grava/avança */}
        <button type="submit" hidden />
      </form>}

      {etapa === 1 && <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold">Produtos ({r.produtos?.length || 0}/10)</h4>
          {!dis && (
            <button type="button" onClick={incluirProduto} disabled={salvando || (r.produtos?.length || 0) >= 10} className={BTN_PRIMARIO}><Plus className="w-3.5 h-3.5" />Incluir produto</button>
          )}
        </div>
        <div className="overflow-auto">
          <table className={TABELA}>
            <thead>
              <tr>{['Defensivo', 'Cultura', 'Praga', 'Dose', 'Calda', 'Aplic.', 'Área', 'Qtd. a adquirir', 'Carência', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(r.produtos || []).map((p) => (
                <tr key={p.id} className={TR} onDoubleClick={() => !dis && setAssistente({ item: p })}>
                  <td className={`${TD} font-semibold`}>{p.defensivo}</td>
                  <td className={TD}>{p.cultura}</td>
                  <td className={TD}>{p.praga} <i className="text-stone-400">{p.pragaCientifico}</i></td>
                  <td className={`${TD} text-right font-mono`}>{formatDecimal(p.dose, 4)} {p.doseUn}</td>
                  <td className={`${TD} text-right font-mono`}>{p.calda || '–'}</td>
                  <td className={`${TD} text-right font-mono`}>{p.nrAplic}</td>
                  <td className={`${TD} text-right font-mono`}>{formatDecimal(p.area, 2)} {p.areaUn}</td>
                  <td className={`${TD} text-right font-mono`}>{formatDecimal(p.qtdade, 4)} {p.qtdadeUn}</td>
                  <td className={TD}>{p.carencia}</td>
                  <td className={`${TD} text-center`}>
                    {!dis && <>
                      <button type="button" title="Editar: alterar dose e quantidades" className={BTN_ACAO} onClick={() => setAssistente({ item: p })}><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" title="Excluir: remover o produto da receita" className={BTN_ACAO_EXCLUIR} onClick={() => setRemovendo(p)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </>}
                  </td>
                </tr>
              ))}
              {!r.produtos?.length && <tr><td colSpan={10} className={`${TD} text-center text-stone-400 py-6`}>Nenhum produto.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
      </div>

      <div className="px-4 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex items-center gap-2 shrink-0">
        <button type="button" onClick={() => onFechar()} className={BTN_SECUNDARIO}>Fechar</button>
        <div className="flex-1" />
        <button type="button" onClick={() => setEtapa((e) => e - 1)} disabled={etapa === 0} className={BTN_SECUNDARIO}><ArrowLeft className="w-3.5 h-3.5" />Voltar</button>
        {etapa < ETAPAS.length - 1 ? (
          <button type="button" onClick={avancar} disabled={salvando} className={BTN_PRIMARIO}>
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}Avançar<ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : !dis && (
          <button type="button" onClick={gravarEFechar} disabled={salvando} className={BTN_PRIMARIO}>
            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}Gravar
          </button>
        )}
      </div>

      {assistente && (
        <Assistente receita={{ ...r, culturaNome: r.culturaNome || apoio.culturas.find((c) => c.id === r.idCultura)?.nome || '' } as Receita} apoio={apoio} item={assistente.item} onFechar={fecharAssistente} />
      )}
      {removendo && (
        <ConfirmModal titulo="Remover produto" mensagem={<>Remover <strong>{removendo.defensivo}</strong> da receita?</>} onConfirmar={removerProduto} onCancelar={() => setRemovendo(null)} />
      )}
    </div>
  );
};

// =====================================================================
// Impressão (receita.fr3)
// =====================================================================
const Impressao: React.FC<{ id: number; onFechar: (imprimiu: boolean) => void }> = ({ id, onFechar }) => {
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { get(`/api/receitas/${id}/impressao`).then(setD).catch((e) => setErro(e.message)); }, [id]);

  // Marca como impressa ao fim de qualquer impressão (botão ou Ctrl+P), uma vez só
  const marcada = useRef(false);
  const marcar = async () => {
    if (marcada.current) return;
    marcada.current = true;
    try {
      await send('POST', `/api/receitas/${id}/impressa`);
      onFechar(true);
    } catch (e: any) {
      marcada.current = false;
      setErro(`A receita foi impressa, mas não ficou marcada como impressa: ${e.message}`);
    }
  };
  useEffect(() => {
    if (!d) return;
    const depois = () => { marcar(); };
    window.addEventListener('afterprint', depois);
    return () => window.removeEventListener('afterprint', depois);
  }, [d]);

  const imprimir = () => {
    try { window.print(); } catch { /* navegador sem impressão: marca do mesmo jeito */ }
    marcar();
  };

  if (erro || !d) {
    return (
      <Modal isOpen onClose={() => onFechar(false)} title="Imprimir receita" size="sm">
        {erro ? <Erro msg={erro} inline onFechar={() => onFechar(false)} /> : <div className="text-xs text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Preparando…</div>}
      </Modal>
    );
  }
  const { receita: r, produtos, profissional: p, cliente: c, empresa: e } = d;
  const L = 'text-[9px] uppercase text-stone-500';
  return (
    <div className="area-impressao fixed inset-0 z-[70] bg-white text-black overflow-auto print:static print:overflow-visible">
      <div className="print:hidden sticky top-0 bg-stone-100 border-b p-2 flex gap-2 justify-end">
        <button type="button" onClick={() => onFechar(false)} className={BTN_SECUNDARIO}>Fechar</button>
        <button type="button" onClick={imprimir} className={BTN_PRIMARIO}><Printer className="w-3.5 h-3.5" />Imprimir</button>
      </div>
      <div className="max-w-[210mm] mx-auto p-6 text-[11px] leading-snug space-y-3">
        <div className="flex justify-between border-b-2 border-black pb-2">
          <div>
            <div className="text-base font-bold">RECEITA AGRONÔMICA</div>
            <div>{e.fantasia || e.nome} • CNPJ {formatDoc(e.cnpj)} • {e.cidade}/{e.uf}</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-sm">Nº {r.numeroReceitaFull || r.numeroReceita}</div>
            <div>ART {r.numeroArt} • {formatDateBR(r.data)}</div>
            {r.numeroReceitaCidasc > 0 && <div>CIDASC nº {r.numeroReceitaCidasc}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><div className={L}>Produtor</div><b>{c.nome}</b><br />{formatDoc(c.doc)} {c.iprural && `• IPR ${c.iprural}`}<br />{c.endereco} {c.numero} {c.bairro} • {c.cidade}/{c.uf}</div>
          <div><div className={L}>Local da aplicação</div>{r.localAplicacao}<br />Lat {r.latitude} • Lon {r.longitude} • Alt {r.altitude} m<br />Cultura: <b>{r.culturaNome}</b></div>
        </div>
        {produtos.map((x: any, i: number) => (
          <div key={x.id} className="border border-black p-2 break-inside-avoid space-y-1">
            <div className="flex justify-between font-bold"><span>{i + 1}. {x.defensivo}</span><span>Classe: {x.classificacaoToxicologica}</span></div>
            <div>Ingredientes: {x.ingredientes}</div>
            <div>Praga: <b>{x.praga}</b> <i>({x.pragaCientifico})</i> {x.estagioProblema && `• ${x.estagioProblema}`}</div>
            <div className="grid grid-cols-4 gap-1">
              <div><span className={L}>Dose</span><br />{formatDecimal(x.dose, 4)} {x.doseUn}</div>
              <div><span className={L}>Calda</span><br />{x.calda} L/ha</div>
              <div><span className={L}>Área / aplicações</span><br />{formatDecimal(x.area, 2)} {x.areaUn} • {x.nrAplic}x</div>
              <div><span className={L}>Quantidade</span><br /><b>{formatDecimal(x.qtdade, 4)} {x.qtdadeUn}</b></div>
            </div>
            <div>Aplicação: {x.aplicacao} {x.aplicacaoLiberado && `• ${x.aplicacaoLiberado}`} • Carência: {x.carencia}</div>
            {x.diagnostico && <div>Diagnóstico: {x.diagnostico}</div>}
            {x.modoAplicacao && <div className="whitespace-pre-line"><span className={L}>Modo de aplicação</span><br />{x.modoAplicacao}</div>}
            {x.precaucoesUso && <div className="whitespace-pre-line"><span className={L}>Precauções de uso</span><br />{x.precaucoesUso}</div>}
          </div>
        ))}
        {(r.recomendacoes || r.obs.some(Boolean)) && (
          <div><div className={L}>Recomendações e observações</div>{r.recomendacoes}{r.obs.filter(Boolean).map((o: string, i: number) => <div key={i}>{o}</div>)}</div>
        )}
        <div className="grid grid-cols-2 gap-8 pt-10">
          <div className="border-t border-black text-center pt-1">{p.nome}<br />{p.titulo} • {p.registro}</div>
          <div className="border-t border-black text-center pt-1">{c.nome}<br />Produtor</div>
        </div>
        {/* ponytail: sem QR code nem PDF/FTP; a chave fica impressa para conferência */}
        <div className="text-[9px] text-stone-500 text-center">Chave {r.chavePdf}</div>
      </div>
    </div>
  );
};

/** Coluna Ações mais larga: aqui ficam até 5 ícones soltos (exceção pedida ao padrão do menu "...") */
const largura4 = (c: string) => `${c.replace(/(min-w|max-w|w)-24/g, '')} w-40 min-w-40 max-w-40`;
const TH_ACOES_4 = largura4(TH_ACOES);
const TD_ACOES_4 = largura4(TD_ACOES);

// =====================================================================
// Lista
// =====================================================================
export const ReceitasView: React.FC = () => {
  const [apoio, setApoio] = useState<Apoio | null>(null);
  const [lista, setLista] = useState<Receita[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [filtro, setFiltro] = useState({ art: 0, d1: hojeISO(-90), d2: '' });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Abas abertas sobre a lista (modelo do CrudView do crmWeb); `uid` fixo para a aba não remontar ao gravar a inclusão
  const [abas, setAbas] = useState<{ uid: number; id: number; titulo: string; clonarDe?: number }[]>([]);
  const [abaAtiva, setAbaAtiva] = useState(0);
  const [imprimindo, setImprimindo] = useState<number | null>(null);
  const [excluindo, setExcluindo] = useState<Receita | null>(null);
  const [processando, setProcessando] = useState(false);
  // Envio ou cancelamento no SIGEN da CIDASC (receita_e.exe)
  const [cidasc, setCidasc] = useState<{ r: Receita; cancelar: boolean } | null>(null);
  // Ambiente do SIGEN (rec_config.url_ws), mostrado na confirmação do envio
  const [sigenProducao, setSigenProducao] = useState<boolean | null>(null);
  useEffect(() => {
    if (cidasc) get<{ urlWs: string }>('/api/rec-config').then((c) => setSigenProducao(!/homologacao/i.test(c.urlWs))).catch(() => setSigenProducao(null));
  }, [cidasc]);

  const confirmarCidasc = async () => {
    if (!cidasc) return;
    let falha = '';
    try {
      setProcessando(true);
      const r = await send<{ mensagem: string }>('POST', `/api/receitas/${cidasc.r.id}/cidasc${cidasc.cancelar ? '/cancelar' : ''}`);
      toast(r.mensagem);
    } catch (e: any) {
      falha = e.message;
    } finally {
      setProcessando(false);
      setCidasc(null);
      // Recarrega antes de mostrar o erro: o carregar limpa o aviso
      await carregar();
      if (falha) setErro(falha);
    }
  };

  const carregar = async () => {
    try {
      setLoading(true);
      setErro(null);
      const r = await get<{ truncated: boolean; receitas: Receita[] }>(`/api/receitas${qs({ art: filtro.art || '', d1: filtro.d1, d2: filtro.d2 })}`);
      setLista(r.receitas);
      setTruncado(r.truncated);
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { get<Apoio>('/api/receitas/apoio').then(setApoio).catch((e) => setErro(e.message)); }, []);
  useEffect(() => { carregar(); }, [filtro]);

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    try {
      setProcessando(true);
      const r = await send<{ mensagem: string }>('DELETE', `/api/receitas/${excluindo.id}`);
      toast(r.mensagem);
      carregar();
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setProcessando(false);
      setExcluindo(null);
    }
  };

  /** id 0 = inclusão (reaproveita a aba "Nova" já aberta) */
  const abrir = (id: number) => {
    const existente = abas.find((a) => a.id === id && !a.clonarDe);
    if (existente) return setAbaAtiva(existente.uid);
    const uid = Date.now();
    const r = lista.find((x) => x.id === id);
    setAbas([...abas, { uid, id, titulo: r ? `Receita ${r.numeroReceitaFull || r.numeroReceita || `#${id}`}` : 'Nova receita' }]);
    setAbaAtiva(uid);
  };

  /** Clonar: abre uma aba de inclusão já preenchida com a receita escolhida */
  const clonar = (r: Receita) => {
    const uid = Date.now();
    setAbas([...abas, { uid, id: 0, clonarDe: r.id, titulo: `Cópia de ${r.numeroReceitaFull || r.numeroReceita || `#${r.id}`}` }]);
    setAbaAtiva(uid);
  };

  // Abas com alteração não gravada: fechar pede confirmação
  const alteradas = useRef(new Set<number>());
  const [fechando, setFechando] = useState<number | null>(null);
  const fechar = (uid: number) => (alteradas.current.has(uid) ? setFechando(uid) : fecharJa(uid));

  const fecharJa = (uid: number) => {
    alteradas.current.delete(uid);
    setFechando(null);
    const i = abas.findIndex((a) => a.uid === uid);
    const restantes = abas.filter((a) => a.uid !== uid);
    setAbas(restantes);
    // Fechando a ativa, vai para a vizinha à esquerda (ou a lista)
    if (abaAtiva === uid) setAbaAtiva(restantes[Math.max(0, i - 1)]?.uid ?? 0);
    carregar();
  };

  const carregou = (uid: number, r: Receita) => {
    const titulo = `Receita ${r.numeroReceitaFull || r.numeroReceita || `#${r.id}`}`;
    setAbas((prev) => prev.map((a) => (a.uid === uid && (a.id !== r.id || a.titulo !== titulo) ? { ...a, id: r.id, titulo } : a)));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <BarraAbas rotulo="Receitas" total={lista.length} abas={abas.map((a) => ({ uid: a.uid, titulo: a.titulo, novo: !a.id }))}
        ativa={abaAtiva} onAtivar={setAbaAtiva} onFechar={fechar} />

      {/* Abas ficam montadas (escondidas) para não perder o que está sendo digitado */}
      {apoio && abas.map((a) => (
        <div key={a.uid} className={abaAtiva === a.uid ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
          <ReceitaForm apoio={apoio} idInicial={a.id} clonarDe={a.clonarDe} onFechar={(gravou) => (gravou ? fecharJa(a.uid) : fechar(a.uid))} onCarregou={(r) => carregou(a.uid, r)}
            onAlterou={(sim) => (sim ? alteradas.current.add(a.uid) : alteradas.current.delete(a.uid))} />
        </div>
      ))}

    <div className={abaAtiva === 0 ? PAINEL : 'hidden'}>
      <div className={BARRA}>
        <div className={BARRA_INFO}>{loading ? 'Carregando…' : `${lista.length} receita(s)${truncado ? ' (mostrando as 500 mais recentes)' : ''}`}</div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Selecao value={filtro.art} onChange={(e) => setFiltro({ ...filtro, art: Number(e.target.value) })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} w-44`}>
            <option value={0}>Todas as ARTs</option>
            {apoio?.arts.map((a) => <option key={a.id} value={a.id}>{a.numero}</option>)}
          </Selecao>
          <div className="w-36 shrink-0"><DateField value={filtro.d1} onChange={(d1) => setFiltro({ ...filtro, d1 })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} /></div>
          <div className="w-36 shrink-0"><DateField value={filtro.d2} onChange={(d2) => setFiltro({ ...filtro, d2 })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} placeholder="até hoje" /></div>
          <button type="button" onClick={carregar} disabled={loading} title="Recarregar" className={BTN_SECUNDARIO}><RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" disabled={!apoio} onClick={() => abrir(0)} className={BTN_PRIMARIO}><Plus className="w-3.5 h-3.5" /><span>Nova</span></button>
        </div>
      </div>
      <Erro msg={erro} onFechar={() => setErro(null)} />

      <div className={GRADE_AREA}>
        <table className={TABELA}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={TH_INDICADOR} />
              {['Data', 'Nº', 'Número completo', 'ART', 'Cliente', 'Cultura', 'Profissional', 'Nº CIDASC', 'Situação'].map((h) => <th key={h} className={TH}>{h}</th>)}
              <th className={TH_ACOES_4}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr><td colSpan={11} className={TD_VAZIO}>
                {loading ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</span>
                  : <div className="flex flex-col items-center gap-2"><Inbox className="w-8 h-8" /><span className="text-sm font-medium">Nenhuma receita no período</span></div>}
              </td></tr>
            ) : lista.map((r) => (
              <tr key={r.id} className={TR} onDoubleClick={() => abrir(r.id)}>
                <td className={TD_INDICADOR}><ChevronRight className={INDICADOR} /></td>
                <td className={`${TD} text-center`}>{formatDateBR(r.data)}</td>
                <td className={`${TD} text-right font-mono`}>{r.numeroReceita || '–'}</td>
                <td className={`${TD} font-mono`}>{r.numeroReceitaFull}</td>
                <td className={`${TD} font-mono`}>{r.numeroArt}</td>
                <td className={`${TD} font-semibold`}>{r.cliente}</td>
                <td className={TD}>{r.culturaNome}</td>
                <td className={TD}>{r.profissional}</td>
                <td className={`${TD} text-right font-mono`}>{r.numeroReceitaCidasc || '–'}</td>
                <td className={`${TD} text-center`}>{situacao(r)}</td>
                {/* Exceção pedida: 4 ícones soltos (CIDASC é envio ou cancelamento, nunca os dois) */}
                <td className={TD_ACOES_4}>
                  <div className="inline-flex items-center gap-1">
                    <BotaoAcao icone={Printer} titulo="Imprimir" descricao="imprimir a receita" tom="verde" onClick={() => setImprimindo(r.id)} />
                    {!r.cancelada && !r.numeroReceitaCidasc && <BotaoAcao icone={Send} titulo="Enviar à CIDASC" descricao="transmitir a receita ao SIGEN" onClick={() => setCidasc({ r, cancelar: false })} />}
                    {!!r.numeroReceitaCidasc && !r.canceladaCidasc && <BotaoAcao icone={Ban} titulo="Cancelar na CIDASC" descricao="cancelar a receita no SIGEN" onClick={() => setCidasc({ r, cancelar: true })} />}
                    <BotaoAcao icone={Copy} titulo="Clonar" descricao="nova receita com os dados desta" onClick={() => clonar(r)} />
                    <BotaoAcao icone={Pencil} titulo="Editar" descricao="abrir a receita" onClick={() => abrir(r.id)} />
                    {!r.cancelada && <BotaoAcao icone={Trash2} titulo="Excluir" descricao="cancelar ou excluir a receita" tom="perigo" onClick={() => setExcluindo(r)} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      </div>
      {imprimindo !== null && <Impressao id={imprimindo} onFechar={(ok) => { setImprimindo(null); if (ok) carregar(); }} />}
      {fechando !== null && (
        <ConfirmModal
          titulo="Descartar alterações"
          mensagem={<>A receita <strong>{abas.find((a) => a.uid === fechando)?.titulo}</strong> tem alterações não gravadas. Fechar a aba e descartar?</>}
          textoConfirmar="Descartar"
          onConfirmar={() => fecharJa(fechando)}
          onCancelar={() => setFechando(null)}
        />
      )}
      {cidasc && (
        <ConfirmModal
          titulo={cidasc.cancelar ? 'Cancelar na CIDASC' : 'Enviar à CIDASC'}
          subtitulo={sigenProducao === null ? undefined : sigenProducao ? 'Ambiente: PRODUÇÃO' : 'Ambiente: homologação (testes)'}
          mensagem={cidasc.cancelar
            ? <>Cancelar no SIGEN a receita <strong>{cidasc.r.numeroReceitaFull}</strong> (CIDASC nº {cidasc.r.numeroReceitaCidasc}) de {cidasc.r.cliente}?</>
            : <>Transmitir ao SIGEN da CIDASC a receita <strong>{cidasc.r.numeroReceitaFull || `#${cidasc.r.id}`}</strong> de {cidasc.r.cliente}? {!cidasc.r.numeroReceita && 'A receita recebe o número agora.'} Depois de enviada, ela não pode mais ser alterada.</>}
          textoConfirmar={cidasc.cancelar ? 'Cancelar na CIDASC' : 'Enviar'}
          neutro={!cidasc.cancelar}
          icone={cidasc.cancelar ? Ban : Send}
          processando={processando}
          onConfirmar={confirmarCidasc}
          onCancelar={() => setCidasc(null)}
        />
      )}
      {excluindo && (
        <ConfirmModal
          titulo="Cancelar / excluir receita"
          mensagem={<>Receita <strong>{excluindo.numeroReceitaFull || `#${excluindo.id}`}</strong> de {excluindo.cliente}. Se já foi impressa ou não é a última da ART, ela será <strong>cancelada</strong>; senão é excluída. Continuar?</>}
          processando={processando}
          onConfirmar={confirmarExclusao}
          onCancelar={() => setExcluindo(null)}
        />
      )}
    </div>
  );
};
