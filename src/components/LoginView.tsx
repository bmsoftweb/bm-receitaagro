import React, { useState, useEffect } from 'react';
import { Sprout, Database, Mail, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Building2 } from 'lucide-react';
import { login, consultarServidor } from '../services/api';
import { Usuario, Empresa, ServidorInfo } from '../types';
import {
  lerLembrete,
  salvarLembrete,
  limparLembrete,
  lerUltimoServidor,
  salvarUltimoServidor,
} from '../utils/session';
import { ThemeToggle } from './ThemeToggle';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';

interface LoginViewProps {
  onLoginSuccess: (dados: {
    token: string;
    usuario: Usuario;
    empresa: Empresa;
    servidor: ServidorInfo;
    lembrar: boolean;
  }) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [servidor, setServidor] = useState<string>(() => lerUltimoServidor() || '1');
  const [servidorInfo, setServidorInfo] = useState<{ identificacao: string; connected: boolean; nomeEmpresa?: string | null } | null>(null);
  const [checandoServidor, setChecandoServidor] = useState(false);

  const [email, setEmail] = useState<string>(() => lerLembrete() || '');
  const [senha, setSenha] = useState<string>('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState<boolean>(() => !!lerLembrete());

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Consulta status do servidor ao digitar
  useEffect(() => {
    const num = parseInt(servidor, 10);
    if (isNaN(num) || num <= 0) {
      setServidorInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setChecandoServidor(true);
      try {
        const info = await consultarServidor(num);
        setServidorInfo({
          identificacao: info.identificacao,
          connected: info.connected,
          nomeEmpresa: info.nomeEmpresa,
        });
      } catch {
        setServidorInfo({ identificacao: 'Servidor inacessível', connected: false });
      } finally {
        setChecandoServidor(false);
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [servidor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const srvNum = parseInt(servidor, 10);
    if (isNaN(srvNum) || srvNum <= 0) {
      setErro('Informe um número de servidor válido.');
      return;
    }

    const emailLogin = email.trim() || 'admin';
    const senhaLogin = senha || '';

    try {
      setLoading(true);
      const res = await login(srvNum, emailLogin, senhaLogin);

      // Salva preferências locais
      salvarUltimoServidor(srvNum);
      if (lembrar && email.trim()) {
        salvarLembrete(email.trim());
      } else {
        limparLembrete();
      }

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

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-stone-100 dark:bg-stone-950 text-stone-900 dark:text-stone-100 relative transition-colors">
      {/* Botão de Tema no canto superior */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-xl border border-stone-200 dark:border-stone-800 p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Topo do Card */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white items-center justify-center shadow-lg shadow-amber-500/25 mb-1">
            <Sprout size={32} className="stroke-[2.2]" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
            Receita<span className="text-amber-500 font-extrabold">Web</span>
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Receituário Agronômico
          </p>
        </div>

        {/* Mensagem de Erro */}
        {erro && (
          <div className="flex items-start gap-2.5 p-3.5 text-xs text-red-700 bg-red-50 dark:bg-red-950/40 dark:text-red-300 rounded-xl border border-red-200 dark:border-red-900 animate-in fade-in">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{erro}</span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Servidor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={LABEL_CLASS}>
                <span className="flex items-center gap-1.5">
                  <Database size={13} /> Número do Servidor
                </span>
              </label>
              {checandoServidor ? (
                <span className="text-[11px] text-stone-400 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Verificando...
                </span>
              ) : servidorInfo ? (
                <span
                  className={`text-[11px] flex items-center gap-1 font-medium ${
                    servidorInfo.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                  }`}
                >
                  {servidorInfo.connected ? (
                    <>
                      <CheckCircle2 size={12} /> {servidorInfo.identificacao}
                    </>
                  ) : (
                    'Inacessível'
                  )}
                </span>
              ) : null}
            </div>
            <div className={FIELD_WRAPPER_CLASS}>
              <input
                type="number"
                required
                value={servidor}
                onChange={(e) => setServidor(e.target.value)}
                placeholder="Ex: 1"
                className={INPUT_CLASS}
                min="1"
              />
            </div>
            {servidorInfo?.connected && servidorInfo.nomeEmpresa && !checandoServidor && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-stone-700 dark:text-stone-200 truncate" title={servidorInfo.nomeEmpresa}>
                <Building2 size={13} className="shrink-0 text-amber-600" /> {servidorInfo.nomeEmpresa}
              </p>
            )}
          </div>

          {/* Usuário / Email */}
          <div>
            <label className={LABEL_CLASS}>
              <span className="flex items-center gap-1.5">
                <Mail size={13} /> Usuário ou E-mail <span className="text-[10px] text-stone-400 font-normal">(opcional)</span>
              </span>
            </label>
            <div className={FIELD_WRAPPER_CLASS}>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin (ou em branco)"
                className={INPUT_CLASS}
                autoComplete="username"
              />
            </div>
          </div>

          {/* Senha */}
          <div>
            <label className={LABEL_CLASS}>
              <span className="flex items-center gap-1.5">
                <Lock size={13} /> Senha <span className="text-[10px] text-stone-400 font-normal">(opcional)</span>
              </span>
            </label>
            <div className={`${FIELD_WRAPPER_CLASS} flex items-center`}>
              <input
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="•••••••• (opcional)"
                className={`${INPUT_CLASS} pr-1`}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(!mostrarSenha)}
                className="p-1.5 mr-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition-colors"
                title={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
              >
                {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Lembrar usuário */}
          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-stone-600 dark:text-stone-300">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={(e) => setLembrar(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800"
              />
              <span>Lembrar meu usuário</span>
            </label>
          </div>

          {/* Botão Entrar */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:from-amber-700 active:to-amber-800 transition-all shadow-md shadow-amber-500/20 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <span>Entrar no Sistema</span>
            )}
          </button>
        </form>

        {/* Rodapé institucional */}
        <div className="text-center pt-2 border-t border-stone-100 dark:border-stone-800">
          <p className="text-[11px] text-stone-400">
            BMsoft sistemas © 2026 — Integração via bmAPI
          </p>
        </div>
      </div>
    </div>
  );
};
