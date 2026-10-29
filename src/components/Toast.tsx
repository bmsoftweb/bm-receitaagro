import React, { useEffect, useState } from 'react';

/**
 * Mensagem de sucesso/informação no canto inferior direito (mesmo visual do crmWeb).
 * Qualquer tela chama `toast('...')`; o <Toast /> fica montado uma vez no App.
 */
export const toast = (msg: string) => window.dispatchEvent(new CustomEvent('toast', { detail: msg }));

export const Toast: React.FC = () => {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const mostrar = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 4000);
    };
    window.addEventListener('toast', mostrar);
    return () => { window.removeEventListener('toast', mostrar); clearTimeout(t); };
  }, []);

  return msg ? (
    <div className="fixed bottom-5 right-5 z-[70] bg-stone-900 text-white text-xs font-semibold py-3 px-4 rounded-xl shadow-2xl border border-stone-800 flex items-center gap-2.5">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <span>{msg}</span>
    </div>
  ) : null;
};
