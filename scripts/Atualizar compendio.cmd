@echo off
rem Atualiza o compendio central (AGROFIT, bulas, leitura pela Claude e de-para).
rem Duplo clique para rodar; no Agendador de Tarefas use o argumento "agendado" (nao espera tecla no fim).
title Atualizar compendio
cd /d "%~dp0.."
call npx tsx scripts/atualizar-compendio.ts
if /i not "%~1"=="agendado" pause
