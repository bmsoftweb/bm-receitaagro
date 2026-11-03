-- Renomeia o banco do compêndio de receitaweb para receitaagro (o app passou a se chamar ReceitaAgro).
-- O MySQL não tem RENAME DATABASE: cria o banco novo e move as tabelas (RENAME TABLE é instantâneo,
-- não copia dados e leva junto índices e chaves estrangeiras). O usuário bmsoftadm tem permissão global.
--
-- Ordem: rodar este script e, logo depois, publicar o app (o código já procura o banco receitaagro).
-- Quem tiver MYSQL_DATABASE_COMPENDIO=receitaweb no .env ou na Vercel precisa trocar para receitaagro.

CREATE DATABASE receitaagro DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_0900_ai_ci;

RENAME TABLE
  receitaweb.compendio_produtos        TO receitaagro.compendio_produtos,
  receitaweb.compendio_bulas           TO receitaagro.compendio_bulas,
  receitaweb.compendio_tratamentos     TO receitaagro.compendio_tratamentos,
  receitaweb.compendio_culturas        TO receitaagro.compendio_culturas,
  receitaweb.compendio_pragas          TO receitaagro.compendio_pragas,
  receitaweb.compendio_depara_culturas TO receitaagro.compendio_depara_culturas,
  receitaweb.compendio_depara_pragas   TO receitaagro.compendio_depara_pragas;

-- Conferir: deve listar as 7 tabelas no receitaagro e nenhuma no receitaweb
SELECT table_schema, COUNT(*) tabelas FROM information_schema.tables
 WHERE table_schema IN ('receitaweb', 'receitaagro') GROUP BY table_schema;

-- Só depois de conferir (o banco antigo fica vazio):
-- DROP DATABASE receitaweb;

-- Reversão (antes do DROP acima; depois dele, recriar com CREATE DATABASE receitaweb ...)
-- RENAME TABLE
--   receitaagro.compendio_produtos        TO receitaweb.compendio_produtos,
--   receitaagro.compendio_bulas           TO receitaweb.compendio_bulas,
--   receitaagro.compendio_tratamentos     TO receitaweb.compendio_tratamentos,
--   receitaagro.compendio_culturas        TO receitaweb.compendio_culturas,
--   receitaagro.compendio_pragas          TO receitaweb.compendio_pragas,
--   receitaagro.compendio_depara_culturas TO receitaweb.compendio_depara_culturas,
--   receitaagro.compendio_depara_pragas   TO receitaweb.compendio_depara_pragas;
-- DROP DATABASE receitaagro;
