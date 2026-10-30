import React, { useEffect, useState } from 'react';
import { Ban, ChevronRight, Inbox, Loader2, Plus, RefreshCw, Save, Search, Send, Trash2, FolderOpen } from 'lucide-react';
import { get, send } from '../services/api';
import { formatDateBR, formatDoc, formatQtd, hojeISO } from '../utils/formatters';
import { INPUT_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import {
  PAINEL, BARRA, BARRA_INFO, BTN_PRIMARIO, BTN_SECUNDARIO, GRADE_AREA, TABELA, TH, TH_INDICADOR, TH_ACOES, TR, TD,
  TD_INDICADOR, TD_ACOES, INDICADOR, TD_VAZIO,
} from '../utils/listaStyles';
import { AvisoErro } from './AvisoErro';
import { toast } from './Toast';
import { ConfirmModal } from './ConfirmModal';
import { DateField } from './DateField';
import { Toggle } from './Toggle';
import { BotaoAcao } from './MenuAcoes';
import { BarraAbas, AbaAberta } from './BarraAbas';
import { usePaginacao } from './Paginacao';

interface Mestre { id: number; geradoEm: string; dataInicial: string; dataFinal: string; total: number; enviados: number; erros: number }
interface Item {
  id: number; tipo: string; natureza: string; serie: string; numero: number; documento: string; pessoa: string; data: string;
  lote: string; produto: string; un: string; qtd: number; receita: string; statusEnvio: string; statusCanc: string; mensagem: string; dica?: string;
}
type Aba = AbaAberta & { id: number };

/** Semana atual, de segunda a domingo (StartOfTheWeek/EndOfTheWeek do Delphi) */
function semanaAtual() {
  const dia = new Date().getDay() || 7;
  return { d1: hojeISO(1 - dia), d2: hojeISO(7 - dia) };
}

const TIPOS: Record<string, string> = { VE: 'Venda', CO: 'Compra', DE: 'Devolução', TR: 'Transferência', US: 'Uso', AC: 'Acerto' };

const Situacao: React.FC<{ i: Item }> = ({ i }) => {
  const [txt, cor] =
    i.statusCanc === 'S' ? ['Cancelado', 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300']
      : i.statusCanc === 'E' ? ['Erro ao cancelar', 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400']
        : i.statusEnvio === 'S' ? ['Enviado', 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400']
          : i.statusEnvio === 'E' ? ['Erro', 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400']
            : ['Pendente', 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'];
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${cor}`}>{txt}</span>;
};

/** Grade dos itens (prévia ou movimento gravado) */
const Itens: React.FC<{ itens: Item[]; carregando: boolean; vazio: string; acoes?: (i: Item) => React.ReactNode }> = ({ itens, carregando, vazio, acoes }) => (
  <div className={GRADE_AREA}>
    <table className={TABELA}>
      <thead className="sticky top-0 z-10">
        <tr>
          <th className={TH_INDICADOR} />
          {['Data', 'Operação', 'E/S', 'Nota', 'Documento', 'Pessoa', 'Produto', 'Lote', 'Qtd.', 'Un.', 'Receita', ...(acoes ? ['Situação', 'Retorno do SIGEN'] : [])].map((h) => <th key={h} className={TH}>{h}</th>)}
          {acoes && <th className={TH_ACOES}>Ações</th>}
        </tr>
      </thead>
      <tbody>
        {itens.length === 0 ? (
          <tr><td colSpan={16} className={TD_VAZIO}>
            {carregando ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</span>
              : <div className="flex flex-col items-center gap-2"><Inbox className="w-8 h-8" /><span className="text-sm font-medium">{vazio}</span></div>}
          </td></tr>
        ) : itens.map((i, k) => (
          <tr key={i.id || k} className={TR}>
            <td className={TD_INDICADOR}><ChevronRight className={INDICADOR} /></td>
            <td className={`${TD} text-center`}>{formatDateBR(i.data)}</td>
            <td className={TD}>{TIPOS[i.tipo] || i.tipo}</td>
            <td className={`${TD} text-center`}>{i.natureza}</td>
            <td className={`${TD} text-right font-mono`}>{i.serie}/{i.numero}</td>
            <td className={`${TD} font-mono`}>{formatDoc(i.documento)}</td>
            <td className={`${TD} font-semibold`}>{i.pessoa}</td>
            <td className={TD}>{i.produto}</td>
            <td className={`${TD} font-mono`}>{i.lote}</td>
            <td className={`${TD} text-right font-mono`}>{formatQtd(i.qtd)}</td>
            <td className={`${TD} text-center`}>{i.un}</td>
            <td className={`${TD} font-mono`}>{i.receita}</td>
            {acoes && <td className={`${TD} text-center`}><Situacao i={i} /></td>}
            {acoes && (
              <td className={`${TD} max-w-96`} title={i.mensagem}>
                <div className="truncate">{i.mensagem}</div>
                {i.dica && <div className="text-[11px] whitespace-normal text-amber-700 dark:text-amber-400">{i.dica}</div>}
              </td>
            )}
            {acoes && <td className={TD_ACOES}><div className="inline-flex items-center gap-1">{acoes(i)}</div></td>}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Erro: React.FC<{ msg: string | null; onFechar: () => void }> = ({ msg, onFechar }) =>
  msg ? <AvisoErro mensagem={msg} onFechar={onFechar} className="mx-4 my-3 shrink-0" /> : null;

/** Gera a prévia do período e grava o movimento */
const NovoMovimento: React.FC<{ onGravou: (id: number) => void }> = ({ onGravou }) => {
  const [p, setP] = useState(semanaAtual);
  const [itens, setItens] = useState<Item[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gerar = async () => {
    setErro(null); setCarregando(true); setItens(null);
    try { setItens(await send<Item[]>('POST', '/api/movimentos/gerar', p)); } catch (e: any) { setErro(e.message); } finally { setCarregando(false); }
  };
  const gravar = async () => {
    setErro(null); setGravando(true);
    try {
      const r = await send<{ id: number; itens: number }>('POST', '/api/movimentos', p);
      toast(`Movimento gravado: ${r.itens} item(ns).`);
      onGravou(r.id);
    } catch (e: any) { setErro(e.message); } finally { setGravando(false); }
  };

  return (
    <div className={PAINEL}>
      <div className={BARRA}>
        <div className={BARRA_INFO}>{itens ? `${itens.length} item(ns) no período` : 'Escolha o período e gere o movimento'}</div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-36 shrink-0"><DateField value={p.d1} onChange={(d1) => { setP({ ...p, d1 }); setItens(null); }} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} /></div>
          <div className="w-36 shrink-0"><DateField value={p.d2} onChange={(d2) => { setP({ ...p, d2 }); setItens(null); }} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`} /></div>
          <button type="button" onClick={gerar} disabled={carregando || !p.d1 || !p.d2} className={BTN_SECUNDARIO}>
            {carregando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}<span>Gerar</span>
          </button>
          <button type="button" onClick={gravar} disabled={gravando || !itens?.length} className={BTN_PRIMARIO}>
            {gravando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}<span>Gravar movimento</span>
          </button>
        </div>
      </div>
      <Erro msg={erro} onFechar={() => setErro(null)} />
      <Itens itens={itens || []} carregando={carregando} vazio={itens ? 'Nenhum movimento a enviar no período' : 'Clique em Gerar para ver o movimento do período'} />
    </div>
  );
};

/** Itens de um movimento gravado: envio e cancelamento no SIGEN */
const Movimento: React.FC<{ id: number; sigenProducao: boolean | null; onMudou: () => void; onExcluiu: () => void }> = ({ id, sigenProducao, onMudou, onExcluiu }) => {
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pendentes, setPendentes] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<{ tipo: 'enviar' | 'cancelar' | 'excluir'; item?: Item } | null>(null);
  const [processando, setProcessando] = useState(false);

  const carregar = () => {
    setCarregando(true);
    return get<Item[]>(`/api/movimentos/${id}`).then(setItens).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  };
  useEffect(() => { carregar(); }, [id]);

  const aEnviar = itens.filter((i) => i.statusEnvio !== 'S');
  const enviados = itens.filter((i) => i.statusEnvio === 'S');

  const confirmar = async () => {
    if (!acao) return;
    setProcessando(true); setErro(null);
    let falha: string | null = null;
    try {
      if (acao.tipo === 'excluir') {
        const r = await send<{ excluidos: number; restantes: number }>('DELETE', `/api/movimentos/${id}`);
        toast(`${r.excluidos} item(ns) excluído(s).`);
        setAcao(null);
        if (!r.restantes) { onExcluiu(); return; }
      } else {
        const r = await send<{ ok: number; falhas: string[] }>('POST', `/api/movimentos/${id}/enviar`, {
          cancelar: acao.tipo === 'cancelar', itens: acao.item ? [acao.item.id] : undefined,
        });
        if (r.ok) toast(`${r.ok} item(ns) ${acao.tipo === 'cancelar' ? 'cancelado(s)' : 'enviado(s)'} na CIDASC.`);
        if (r.falhas.length) falha = `${r.falhas.length} item(ns) recusado(s) pelo SIGEN:\n${r.falhas.slice(0, 10).join('\n')}${r.falhas.length > 10 ? '\n…' : ''}`;
      }
      setAcao(null);
    } catch (e: any) {
      falha = e.message;
      setAcao(null);
    } finally {
      setProcessando(false);
    }
    await carregar();
    onMudou();
    if (falha) setErro(falha);
  };

  const lista = pendentes ? aEnviar : itens;
  const qual = acao?.item ? <><strong>{acao.item.produto}</strong> ({TIPOS[acao.item.tipo] || acao.item.tipo}, nota {acao.item.serie}/{acao.item.numero})</> : null;

  return (
    <div className={PAINEL}>
      <div className={BARRA}>
        <div className={BARRA_INFO}>{carregando ? 'Carregando…' : `${itens.length} item(ns) · ${enviados.length} enviado(s) · ${aEnviar.length} a enviar`}</div>
        <div className="flex items-center gap-2.5 shrink-0">
          <Toggle checked={pendentes} onChange={setPendentes} label={<span className="text-xs text-stone-600 dark:text-stone-300">Só não enviados</span>} />
          <button type="button" onClick={carregar} disabled={carregando} title="Recarregar" className={BTN_SECUNDARIO}><RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={() => setAcao({ tipo: 'excluir' })} disabled={!aEnviar.length} className={BTN_SECUNDARIO}><Trash2 className="w-3.5 h-3.5" /><span>Excluir não enviados</span></button>
          <button type="button" onClick={() => setAcao({ tipo: 'cancelar' })} disabled={!enviados.length} className={BTN_SECUNDARIO}><Ban className="w-3.5 h-3.5" /><span>Cancelar todos</span></button>
          <button type="button" onClick={() => setAcao({ tipo: 'enviar' })} disabled={!aEnviar.length} className={BTN_PRIMARIO}><Send className="w-3.5 h-3.5" /><span>Enviar todos</span></button>
        </div>
      </div>
      <Erro msg={erro} onFechar={() => setErro(null)} />
      <Itens
        itens={lista}
        carregando={carregando}
        vazio="Nenhum item"
        acoes={(i) => (i.statusEnvio === 'S'
          ? <BotaoAcao icone={Ban} titulo="Cancelar na CIDASC" descricao="cancelar este item no SIGEN" tom="perigo" onClick={() => setAcao({ tipo: 'cancelar', item: i })} />
          : <BotaoAcao icone={Send} titulo="Enviar à CIDASC" descricao="enviar este item ao SIGEN" onClick={() => setAcao({ tipo: 'enviar', item: i })} />)}
      />
      {acao && (
        <ConfirmModal
          titulo={acao.tipo === 'excluir' ? 'Excluir itens não enviados' : acao.tipo === 'cancelar' ? 'Cancelar na CIDASC' : 'Enviar à CIDASC'}
          subtitulo={acao.tipo === 'excluir' || sigenProducao === null ? undefined : sigenProducao ? 'Ambiente: PRODUÇÃO' : 'Ambiente: homologação (testes)'}
          mensagem={acao.tipo === 'excluir'
            ? <>Excluir os <strong>{aEnviar.length}</strong> item(ns) ainda não enviados? Eles voltam a aparecer ao gerar um novo movimento do período.{!enviados.length && ' O movimento fica vazio e também é excluído.'}</>
            : acao.tipo === 'cancelar'
              ? <>Cancelar no SIGEN {qual || <><strong>todos os {enviados.length}</strong> item(ns) enviados</>}?</>
              : <>Enviar ao SIGEN da CIDASC {qual || <><strong>todos os {aEnviar.length}</strong> item(ns) não enviados</>}?</>}
          textoConfirmar={acao.tipo === 'excluir' ? 'Excluir' : acao.tipo === 'cancelar' ? 'Cancelar na CIDASC' : 'Enviar'}
          neutro={acao.tipo === 'enviar'}
          icone={acao.tipo === 'excluir' ? Trash2 : acao.tipo === 'cancelar' ? Ban : Send}
          processando={processando}
          onConfirmar={confirmar}
          onCancelar={() => setAcao(null)}
        />
      )}
    </div>
  );
};

/** Movimento de agrotóxicos para a CIDASC (ufrmEnviarMovimento do receita_e.exe) */
export const MovimentoView: React.FC = () => {
  const [mestres, setMestres] = useState<Mestre[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abas, setAbas] = useState<Aba[]>([]);
  const [ativa, setAtiva] = useState(0);
  const [sigenProducao, setSigenProducao] = useState<boolean | null>(null);
  const [uid, setUid] = useState(1);

  const carregar = () => {
    setCarregando(true);
    return get<Mestre[]>('/api/movimentos').then((m) => { setMestres(m); setErro(null); }).catch((e) => setErro(e.message)).finally(() => setCarregando(false));
  };
  useEffect(() => {
    carregar();
    get<{ urlWs: string }>('/api/rec-config').then((c) => setSigenProducao(!c.urlWs.includes('homologacao'))).catch(() => {});
  }, []);

  const periodo = (m: { dataInicial: string; dataFinal: string }) => `${formatDateBR(m.dataInicial)} a ${formatDateBR(m.dataFinal)}`;
  const abrir = (id: number, titulo?: string) => {
    const ja = abas.find((a) => a.id === id);
    if (ja) { setAtiva(ja.uid); return; }
    const m = mestres.find((x) => x.id === id);
    setAbas((as) => [...as, { uid, id, novo: !id, titulo: id ? titulo || `Movimento ${m ? periodo(m) : `#${id}`}` : 'Novo movimento' }]);
    setAtiva(uid);
    setUid(uid + 1);
  };
  const fechar = (u: number) => { setAbas((as) => as.filter((a) => a.uid !== u)); if (ativa === u) setAtiva(0); };

  const paginacao = usePaginacao(mestres, '');

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <BarraAbas rotulo="Movimentos" total={mestres.length} abas={abas} ativa={ativa} onAtivar={setAtiva} onFechar={fechar} />

      {abas.map((a) => (
        <div key={a.uid} className={ativa === a.uid ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
          {a.id
            ? <Movimento id={a.id} sigenProducao={sigenProducao} onMudou={carregar} onExcluiu={() => { fechar(a.uid); carregar(); }} />
            : <NovoMovimento onGravou={async (id) => {
              await carregar();
              setAbas((as) => as.map((x) => (x.uid === a.uid ? { ...x, id, novo: false, titulo: `Movimento #${id}` } : x)));
            }} />}
        </div>
      ))}

      <div className={ativa === 0 ? PAINEL : 'hidden'}>
        <div className={BARRA}>
          <div className={BARRA_INFO}>
            {carregando ? 'Carregando…' : `${mestres.length} movimento(s)`}
            {sigenProducao !== null && <> · SIGEN: {sigenProducao ? <strong className="text-rose-600">produção</strong> : 'homologação (testes)'}</>}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {paginacao.seletor}
            <button type="button" onClick={carregar} disabled={carregando} title="Recarregar" className={BTN_SECUNDARIO}><RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={() => abrir(0)} className={BTN_PRIMARIO}><Plus className="w-3.5 h-3.5" /><span>Novo movimento</span></button>
          </div>
        </div>
        <Erro msg={erro} onFechar={() => setErro(null)} />

        <div className={GRADE_AREA}>
          <table className={TABELA}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={TH_INDICADOR} />
                {['Nº', 'Gerado em', 'Período', 'Itens', 'Enviados', 'Com erro', 'Situação'].map((h) => <th key={h} className={TH}>{h}</th>)}
                <th className={TH_ACOES}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {mestres.length === 0 ? (
                <tr><td colSpan={9} className={TD_VAZIO}>
                  {carregando ? <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</span>
                    : <div className="flex flex-col items-center gap-2"><Inbox className="w-8 h-8" /><span className="text-sm font-medium">Nenhum movimento gravado</span></div>}
                </td></tr>
              ) : paginacao.visiveis.map((m) => (
                <tr key={m.id} className={TR} onDoubleClick={() => abrir(m.id)}>
                  <td className={TD_INDICADOR}><ChevronRight className={INDICADOR} /></td>
                  <td className={`${TD} text-right font-mono`}>{m.id}</td>
                  <td className={`${TD} text-center`}>{formatDateBR(m.geradoEm)} {m.geradoEm.slice(11, 16)}</td>
                  <td className={`${TD} text-center`}>{periodo(m)}</td>
                  <td className={`${TD} text-right font-mono`}>{m.total}</td>
                  <td className={`${TD} text-right font-mono`}>{m.enviados}</td>
                  <td className={`${TD} text-right font-mono ${m.erros ? 'text-rose-600 font-semibold' : ''}`}>{m.erros}</td>
                  <td className={`${TD} text-center`}>
                    {m.total && m.enviados === m.total
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">Enviado</span>
                      : <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Pendente</span>}
                  </td>
                  <td className={TD_ACOES}>
                    <BotaoAcao icone={FolderOpen} titulo="Abrir" descricao="ver, enviar ou cancelar os itens" onClick={() => abrir(m.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paginacao.rodape}
      </div>
    </div>
  );
};
