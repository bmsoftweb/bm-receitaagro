import React, { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { get, send } from '../services/api';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { AvisoErro } from './AvisoErro';
import { toast } from './Toast';
import { Toggle } from './Toggle';

interface RecConfig {
  urlWs: string;
  idPragaGenericaCidasc: number;
  usaBmsoft: boolean;
  usaSistemasTerceiros: boolean;
  compendioOnline: boolean;
  temTokenNovoRec: boolean;
  exigeCidascParaImprimir: boolean;
}

const SIGEN = [
  { url: 'https://svchomologacao.sigen.cidasc.sc.gov.br', nome: 'Homologação (testes)' },
  { url: 'https://sigensvc.cidasc.sc.gov.br', nome: 'Produção' },
];

/** Uma aba por grupo, como no crmWeb; todas gravam na REC_CONFIG */
const ABAS = [
  { id: 'cidasc', titulo: 'CIDASC (SIGEN)', descricao: 'Envio das receitas ao SIGEN da CIDASC: ambiente e praga usada quando o produto não tem praga informada.' },
  { id: 'integracoes', titulo: 'Compêndio e integrações', descricao: 'Compêndio do Novo Receituário, origem dos clientes e emissão em outro sistema.' },
] as const;

const HINT = 'text-[11px] text-stone-500 dark:text-stone-400';

const Opcao: React.FC<{ checked: boolean; onChange?: (v: boolean) => void; rotulo: string; dica: string; disabled?: boolean }> = ({ checked, onChange, rotulo, dica, disabled }) => (
  <div className="flex flex-col gap-1">
    <Toggle checked={checked} onChange={onChange || (() => {})} disabled={disabled} label={<span className="text-xs font-semibold text-stone-700 dark:text-stone-200">{rotulo}</span>} />
    <span className={HINT}>{dica}</span>
  </div>
);

/** Configurações do receituário (tabela REC_CONFIG, uma linha) */
export const ConfiguracoesView: React.FC = () => {
  const [aba, setAba] = useState<(typeof ABAS)[number]['id']>('cidasc');
  const [c, setC] = useState<RecConfig | null>(null);
  const [token, setToken] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const atual = ABAS.find((a) => a.id === aba)!;

  const carregar = () => get<RecConfig>('/api/rec-config').then(setC).catch((e) => setErro(e.message));
  useEffect(() => { carregar(); }, []);

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!c) return;
    setErro(null);
    setSalvando(true);
    try {
      await send('PUT', '/api/rec-config', { ...c, tokenNovoRec: token });
      setToken('');
      await carregar();
      toast('Configuração gravada.');
    } catch (err: any) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  };

  const set = (p: Partial<RecConfig>) => c && setC({ ...c, ...p });

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white dark:bg-stone-900">
      <div className="flex overflow-x-auto bg-stone-50 dark:bg-stone-950/60 border-b border-stone-200 dark:border-stone-800 shrink-0">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`px-4 py-3 text-xs font-bold shrink-0 border-b-2 transition-all cursor-pointer ${
              aba === a.id
                ? 'border-amber-600 text-amber-700 bg-white dark:bg-stone-900 dark:text-amber-400'
                : 'border-transparent text-stone-500 hover:text-stone-700 dark:hover:text-stone-200'
            }`}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="px-4 py-4">
          <div className="mb-3">
            <h2 className="text-base font-bold text-stone-900 dark:text-stone-100">{atual.titulo}</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{atual.descricao}</p>
          </div>

          {erro && <div className="mb-3 max-w-3xl"><AvisoErro mensagem={erro} onFechar={() => setErro(null)} /></div>}

          {!c ? (
            !erro && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />
          ) : (
            <form onSubmit={salvar} className="max-w-3xl flex flex-col gap-4">
              {aba === 'cidasc' && (
                <>
                  <div className="flex flex-col gap-1 max-w-xl">
                    <label htmlFor="cfg-url-ws" className={LABEL_CLASS}>Ambiente</label>
                    <select id="cfg-url-ws" required value={c.urlWs} onChange={(e) => set({ urlWs: e.target.value })} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
                      {!c.urlWs && <option value="">Selecione…</option>}
                      {SIGEN.map((s) => <option key={s.url} value={s.url}>{s.nome} – {s.url}</option>)}
                      {c.urlWs && !SIGEN.some((s) => s.url === c.urlWs) && <option value={c.urlWs}>Outro – {c.urlWs}</option>}
                    </select>
                    {c.urlWs.includes('sigensvc')
                      ? <span className="text-[11px] font-semibold text-rose-600">Produção: as receitas enviadas valem oficialmente.</span>
                      : <span className={HINT}>Homologação serve para testes: o que for enviado não vale como receita oficial.</span>}
                  </div>

                  <div className="flex flex-col gap-1 max-w-xs">
                    <label htmlFor="cfg-praga" className={LABEL_CLASS}>Praga genérica (código CIDASC)</label>
                    <input
                      id="cfg-praga"
                      inputMode="numeric"
                      maxLength={9}
                      value={c.idPragaGenericaCidasc || ''}
                      onChange={(e) => set({ idPragaGenericaCidasc: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                      onFocus={(e) => e.target.select()}
                      className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} text-right`}
                    />
                    <span className={HINT}>Enviada quando o produto da receita não tem praga informada.</span>
                  </div>

                  <Opcao
                    checked={c.exigeCidascParaImprimir}
                    disabled
                    rotulo="Exigir envio à CIDASC para imprimir"
                    dica="Definido no cadastro do servidor da bmAPI; não muda por aqui."
                  />
                </>
              )}

              {aba === 'integracoes' && (
                <>
                  <div className="flex flex-col gap-1 max-w-xl">
                    <label htmlFor="cfg-token-novorec" className={LABEL_CLASS}>Token do Novo Receituário</label>
                    <input
                      id="cfg-token-novorec"
                      type="password"
                      autoComplete="new-password"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      placeholder={c.temTokenNovoRec ? 'Configurado' : 'Não configurado'}
                      className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}
                    />
                    <span className={HINT}>Usado na busca de defensivos, culturas e pragas. Em branco mantém o token atual.</span>
                  </div>

                  <Opcao checked={c.compendioOnline} onChange={(v) => set({ compendioOnline: v })} rotulo="Compêndio on-line" dica="Busca defensivos, culturas e pragas na API do Novo Receituário (precisa do token). Desligado, usa a cópia local." />
                  <Opcao checked={c.usaBmsoft} onChange={(v) => set({ usaBmsoft: v })} rotulo="Clientes do BMsoft" dica="Os clientes são mantidos no BMsoft; a tela Clientes daqui fica só para consulta." />
                  <Opcao checked={c.usaSistemasTerceiros} onChange={(v) => set({ usaSistemasTerceiros: v })} rotulo="Usa sistemas de terceiros" dica="As receitas são emitidas em outro sistema: a emissão de receitas fica bloqueada aqui." />
                </>
              )}

              <div>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salvar configuração
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
