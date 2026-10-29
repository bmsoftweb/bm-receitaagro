// =====================================================================
// Tipos do domínio ReceitaWeb
// =====================================================================

export interface Usuario {
  id: number;
  idPessoa: number;
  idEmpresa: number;
  nome: string;
  email: string;
  nomePessoa: string;
  nivel: 'A' | 'G' | 'S' | 'V' | 'C';
  nivelDescricao: string;
  listaPreco: string;
  paginaInicial: string;
}

export interface Empresa {
  id: number;
  nome: string;
  fantasia: string;
  apelido: string;
  cnpj: string;
  cidade: string;
  uf: string;
}

export interface ServidorInfo {
  numero: number;
  identificacao: string;
}

export interface DbConnectionStatus {
  connected: boolean;
  latencyMs: number;
  servidor: number;
  identificacao: string;
  empresa?: string | null;
  error?: string;
}

export interface ConfigPublica {
  idEmpresa: number;
}

export interface Opcao {
  id: number;
  descricao: string;
}

export interface Tratamento {
  id: number;
  idProduto: number;
  idCultura: number;
  idPraga: number;
  cultura: string;
  praga: string;
  pragaCientifico: string;
  seq: number;
  classificacaoToxicologica: string;
  nomeIngredientes: string;
  intervaloSeguranca: number;
  doseMinima: number;
  doseMaxima: number;
  unidadeAplicacao: string;
  volumeCalda: number;
  volumeCaldaAerea: number;
  minimoAplicacoes: number;
  maximoAplicacoes: number;
  estagioCultura: string;
  estagioProblema: string;
  localAplicacao: string;
  modalidadeAplicacao: string;
  frase1: string;
  frase2: string;
  estadosRestritos: string;
  restricaoAplicacao: string;
}

export interface ProdutoReceita {
  id: number;
  idDefensivo: number;
  idNovoRec: number;
  idCultura: number;
  idPraga: number;
  idTratamento: number;
  defensivo: string;
  cultura: string;
  praga: string;
  pragaCientifico: string;
  dose: number;
  doseUn: string;
  qtdade: number;
  qtdadeUn: string;
  calda: number;
  nrAplic: number;
  area: number;
  areaUn: string;
  idUnDose?: number;
  idUnQtd?: number;
  idUnArea?: number;
  carencia: string;
  aplicacaoLiberado: string;
  aplicacao: string;
  diagnostico: string;
}

export interface Receita {
  id: number;
  idArt: number;
  numeroArt: string;
  idProf: number;
  profissional: string;
  idCliente: number;
  cliente: string;
  idCultura: number;
  culturaNome: string;
  numeroReceita: number;
  numeroReceitaFull: string;
  numeroReceitaCidasc: number;
  data: string;
  localAplicacao: string;
  recomendacoes: string;
  obs: string[];
  impressa: boolean;
  cancelada: boolean;
  canceladaCidasc: boolean;
  idLocalidade: number;
  idTipoLogradouro: number;
  altitude: number;
  latitude: number;
  longitude: number;
  chavePdf: string;
  produtos?: ProdutoReceita[];
}
