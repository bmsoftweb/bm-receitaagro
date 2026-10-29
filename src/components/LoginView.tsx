import React, { useState, useEffect } from 'react';
import { Sprout, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Building2, ArrowRight } from 'lucide-react';
import { login, consultarServidor } from '../services/api';
import { Usuario, Empresa, ServidorInfo } from '../types';
import { lerTokenLembrado, lembrarToken } from '../utils/session';
import { ThemeToggle } from './ThemeToggle';
import { Toggle } from './Toggle';
import { INPUT_CLASS_LG } from '../utils/formStyles';

interface LoginViewProps {
  onLoginSuccess: (dados: {
    token: string;
    usuario: Usuario;
    empresa: Empresa;
    servidor: ServidorInfo;
    lembrar: boolean;
  }) => void;
}

/** Login no modelo do crmWeb: identidade à esquerda, formulário à direita */
export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [servidor, setServidor] = useState<string>(() => lerTokenLembrado());
  const [servidorInfo, setServidorInfo] = useState<{ identificacao: string; connected: boolean; nomeEmpresa?: string | null } | null>(null);
  const [checandoServidor, setChecandoServidor] = useState(false);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [lembrar, setLembrar] = useState<boolean>(() => !!lerTokenLembrado());
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Consulta o servidor do token enquanto digita
  useEffect(() => {
    const token = servidor.trim();
    if (!token) {
      setServidorInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecandoServidor(true);
      try {
        const info = await consultarServidor(token);
        setServidorInfo({
          identificacao: info.identificacao,
          connected: info.connected,
          nomeEmpresa: info.nomeEmpresa,
        });
      } catch {
        setServidorInfo({ identificacao: 'Token não encontrado', connected: false });
      } finally {
        setChecandoServidor(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [servidor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const token = servidor.trim();
    if (!token) {
      setErro('Informe o token.');
      return;
    }

    try {
      setLoading(true);
      const res = await login(token);
      lembrarToken(lembrar ? token : null);

      onLoginSuccess({
        token: res.token,
        usuario: res.usuario,
        empresa: res.empresa,
        servidor: res.servidor,
        lembrar,
      });
    } catch (err: any) {
      setErro(err.message || 'Falha ao autenticar. Verifique seus dados.');
    } finally {
      setLoading(false);
    }
  };

  /** Marca: ícone + nome, no painel esquerdo e, no celular, acima do formulário */
  const marca = (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 bg-amber-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-200/50 dark:shadow-none shrink-0">
        <Sprout className="w-5 h-5 text-white" />
      </div>
      <span className="text-sm font-black tracking-wider text-stone-800 dark:text-stone-100">BM-ReceitaAgro</span>
    </div>
  );

  return (
    <div className="min-h-screen flex relative bg-white dark:bg-stone-900 text-stone-900 dark:text-white">
      {/* Painel esquerdo: identidade visual (oculto em telas pequenas) */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col p-12 bg-white dark:bg-stone-950 isolate">
        {/* Pano de fundo: broto saindo da terra */}
        <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
          <svg
            viewBox="0 0 380 470"
            aria-hidden="true"
            className="absolute top-1/2 right-[6%] -translate-y-1/2 w-[min(440px,70%)] text-emerald-300 dark:text-emerald-400/25"
          >
            <g fill="currentColor">
              <path d="M190 330 C190 250 190 200 190 150" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" />
              <path d="M190 230 C120 230 70 180 60 110 C130 110 185 150 190 230 Z" opacity=".75" />
              <path d="M190 175 C250 175 300 130 315 60 C245 60 195 100 190 175 Z" opacity=".55" />
              <path d="M190 150 C175 110 180 70 205 35 C225 75 215 115 190 150 Z" opacity=".9" />
            </g>
            {/* Terra */}
            <g className="text-stone-300 dark:text-stone-600" fill="currentColor">
              <path d="M20 360 C110 320 270 320 360 360 L360 380 L20 380 Z" opacity=".8" />
              <path d="M50 400 H330" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity=".5" />
              <path d="M100 430 H280" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity=".35" />
            </g>
          </svg>
          <div className="absolute top-[15%] left-[10%] w-[280px] h-[280px] rounded-[40%] rotate-12 blur-3xl bg-emerald-100/70 dark:bg-emerald-500/10" />
          <div className="absolute bottom-[10%] right-[5%] w-[220px] h-[220px] rounded-[45%] -rotate-12 blur-2xl bg-amber-100/60 dark:bg-amber-500/10" />
        </div>

        {marca}

        <div className="flex-1 flex flex-col justify-center">
          <h1 className="text-6xl font-black leading-[0.95] tracking-tight text-stone-900 dark:text-white">
            Receituário<br />Agronômico
          </h1>
          <p className="mt-4 text-sm font-medium max-w-xs text-stone-500 dark:text-stone-400">
            Receitas, ARTs, compêndio de defensivos e envio à CIDASC em um só lugar.
          </p>
        </div>
      </div>

      {/* Painel direito: formulário de login */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 relative bg-stone-50 dark:bg-stone-900">
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>

        <div className="w-full max-w-md">
          {/* Marca no celular (o painel esquerdo fica oculto) */}
          <div className="flex lg:hidden mb-8">{marca}</div>

          <h2 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">Login</h2>
          <p className="text-sm font-medium mt-1.5 text-stone-500 dark:text-stone-400">
            Informe o token de acesso da sua empresa.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-8">
            {erro && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 flex items-start gap-2.5 text-xs font-bold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{erro}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between ml-1 mb-1.5">
                <label htmlFor="input-login-token" className="block text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                  Token API
                </label>
                {checandoServidor ? (
                  <span className="text-[11px] text-stone-400 flex items-center gap-1">
                    <Loader2 size={11} className="animate-spin" /> Verificando...
                  </span>
                ) : servidorInfo ? (
                  <span className={`text-[11px] flex items-center gap-1 font-bold ${servidorInfo.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}`}>
                    {servidorInfo.connected ? (
                      <><CheckCircle2 size={12} /> {servidorInfo.identificacao}</>
                    ) : servidorInfo.identificacao === 'Token não encontrado' ? 'Token não encontrado' : 'Inacessível'}
                  </span>
                ) : null}
              </div>
              <div className="relative">
                <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 dark:text-stone-500 pointer-events-none" />
                <input
                  id="input-login-token"
                  type={mostrarToken ? 'text' : 'password'}
                  required
                  autoFocus={!servidor}
                  value={servidor}
                  onChange={(e) => {
                    setServidor(e.target.value);
                    setErro(null);
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="Token de acesso"
                  autoComplete="off"
                  className={`${INPUT_CLASS_LG} w-full pl-11 pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarToken(!mostrarToken)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 cursor-pointer"
                  tabIndex={-1}
                  title={mostrarToken ? 'Esconder o token' : 'Mostrar o token'}
                >
                  {mostrarToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {servidorInfo?.connected && servidorInfo.nomeEmpresa && !checandoServidor && (
                <p className="mt-1.5 ml-1 flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-stone-200 truncate" title={servidorInfo.nomeEmpresa}>
                  <Building2 size={13} className="shrink-0 text-amber-600" /> {servidorInfo.nomeEmpresa}
                </p>
              )}
            </div>

            <div className="py-1">
              <Toggle
                id="input-login-lembrar"
                checked={lembrar}
                onChange={setLembrar}
                size="sm"
                label={<span className="text-xs font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">Lembrar neste dispositivo</span>}
                title="Guarda o token neste navegador e mantém a sessão ativa ao fechá-lo."
              />
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-amber-200 dark:shadow-none transition-all flex items-center justify-center gap-2 mt-2 group disabled:opacity-70 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span className="uppercase tracking-wide">Entrar</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between mt-8 pt-4 border-t border-stone-200 dark:border-stone-800 text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
            <span>BM-ReceitaAgro by BMsoft Sistemas</span>
            <span className="normal-case">© {new Date().getFullYear()} • Integração via bmAPI</span>
          </div>
        </div>
      </div>
    </div>
  );
};
