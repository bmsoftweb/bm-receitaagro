import React, { useEffect, useState } from 'react';
import { Star, Power, ExternalLink, Search, Loader2 } from 'lucide-react';
import { get, send, qs } from '../services/api';
import { Cadastro } from './Cadastro';
import { Opcao } from '../types';
import { formatDoc, formatFone, formatDateBR } from '../utils/formatters';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';

const salvarRest = (base: string) => async (item: { id?: number }) => {
  await send(item.id ? 'PUT' : 'POST', item.id ? `${base}/${item.id}` : base, item);
};
const excluirRest = (base: string) => async (item: { id: number }) => {
  await send('DELETE', `${base}/${item.id}`);
};
const simNao = (v: boolean) => (v ? 'Sim' : '–');

// ---------------- Profissionais ----------------
interface Profissional {
  id: number; nome: string; cpf: string; titulo: string; registro: string; endereco: string; bairro: string; cep: string;
  cidade: string; uf: string; fone: string; celular: string; cidascCodigo: string; sigenCreasc: string; sigenUsuario: string;
  sigenSenha?: string; responsavelLegal: boolean; ultimaReceita: number; anoAtual: number;
}

export const ProfissionaisView: React.FC = () => (
  <Cadastro<Profissional>
    nome="profissional"
    tamanho="lg"
    carregar={(q) => get(`/api/profissionais${qs({ q })}`)}
    descrever={(p) => p.nome}
    colunas={[
      { titulo: 'Nome', valor: (p) => <span className="font-semibold">{p.nome}</span> },
      { titulo: 'CPF', valor: (p) => formatDoc(p.cpf), classe: 'font-mono' },
      { titulo: 'Título', valor: (p) => p.titulo },
      { titulo: 'Registro', valor: (p) => p.registro },
      { titulo: 'Cód. CIDASC', valor: (p) => p.cidascCodigo, classe: 'text-right font-mono' },
      { titulo: 'Resp. legal', valor: (p) => simNao(p.responsavelLegal), classe: 'text-center' },
      { titulo: 'Últ. receita', valor: (p) => (p.ultimaReceita ? `${p.ultimaReceita}/${p.anoAtual}` : '–'), classe: 'text-right font-mono' },
    ]}
    campos={[
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true, max: 50, maiusculo: true, largura: 3 },
      { chave: 'cpf', rotulo: 'CPF', tipo: 'digitos', max: 11, largura: 1 },
      { chave: 'titulo', rotulo: 'Título', max: 30, largura: 2, dica: 'Ex.: Engenheiro Agrônomo' },
      { chave: 'registro', rotulo: 'Registro (CREA)', max: 20, largura: 2 },
      { chave: 'endereco', rotulo: 'Endereço', max: 50, maiusculo: true, largura: 3 },
      { chave: 'cep', rotulo: 'CEP', tipo: 'digitos', max: 8, largura: 1 },
      { chave: 'bairro', rotulo: 'Bairro', max: 30, maiusculo: true, largura: 2 },
      { chave: 'cidade', rotulo: 'Cidade', max: 30, maiusculo: true, largura: 1 },
      { chave: 'uf', rotulo: 'UF', max: 2, maiusculo: true, largura: 1 },
      { chave: 'fone', rotulo: 'Fone', tipo: 'digitos', max: 15, largura: 2 },
      { chave: 'celular', rotulo: 'Celular', tipo: 'digitos', max: 15, largura: 2 },
      { chave: 'cidascCodigo', rotulo: 'Código CIDASC', tipo: 'digitos', max: 10, largura: 1, dica: 'Compõe o número da receita' },
      { chave: 'sigenCreasc', rotulo: 'SIGEN CREA-SC', max: 10, largura: 1 },
      { chave: 'sigenUsuario', rotulo: 'Usuário SIGEN', max: 15, largura: 1 },
      { chave: 'sigenSenha', rotulo: 'Senha SIGEN', tipo: 'senha', max: 15, largura: 1, dica: 'Em branco mantém a atual' },
    ]}
    novo={() => ({ nome: '', cpf: '', titulo: '', registro: '', endereco: '', bairro: '', cep: '', cidade: '', uf: 'SC', fone: '', celular: '', cidascCodigo: '', sigenCreasc: '', sigenUsuario: '', sigenSenha: '' })}
    salvar={salvarRest('/api/profissionais')}
    excluir={excluirRest('/api/profissionais')}
    acoes={[{
      icone: Star, titulo: 'Responsável legal', descricao: 'marcar como responsável legal da empresa', tom: 'verde',
      executar: async (p) => { await send('PUT', `/api/profissionais/${p.id}/responsavel`); return `${p.nome} é o responsável legal.`; },
    }]}
  />
);

// ---------------- ARTs ----------------
interface Art {
  id: number; numero: string; idProf: number; profissional: string; qtdadeReceitas: number; obs: string;
  ultimaReceita: number; ativa: boolean; receitasEmitidas: number;
}

export const ArtsView: React.FC = () => {
  const [profs, setProfs] = useState<Opcao[]>([]);
  useEffect(() => {
    get<{ id: number; nome: string }[]>('/api/profissionais').then((l) => setProfs(l.map((p) => ({ id: p.id, descricao: p.nome })))).catch(() => {});
  }, []);
  return (
    <Cadastro<Art>
      nome="ART/TRT"
      carregar={(q) => get(`/api/arts${qs({ q })}`)}
      descrever={(a) => `ART ${a.numero}`}
      colunas={[
        { titulo: 'Número', valor: (a) => <span className="font-semibold font-mono">{a.numero}</span> },
        { titulo: 'Profissional', valor: (a) => a.profissional },
        { titulo: 'Limite', valor: (a) => a.qtdadeReceitas, classe: 'text-right font-mono' },
        { titulo: 'Emitidas', valor: (a) => a.receitasEmitidas, classe: 'text-right font-mono' },
        { titulo: 'Última nº', valor: (a) => a.ultimaReceita, classe: 'text-right font-mono' },
        { titulo: 'Situação', valor: (a) => (a.ativa ? 'Ativa' : <span className="text-rose-600">Desativada</span>), classe: 'text-center' },
        { titulo: 'Obs.', valor: (a) => a.obs },
      ]}
      campos={[
        { chave: 'numero', rotulo: 'Número da ART/TRT', obrigatorio: true, max: 15, largura: 2 },
        { chave: 'idProf', rotulo: 'Profissional', tipo: 'select', obrigatorio: true, opcoes: profs, largura: 2 },
        { chave: 'qtdadeReceitas', rotulo: 'Qtd. de receitas', tipo: 'inteiro', obrigatorio: true, largura: 1 },
        { chave: 'ultimaReceita', rotulo: 'Última receita', tipo: 'inteiro', largura: 1 },
        { chave: 'obs', rotulo: 'Observação', max: 80, largura: 4 },
      ]}
      novo={() => ({ numero: '', idProf: profs.length === 1 ? profs[0].id : 0, qtdadeReceitas: 0, ultimaReceita: 0, obs: '' })}
      salvar={salvarRest('/api/arts')}
      excluir={excluirRest('/api/arts')}
      acoes={[{
        icone: Power, titulo: 'Ativar/desativar', descricao: 'liberar ou bloquear novas receitas nesta ART',
        executar: async (a) => { await send('PUT', `/api/arts/${a.id}/status`, { ativa: !a.ativa }); return `ART ${a.numero} ${a.ativa ? 'desativada' : 'ativada'}.`; },
      }]}
    />
  );
};

// ---------------- Observações e diagnósticos ----------------
interface Texto { id: number; texto: string }

export const ObservacoesView: React.FC = () => (
  <Cadastro<Texto>
    nome="observação"
    filtroLocal
    carregar={() => get('/api/observacoes')}
    descrever={(o) => o.texto}
    colunas={[{ titulo: 'Observação', valor: (o) => o.texto }]}
    campos={[{ chave: 'texto', rotulo: 'Observação', obrigatorio: true, max: 120 }]}
    novo={() => ({ texto: '' })}
    salvar={salvarRest('/api/observacoes')}
    excluir={excluirRest('/api/observacoes')}
  />
);

export const DiagnosticosView: React.FC = () => (
  <Cadastro<Texto>
    nome="diagnóstico"
    filtroLocal
    carregar={() => get('/api/diagnosticos')}
    descrever={(d) => d.texto.slice(0, 60)}
    colunas={[{ titulo: 'Diagnóstico', valor: (d) => <span className="whitespace-normal">{d.texto}</span> }]}
    campos={[{ chave: 'texto', rotulo: 'Diagnóstico', tipo: 'textarea', obrigatorio: true, max: 512, dica: 'Mínimo de 10 caracteres' }]}
    novo={() => ({ texto: '' })}
    salvar={salvarRest('/api/diagnosticos')}
    excluir={excluirRest('/api/diagnosticos')}
  />
);

// ---------------- Clientes ----------------
interface Cliente {
  id: number; juridicaFisica: 'F' | 'J'; nome: string; fantasia: string; endereco: string; numero: string; complemento: string;
  bairro: string; cep: string; cidade: string; uf: string; fone1: string; fone2: string; celular: string; email: string;
  cpfCnpj: string; ie: string; rg: string; iPRural: string; lembrete: string; ativo: boolean; dataCadastro: string;
}

export const ClientesView: React.FC = () => {
  const [usaBmsoft, setUsaBmsoft] = useState(false);
  const [ativos, setAtivos] = useState(true);
  useEffect(() => {
    get<{ usaBmsoft: boolean }>('/api/rec-config').then((c) => setUsaBmsoft(c.usaBmsoft)).catch(() => {});
  }, []);
  return (
    <Cadastro<Cliente & { pj?: boolean }>
      nome="cliente"
      tamanho="lg"
      chaveRecarga={String(ativos)}
      somenteLeitura={usaBmsoft ? 'Clientes são mantidos no BMsoft: aqui só consulta.' : null}
      barra={
        <select value={ativos ? 'S' : ''} onChange={(e) => setAtivos(e.target.value === 'S')} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} w-28`}>
          <option value="S">Ativos</option>
          <option value="">Todos</option>
        </select>
      }
      carregar={async (q) => (await get<{ clientes: Cliente[] }>(`/api/clientes${qs({ q, ativos: ativos ? 'S' : '' })}`)).clientes.map((c) => ({ ...c, pj: c.juridicaFisica === 'J' }))}
      descrever={(c) => c.nome}
      colunas={[
        { titulo: 'Nome', valor: (c) => <span className={`font-semibold ${c.ativo ? '' : 'line-through text-stone-400'}`}>{c.nome}</span> },
        { titulo: 'CPF/CNPJ', valor: (c) => formatDoc(c.cpfCnpj), classe: 'font-mono' },
        { titulo: 'Cidade', valor: (c) => (c.cidade ? `${c.cidade}/${c.uf}` : '') },
        { titulo: 'Fone', valor: (c) => formatFone(c.fone1 || c.celular), classe: 'font-mono' },
        { titulo: 'Insc. prod. rural', valor: (c) => c.iPRural },
        { titulo: 'Cadastro', valor: (c) => formatDateBR(c.dataCadastro), classe: 'text-center' },
      ]}
      campos={[
        { chave: 'pj', rotulo: 'Pessoa jurídica', tipo: 'toggle', largura: 1 },
        { chave: 'cpfCnpj', rotulo: 'CPF/CNPJ', tipo: 'digitos', max: 14, largura: 1 },
        { chave: 'nome', rotulo: 'Nome', obrigatorio: true, max: 60, maiusculo: true, largura: 2 },
        { chave: 'fantasia', rotulo: 'Fantasia', max: 40, maiusculo: true, largura: 2 },
        { chave: 'iPRural', rotulo: 'Insc. produtor rural', max: 20, largura: 1 },
        { chave: 'ie', rotulo: 'IE', max: 20, largura: 1 },
        { chave: 'endereco', rotulo: 'Endereço', max: 60, maiusculo: true, largura: 3 },
        { chave: 'numero', rotulo: 'Número', max: 5, largura: 1 },
        { chave: 'complemento', rotulo: 'Complemento', max: 30, maiusculo: true, largura: 2 },
        { chave: 'bairro', rotulo: 'Bairro', max: 25, maiusculo: true, largura: 2 },
        { chave: 'cep', rotulo: 'CEP', tipo: 'digitos', max: 8, largura: 1 },
        { chave: 'cidade', rotulo: 'Cidade', max: 30, maiusculo: true, largura: 2 },
        { chave: 'uf', rotulo: 'UF', max: 2, maiusculo: true, largura: 1 },
        { chave: 'fone1', rotulo: 'Fone', tipo: 'digitos', max: 15, largura: 1 },
        { chave: 'fone2', rotulo: 'Fone 2', tipo: 'digitos', max: 15, largura: 1 },
        { chave: 'celular', rotulo: 'Celular', tipo: 'digitos', max: 15, largura: 1 },
        { chave: 'rg', rotulo: 'RG', max: 20, largura: 1 },
        { chave: 'email', rotulo: 'E-mail', max: 100, largura: 4 },
        { chave: 'lembrete', rotulo: 'Lembrete', max: 80, largura: 4 },
      ]}
      novo={() => ({ pj: false, cpfCnpj: '', nome: '', fantasia: '', iPRural: '', ie: '', endereco: '', numero: '', complemento: '', bairro: '', cep: '', cidade: '', uf: 'SC', fone1: '', fone2: '', celular: '', rg: '', email: '', lembrete: '' })}
      salvar={(c) => salvarRest('/api/clientes')({ ...c, juridicaFisica: c.pj ? 'J' : 'F' } as Partial<Cliente>)}
      excluir={excluirRest('/api/clientes')}
      acoes={[{
        icone: Power, titulo: 'Ativar/desativar', descricao: 'cliente inativo não aparece na receita',
        executar: async (c) => { await send('PUT', `/api/clientes/${c.id}/ativo`, { ativo: !c.ativo }); return `${c.nome} ${c.ativo ? 'desativado' : 'ativado'}.`; },
      }]}
    />
  );
};

// ---------------- Culturas e pragas (do Novo Receituário, com vínculo CIDASC) ----------------
interface ItemCompendio { id: number; idCidasc: number; nome: string; nomeCientifico: string }

const PesquisaCidasc: React.FC<{ tipo: 'culturas' | 'pragas'; inicial: string; onEscolher: (id: number) => void }> = ({ tipo, inicial, onEscolher }) => {
  const [q, setQ] = useState(inicial);
  const [itens, setItens] = useState<Opcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        setItens((await get<{ id: number; nome: string }[]>(`/api/cidasc/${tipo}${qs({ q })}`)).map((i) => ({ id: i.id, descricao: i.nome })));
      } catch {
        setItens([]);
      } finally {
        setCarregando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, tipo]);
  return (
    <div className="border-t border-stone-200 dark:border-stone-800 pt-3">
      <label className={LABEL_CLASS}>Pesquisar na tabela da CIDASC ({tipo === 'culturas' ? 'nome comum' : 'nome científico'})</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} pl-9`} />
      </div>
      <div className="mt-2 max-h-48 overflow-y-auto text-xs divide-y divide-stone-100 dark:divide-stone-800">
        {carregando && <div className="p-2 text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Buscando…</div>}
        {!carregando && itens.map((i) => (
          <button key={i.id} type="button" onClick={() => onEscolher(i.id)} className="w-full text-left px-2 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer">
            <span className="font-mono text-stone-400 mr-2">{i.id}</span>{i.descricao}
          </button>
        ))}
      </div>
    </div>
  );
};

const CompendioView: React.FC<{ tipo: 'culturas' | 'pragas' }> = ({ tipo }) => (
  <Cadastro<ItemCompendio>
    key={tipo}
    nome={tipo === 'culturas' ? 'cultura' : 'praga'}
    podeIncluir={false}
    carregar={async (q) => (await get<{ itens: ItemCompendio[] }>(`/api/${tipo}${qs({ q })}`)).itens}
    descrever={(c) => c.nome}
    colunas={[
      { titulo: 'ID', valor: (c) => c.id, classe: 'text-right font-mono' },
      { titulo: 'Nome', valor: (c) => <span className="font-semibold">{c.nome}</span> },
      { titulo: 'Nome científico', valor: (c) => <i>{c.nomeCientifico}</i> },
      { titulo: 'ID CIDASC', valor: (c) => c.idCidasc || <span className="text-rose-600">sem vínculo</span>, classe: 'text-right font-mono' },
    ]}
    campos={[
      { chave: 'nome', rotulo: 'Nome', obrigatorio: true, max: 80, maiusculo: true, largura: 4 },
      { chave: 'nomeCientifico', rotulo: 'Nome científico', max: 80, largura: 3 },
      { chave: 'idCidasc', rotulo: 'ID CIDASC', tipo: 'inteiro', largura: 1 },
    ]}
    novo={() => ({})}
    salvar={salvarRest(`/api/${tipo}`)}
    excluir={excluirRest(`/api/${tipo}`)}
    acoes={[{
      icone: ExternalLink, titulo: 'Imagens', descricao: 'pesquisar imagens no Google', semRecarga: true,
      executar: (c) => { window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(c.nomeCientifico || c.nome)}`, '_blank', 'noopener'); },
    }]}
    extraFormulario={(item, alterar) => (
      <PesquisaCidasc tipo={tipo} inicial={(tipo === 'culturas' ? item.nome : item.nomeCientifico) || ''} onEscolher={(id) => alterar({ idCidasc: id })} />
    )}
  />
);

export const CulturasView: React.FC = () => <CompendioView tipo="culturas" />;
export const PragasView: React.FC = () => <CompendioView tipo="pragas" />;
