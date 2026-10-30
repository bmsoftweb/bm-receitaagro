import React, { useEffect, useMemo, useState } from 'react';
import { CloudDownload, FlaskConical, Sprout, Bug, MapPin, Signpost, Ruler, Divide, Package, Search, RefreshCw, Inbox, ChevronRight } from 'lucide-react';
import { get } from '../services/api';
import { formatDecimal } from '../utils/formatters';
import { INPUT_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { PAINEL, BARRA, BARRA_INFO, BTN_PRIMARIO, BTN_SECUNDARIO, GRADE_AREA, TABELA, TH, TH_INDICADOR, TR, TD, TD_INDICADOR, INDICADOR, TD_VAZIO } from '../utils/listaStyles';
import { abaClasse, abaTexto } from './BarraAbas';
import { AvisoErro } from './AvisoErro';
import { ConfirmModal } from './ConfirmModal';
import { toast } from './Toast';
import { useProgresso } from './ProgressoModal';
import { usePaginacao } from './Paginacao';

type Linha = Record<string, string | number | null>;
interface Coluna { campo: string; titulo: string; classe?: string; formato?: (v: Linha[string]) => React.ReactNode }
interface Aba { tipo: string; rotulo: string; icone: typeof Bug; colunas: Coluna[] }

const CODIGO: Coluna = { campo: 'id', titulo: 'Código', classe: 'text-right font-mono w-24' };
const NUM = 'text-right font-mono w-28';
const ABAS: Aba[] = [
  { tipo: 'agrotoxicos', rotulo: 'Agrotóxicos', icone: FlaskConical, colunas: [CODIGO, { campo: 'nome', titulo: 'Marca comercial' }, { campo: 'mapa', titulo: 'Registro MAPA', classe: 'font-mono w-32' }, { campo: 'situacao', titulo: 'Situação', classe: 'text-center w-24' }] },
  { tipo: 'culturas', rotulo: 'Culturas', icone: Sprout, colunas: [CODIGO, { campo: 'nome', titulo: 'Nome comum' }] },
  { tipo: 'pragas', rotulo: 'Pragas', icone: Bug, colunas: [CODIGO, { campo: 'nome', titulo: 'Nome científico' }] },
  { tipo: 'localidades', rotulo: 'Localidades', icone: MapPin, colunas: [CODIGO, { campo: 'uf', titulo: 'UF', classe: 'text-center w-16' }, { campo: 'ibge', titulo: 'IBGE', classe: 'font-mono w-24' }, { campo: 'municipio', titulo: 'Município' }, { campo: 'nome', titulo: 'Localidade' }] },
  { tipo: 'logradouros', rotulo: 'Tipos de logradouro', icone: Signpost, colunas: [CODIGO, { campo: 'nome', titulo: 'Descrição' }] },
  { tipo: 'unidades', rotulo: 'Unidades de medida', icone: Ruler, colunas: [CODIGO, { campo: 'sigla', titulo: 'Sigla', classe: 'font-mono w-24' }, { campo: 'nome', titulo: 'Descrição' }] },
  { tipo: 'derivadas', rotulo: 'Unidades derivadas', icone: Divide, colunas: [CODIGO, { campo: 'sigla', titulo: 'Unidade', classe: 'font-mono w-32' }, { campo: 'nome', titulo: 'Descrição' }, { campo: 'empregada', titulo: 'Un. empregada', classe: NUM }, { campo: 'aplicacao', titulo: 'Un. aplicação', classe: NUM }] },
  { tipo: 'embalagens', rotulo: 'Embalagens', icone: Package, colunas: [CODIGO, { campo: 'nome', titulo: 'Descrição' }, { campo: 'valor', titulo: 'Valor unitário', classe: NUM, formato: (v) => formatDecimal(Number(v) || 0, 2) }] },
];

/**
 * Tabelas da CIDASC (ufrmAtualizar): atualiza todas pelo SIGEN e mostra cada uma numa aba para conferência.
 */
export const TabelasCidascView: React.FC = () => {
  const [tipo, setTipo] = useState(ABAS[0].tipo);
  const [dados, setDados] = useState<Record<string, Linha[]>>({});
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const progresso = useProgresso();

  const carregar = async (t: string) => {
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
      const resumo = ABAS.map((a) => `${r[a.tipo]} ${a.rotulo.toLowerCase()}`).join(', ');
      toast(`Tabelas da CIDASC (${r.ambiente}) atualizadas: ${resumo}.`);
      setDados({});
      carregar(tipo);
    } catch (e: any) {
      setErro(e.message);
    }
  };

  const aba = ABAS.find((a) => a.tipo === tipo)!;
  const linhas = dados[tipo] || [];
  const filtradas = useMemo(() => {
    const q = busca.trim().toUpperCase();
    return q ? linhas.filter((l) => aba.colunas.map((c) => l[c.campo] ?? '').join(' ').toUpperCase().includes(q)) : linhas;
  }, [linhas, busca, aba]);
  const paginacao = usePaginacao(filtradas, `${tipo}|${busca}`);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-stretch bg-stone-100 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 overflow-x-auto overflow-y-hidden shrink-0">
        {ABAS.map(({ tipo: t, rotulo, icone: Icone }) => (
          <div key={t} className={`${abaClasse(tipo === t)} px-4`}>
            <button type="button" onClick={() => { setTipo(t); setBusca(''); }} className={abaTexto(tipo === t)}>
              <Icone className="w-3.5 h-3.5" /><span>{rotulo}</span>
              {dados[t] && <span className="text-[10px] font-mono text-stone-400">{dados[t].length}</span>}
            </button>
          </div>
        ))}
      </div>

      <div className={PAINEL}>
        <div className={BARRA}>
          <div className={BARRA_INFO}>
            {carregando ? 'Carregando…' : `${filtradas.length} de ${linhas.length} registro(s)`}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {paginacao.seletor}
            <div className="relative w-52 sm:w-64 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
              <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} onFocus={(e) => e.target.select()} placeholder="Buscar…" className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} pl-9`} />
            </div>
            <button type="button" onClick={() => carregar(tipo)} disabled={carregando} title="Recarregar" className={BTN_SECUNDARIO}>
              <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
            </button>
            <button type="button" onClick={() => setConfirmar(true)} title="Baixar do SIGEN todas as tabelas da CIDASC" className={BTN_PRIMARIO}>
              <CloudDownload className="w-3.5 h-3.5" /><span>Atualizar do SIGEN</span>
            </button>
          </div>
        </div>
        {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} className="mx-4 my-3 shrink-0" />}

        <div key={tipo} className={GRADE_AREA}>
          <table className={TABELA}>
            <thead className="sticky top-0 z-10">
              <tr><th className={TH_INDICADOR} />{aba.colunas.map((c) => <th key={c.campo} className={`${TH} ${c.classe ? '' : 'text-left'}`}>{c.titulo}</th>)}</tr>
            </thead>
            <tbody>
              {paginacao.visiveis.map((l) => (
                <tr key={String(l.id)} className={TR}>
                  <td className={TD_INDICADOR}><ChevronRight className={INDICADOR} /></td>
                  {aba.colunas.map((c) => <td key={c.campo} className={`${TD} ${c.classe || ''}`}>{c.formato ? c.formato(l[c.campo]) : l[c.campo]}</td>)}
                </tr>
              ))}
              {!carregando && !filtradas.length && (
                <tr><td colSpan={aba.colunas.length + 1} className={TD_VAZIO}><Inbox className="w-6 h-6 mx-auto mb-2" />Nenhum registro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {paginacao.rodape}
      </div>

      {progresso.modal}
      {confirmar && (
        <ConfirmModal
          titulo="Atualizar do SIGEN"
          mensagem={<>Substituir <strong>todas as tabelas da CIDASC</strong> (agrotóxicos, culturas, pragas, localidades, tipos de logradouro, unidades e embalagens) pelas listas atuais do SIGEN? Os vínculos já feitos continuam.</>}
          textoConfirmar="Atualizar tabelas"
          onConfirmar={atualizar}
          onCancelar={() => setConfirmar(false)}
        />
      )}
    </div>
  );
};
