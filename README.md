# ReceitaWeb — Receituário Agronômico

Conversão para web do sistema Delphi de receituário (`D:\bmsoft\receita`): receitas
agronômicas, compêndio de defensivos do **Novo Receituário Agronômico** e cadastros, sobre o
ERP em DBISAM, pela **bmAPI**.

Mesmo stack do crmWeb / ProduçãoLite: Express + Vite (middleware) + React 19 + Tailwind 4 +
lucide-react + mysql2.

## Rodando

```bash
npm install
cp .env.example .env      # preencha MYSQL_USER / MYSQL_PASSWORD / SESSION_SECRET
npm run dev               # http://localhost:3000
```

O MySQL guarda apenas o cadastro de servidores da bmAPI (`bmapi.servidores`): o número
digitado no login informa a URL, a porta e o token (X-API-Key) do cliente. Os dados ficam
no DBISAM do cliente, acessados só pelo servidor Node.

Configuração por cliente (em `servidores.config` ou no `.env`):

| Chave | Uso |
|---|---|
| `ID_EMPRESA` | Empresa das ARTs, profissionais, receitas e estoque |
| `EXIGE_CIDASC_IMPRESSAO` | `S` (padrão): só imprime receita já transmitida à CIDASC |

O token do Novo Receituário vem de `rec_config.tokenId_novorec` e nunca vai ao navegador.

## Telas

| Tela | Delphi | O que faz |
|---|---|---|
| Receitas | ufrmReceitas | Lista, cabeçalho (ART, cliente, localidade, geolocalização), assistente do produto (defensivo → cultura → praga → tratamento → dose), cancelamento e impressão |
| Defensivos | ufrmDefensivosNovo, ufrmProBM, ufrmProCIDASC | Compêndio, produtos do ERP associados, vínculo CIDASC, tratamentos com os 8 textos, atualização pela API |
| Culturas / Pragas | ufrmCulturasNovo, ufrmPragasNovo | Nome, nome científico e vínculo com a tabela da CIDASC |
| Profissionais | ufrmProf | Dados, código CIDASC, SIGEN e responsável legal |
| ARTs | ufrmArts | Limite de receitas, numeração e ativação |
| Observações / Diagnósticos | ufrmObs, ufrmDiagnosticos | Textos prontos usados na receita |
| Clientes | ufrmClientes | PESSOAS; só consulta quando `rec_config.usa_bmsoft = 'S'` |

Regras de cálculo (dose, quantidade, área, numeração, chave do PDF) ficam em
`shared/receita.ts`, usadas pela tela e conferidas de novo no servidor. Conferência:
`npx tsx scripts/teste-receita.ts`.

## Não convertido

- Assinatura digital com PFX (Chilkat), envio do PDF por FTP e QR code: a impressão é pelo
  navegador e mostra a chave do PDF em texto.
- Impressão matricial, sincronização SIGEN/CIDASC (TfrmAtualizar), Zerar Estoque e Gerar
  Padrões.
- Telas do compêndio antigo (ufrmDefensivos, ufrmCompendio, PesqDef, PesqPraga) e as tabelas
  ainda protegidas por senha (`REC_CULTURAS_PRAGAS_PRODUTOS`, `REC_UFS_RESTRICOES` e afins).

## Histórico

### 0.0.6
- Localização pelo Google Maps: "Escolher no Google Maps" abre o mapa em satélite; as coordenadas
  copiadas lá (botão direito no ponto → clicar nos números) entram com Ctrl+V ou "Colar
  coordenadas", e a altitude é buscada em seguida.
- Erro do envio à CIDASC pela lista não some mais (a lista recarregava e limpava o aviso).
- Aviso de erro das listas com espaço abaixo; datas do filtro de receitas não encolhem.

### 0.0.5
- "Usar minha localização" já busca a altitude do ponto.
- Confirmação de envio/cancelamento na CIDASC mostra o ambiente (produção ou homologação).
- Recusa do SIGEN por coordenadas fora do município vira aviso claro com as coordenadas e o que
  corrigir.

### 0.0.4
- Envio e cancelamento da receita no SIGEN da CIDASC dentro do app (antes o `receita_e.exe`),
  pelas ações da lista e automaticamente na impressão com `EXIGE_CIDASC_IMPRESSAO=S`.
- Ação Clonar na lista de receitas: abre uma nova receita com os dados e produtos da escolhida;
  o número só sai no Gravar. Coluna Ações com todos os ícones soltos.
- Tela Configurações (REC_CONFIG): ambiente do SIGEN, praga genérica, token do Novo Receituário
  e opções de integração, no padrão do crmWeb.
- Listas com mais de 10 opções viram campo com pesquisa; opções do select no modo escuro.
- Login: rótulo "Token API"; erro do token do Novo Receituário mostra o retorno da API.

### 0.0.3
- Login pelo token do servidor (bmapi.servidores.token) no lugar do número; sem usuário e senha.
  Tela de login no modelo do crmWeb, marca BM-ReceitaAgro.
- Paleta verde-escuro, sálvia, creme e terracota (campo obrigatório).
- Cadastros incluem e editam em abas sobre a lista (como as receitas), com confirmação ao fechar
  com alteração não gravada.
- Painel Geral com indicadores: receitas no dia, semana, mês e ano comparadas com o mesmo trecho
  do período anterior, receitas por dia do mês e os 10 produtos mais receitados no ano.
- Rodapé mostra a identificação do servidor; quadro do servidor saiu do cabeçalho.

### 0.0.2
- Receita aberta em abas sobre a lista, em 3 etapas (dados iniciais, produtos, recomendações e
  observações) com Voltar / Avançar; na inclusão, cabeçalho e produtos são gravados juntos só no
  Gravar da última etapa, que fecha a aba. Fechar com alteração não gravada pede confirmação.
- Observações 1 a 8 coladas, como um texto (Enter e setas passam de linha).
- Erros no AvisoErro e avisos em toast, no padrão do crmWeb.
- Clientes: selo "Somente Leitura" ao lado do título.
- Login mostra o nome da empresa do servidor; listas de profissionais, ARTs e receitas sem filtro
  de empresa, como no Delphi.

### 0.0.1
- Primeira versão: telas acima, numeração anual por profissional, limite de receitas da ART
  (sem contar a própria receita na edição) e localidade do cliente gravada só depois das
  validações (dois erros do Delphi corrigidos).
