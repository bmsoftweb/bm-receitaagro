-- Compêndio próprio a partir das bulas (MySQL central, banco receitaagro).
-- Uma carga serve a todos os clientes: a bula é a mesma para todos.
-- Criar à mão; o app não cria tabelas.

-- Produto: um por registro MAPA (vem do AGROFIT), com a bula guardada no Vercel Blob
CREATE TABLE compendio_produtos (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  registro_mapa       VARCHAR(15)  NOT NULL,              -- só dígitos, sem zeros à esquerda
  marca               VARCHAR(150) NOT NULL,
  titular             VARCHAR(200) NULL,
  formulacao          VARCHAR(100) NULL,
  ingrediente_ativo   VARCHAR(500) NULL,
  classe              VARCHAR(150) NULL,
  classe_toxicologica VARCHAR(150) NULL,
  classe_ambiental    VARCHAR(150) NULL,
  url_bula            VARCHAR(300) NULL,                  -- sem uso (o PDF fica em compendio_bulas); pode ser removida
  url_bula_origem     VARCHAR(500) NULL,                  -- endereço de onde a bula foi baixada
  data_bula           DATE         NULL,                  -- data da versão da bula
  hash_bula           CHAR(64)     NULL,                  -- sha256 do PDF: só reprocessa se mudar
  status_extracao     VARCHAR(20)  NOT NULL DEFAULT 'pendente', -- pendente | incompleto (vai para o Opus) | extraido | erro | sem_bula
  erro_extracao       VARCHAR(500) NULL,
  extraido_em         DATETIME     NULL,
  ativo               TINYINT(1)   NOT NULL DEFAULT 1,    -- 0 = saiu do AGROFIT (registro cancelado)
  criado_em           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_compendio_produtos_mapa (registro_mapa)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tratamento: uma linha por cultura × praga (alvo) da bula
CREATE TABLE compendio_tratamentos (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  produto_id           INT           NOT NULL,
  cultura              VARCHAR(100)  NOT NULL,
  praga_comum          VARCHAR(200)  NULL,
  praga_cientifico     VARCHAR(200)  NULL,
  dose_min             DECIMAL(15,4) NULL,
  dose_max             DECIMAL(15,4) NULL,
  unidade_dose         VARCHAR(50)   NULL,                -- ex.: mL p.c./ha, g p.c./100 L
  volume_calda         VARCHAR(100)  NULL,                -- texto da bula (terrestre/aérea)
  aplic_min            INT           NULL,
  aplic_max            INT           NULL,
  intervalo_aplic_dias INT           NULL,
  carencia_dias        INT           NULL,                -- NULL = não determinada / UNA
  epoca_aplicacao      TEXT          NULL,
  observacao           TEXT          NULL,
  inferido             TINYINT(1)    NOT NULL DEFAULT 0,  -- valor deduzido de célula mesclada: conferir
  conferido            TINYINT(1)    NOT NULL DEFAULT 0,  -- aprovado pelo agrônomo
  conferido_por        VARCHAR(100)  NULL,
  conferido_em         DATETIME      NULL,
  criado_em            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_compendio_tratamentos_produto (produto_id),
  KEY ix_compendio_tratamentos_cultura (cultura),
  CONSTRAINT fk_compendio_tratamentos_produto FOREIGN KEY (produto_id) REFERENCES compendio_produtos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PDF da bula (separado para não pesar nas consultas do compêndio; o backup pode pular com --ignore-table)
CREATE TABLE compendio_bulas (
  produto_id  INT        NOT NULL PRIMARY KEY,
  pdf         LONGBLOB   NOT NULL,
  tamanho     INT        NOT NULL,
  criado_em   DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_compendio_bulas_produto FOREIGN KEY (produto_id) REFERENCES compendio_produtos (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Catálogo de culturas e pragas: id = ID do Novo Receituário (REC_NOVOREC_*), para as receitas
-- e os vínculos com a CIDASC continuarem valendo; as criadas aqui começam em 1000000
CREATE TABLE compendio_culturas (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome            VARCHAR(100) NOT NULL,
  nome_cientifico VARCHAR(200) NULL,
  id_cidasc       INT          NULL,
  ativo           TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=1000000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE compendio_pragas (
  id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  nome            VARCHAR(150) NOT NULL,
  nome_cientifico VARCHAR(200) NULL,
  id_cidasc       INT          NULL,
  ativo           TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB AUTO_INCREMENT=1000000 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- De-para: texto como veio da bula -> catálogo. A collation ignora maiúsculas e acentos,
-- então "Soja" e "SOJA" são a mesma linha
CREATE TABLE compendio_depara_culturas (
  nome           VARCHAR(100) NOT NULL PRIMARY KEY,     -- compendio_tratamentos.cultura
  cultura_id     INT          NULL,                     -- NULL = ainda sem correspondência
  regra          VARCHAR(20)  NOT NULL,                 -- como casou: exato, prefixo, gm, ..., manual
  conferido      TINYINT(1)   NOT NULL DEFAULT 0,       -- 1 = acertado na tela: o script não mexe mais
  atualizado_em  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_depara_culturas FOREIGN KEY (cultura_id) REFERENCES compendio_culturas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE compendio_depara_pragas (
  praga_comum      VARCHAR(200) NOT NULL DEFAULT '',    -- compendio_tratamentos.praga_comum (NULL vira '')
  praga_cientifico VARCHAR(200) NOT NULL DEFAULT '',
  praga_id         INT          NULL,
  regra            VARCHAR(20)  NOT NULL,               -- cientifico, parecido, genero, nome, generica, manual
  conferido        TINYINT(1)   NOT NULL DEFAULT 0,
  atualizado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (praga_comum, praga_cientifico),
  CONSTRAINT fk_depara_pragas FOREIGN KEY (praga_id) REFERENCES compendio_pragas (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reversão
-- DROP TABLE compendio_depara_pragas;
-- DROP TABLE compendio_depara_culturas;
-- DROP TABLE compendio_pragas;
-- DROP TABLE compendio_culturas;
-- DROP TABLE compendio_bulas;
-- DROP TABLE compendio_tratamentos;
-- DROP TABLE compendio_produtos;

-- ------------------------------------------------------------
-- Textos do produto lidos da bula (iguais para toda a bula): a CIDASC exige EPI e precauções.
-- O AGROFIT não tem esses campos.
-- ------------------------------------------------------------
ALTER TABLE compendio_produtos
  ADD COLUMN epi             TEXT         NULL AFTER classe_ambiental,  -- equipamentos de proteção individual
  ADD COLUMN precaucoes      TEXT         NULL AFTER epi,               -- precauções de uso / aplicação
  ADD COLUMN local_aplicacao VARCHAR(50)  NULL AFTER precaucoes,        -- ex.: "Na cultura", "No alvo", "Solo"
  ADD COLUMN antidoto        VARCHAR(500) NULL AFTER local_aplicacao,   -- antídoto / tratamento médico
  ADD COLUMN textos_em       DATETIME     NULL AFTER antidoto;          -- quando os textos foram lidos

-- Reversão
-- ALTER TABLE compendio_produtos DROP COLUMN textos_em, DROP COLUMN antidoto, DROP COLUMN local_aplicacao,
--   DROP COLUMN precaucoes, DROP COLUMN epi;
