import React, { useEffect, useMemo, useState } from 'react';
import { CloudDownload, FlaskConical, Sprout, Bug, Search, RefreshCw, Inbox } from 'lucide-react';
import { get } from '../services/api';
import { INPUT_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { PAINEL, BARRA, BARRA_INFO, BTN_PRIMARIO, BTN_SECUNDARIO, GRADE_AREA, TABELA, TH, TR, TD, TD_VAZIO } from '../utils/listaStyles';
import { abaClasse, abaTexto } from './BarraAbas';
import { AvisoErro } from './AvisoErro';
import { ConfirmModal } from './ConfirmModal';
import { toast } from './Toast';
import { useProgresso } from './ProgressoModal';

type Tipo = 'agrotoxicos' | 'culturas' | 'pragas';
interface Linha { id: number; nome: string; registroMapa?: string; situacao?: string }

const ABAS: { tipo: Tipo; rotulo: string; icone: typeof Bug; nome: string }[] = [
  { tipo: 'agrotoxicos', rotulo: 'Agrotóxicos', icone: FlaskConical, nome: 'Marca comercial' },
  { tipo: 'culturas', rotulo: 'Culturas', icone: Sprout, nome: 'Nome comum' },
  { tipo: 'pragas', rotulo: 'Pragas', icone: Bug, nome: 'Nome científico' },
];

/**
 * Tabelas da CIDASC (ufrmAtualizar): atualiza agrotóxicos, culturas e pragas pelo SIGEN
 * e mostra cada tabela numa aba para conferência.
 */
export const TabelasCidascView: React.FC = () => {
  const [tipo, setTipo] = useState<Tipo>('agrotoxicos');
  const [dados, setDados] = useState<Partial<Record<Tipo, Linha[]>>>({});
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const progresso = useProgresso();

  const carregar = async (t: Tipo) => {
    try {
      setCarregando(true);
      const linhas = await get<Linha[]>(`/api/cidasc/tabela/${t}`);
      setDados((d) => ({ ...d, [t]: linhas }));
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { if (!dados[tipo]) carregar(tipo); }, [tipo]);

  const atualizar = async () => {
    setConfirmar(false);
    try {
      const r = await progresso.executar('Atualizando as tabelas da CIDASC', '/api/cidasc/atualizar-tabelas');
      toast(`Tabelas da CIDASC (${r.ambiente}) atualizadas: ${r.agrotoxicos} agrotóxico(s), ${r.culturas} cultura(s) e ${r.pragas} praga(s).`);
      setDados({});
      carregar(tipo);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const linhas = dados[tipo] || [];
  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return q ? linhas.filter((l) => `${l.id} ${l.nome} ${l.registroMapa || ''} ${l.situacao || ''}`.toUpperCase().includes(q)) : linhas;
  }, [linhas, busca]);
  const aba = ABAS.find((a) => a.tipo === tipo)!;
  const agro = tipo === 'agrotoxicos';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-stretch bg-stone-100 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 overflow-x-auto overflow-y-hidden shrink-0">
        {ABAS.map(({ tipo: t, rotulo, icone: Icone }) => (
          <div key={t} className={`${abaClasse(tipo === t)} px-4`}>
            <button type="button" onClick={() => { setTipo(t); setBusca(''); }} className={abaTexto(tipo === t)}>
              <Icone className="w-3.5 h-3.5" /><span>{rotulo}</span>
              {dados[t] && <span className="text-[10px] font-mono text-stone-400">{dados[t]!.length}</span>}
            </button>
          </div>
        ))}
      </div>

      <div className={PAINEL}>
        <div className={BARRA}>
          <div className={BARRA_INFO}>{carregando ? 'Carregando…' : `${filtradas.length} de ${linhas.length} registro(s)`}</div>
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative w-52 sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Buscar…" className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} pl-9`} />
            </div>
            <button type="button" onClick={() => carregar(tipo)} disabled={carregando} title="Recarregar" className={BTN_SECUNDARIO}>
              <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => setConfirmar(true)} title="Baixar do SIGEN as tabelas de agrotóxicos, culturas e pragas da CIDASC" className={BTN_PRIMARIO}>
              <CloudDownload className="w-3.5 h-3.5" /><span>Atualizar do SIGEN</span>
            </button>
          </div>
        </div>
        {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="mx-4 my-3 shrink-0" />}

        <div key={tipo} className={GRADE_AREA}>
          <table className={TABELA}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${TH} w-24`}>Código</th>
                <th className={`${TH} text-left`}>{aba.nome}</th>
                {agro && <th className={`${TH} w-32`}>Registro MAPA</th>}
                {agro && <th className={`${TH} w-24`}>Situação</th>}
              </tr>
            </thead>
            <tbody>
              {filtradas.map((l) => (
                <tr key={l.id} className={TR}>
                  <td className={`${TD} text-right font-mono`}>{l.id}</td>
                  <td className={TD}>{l.nome}</td>
                  {agro && <td className={`${TD} font-mono`}>{l.registroMapa}</td>}
                  {agro && <td className={`${TD} text-center`}>{l.situacao}</td>}
                </tr>
              ))}
              {!carregando && !filtradas.length && (
                <tr><td colSpan={agro ? 4 : 2} className={TD_VAZIO}><Inbox className="w-6 h-6 mx-auto mb-2" />Nenhum registro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {progresso.modal}
      {confirmar && (
        <ConfirmModal
          titulo="Atualizar do SIGEN"
          mensagem={<>Substituir as tabelas de <strong>agrotóxicos, culturas e pragas</strong> da CIDASC pelas listas atuais do SIGEN? Os vínculos já feitos continuam.</>}
          textoConfirmar="Atualizar tabelas"
          onConfirmar={atualizar}
          onCancelar={() => setConfirmar(false)}
        />
      )}
    </div>
  );
};
