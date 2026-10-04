#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const BUILD_DIR = path.resolve(ROOT_DIR, 'dist');
const TARGET_BRANCH = 'gh-pages';

const log = {
  step: (msg) => console.log(`\x1b[33m➔ ${msg}\x1b[0m`),
  success: (msg) => console.log(`\x1b[32m✔ ${msg}\x1b[0m`),
  error: (msg) => console.error(`\n\x1b[31m✖ ${msg}\x1b[0m`),
};

const exec = (cmd, cwd = ROOT_DIR) => {
  execSync(cmd, { stdio: 'inherit', cwd });
};

// Получаем URL текущего репозитория автоматически из git
function getRepoUrl() {
  try {
    return execSync('git config --get remote.origin.url', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function deploy() {
  const repoUrl = process.env.DEPLOY_REPO_URL || getRepoUrl();

  if (!repoUrl) {
    log.error('Не удалось определить remote.origin.url. Укажите DEPLOY_REPO_URL в .env');
    process.exit(1);
  }

  // 1. Сборка проекта
  // Убеждаемся, что base относительный ('./'), чтобы ассеты находились в подпапке https://user.github.io/repo/
  log.step('Шаг 1. Собираем проект для GitHub Pages...');
  exec('pnpm run build');

  if (!fs.existsSync(BUILD_DIR)) {
    throw new Error(`Папка ${BUILD_DIR} не найдена после сборки!`);
  }

  // 2. Специфика GitHub Pages
  log.step('Шаг 2. Добавляем системные файлы GitHub Pages...');

  // Файл .nojekyll отключает обработку Jekyll (Jekyll игнорирует папки с нижним подчеркиванием и ломает бандлы)
  fs.writeFileSync(path.join(BUILD_DIR, '.nojekyll'), '');

  // Если у вас есть роутер (SPA), копируем index.html в 404.html, чтобы при обновлении страницы не было ошибки 404
  const indexHtml = path.join(BUILD_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    fs.copyFileSync(indexHtml, path.join(BUILD_DIR, '404.html'));
  }

  // 3. Создание чистой ветки и пуш
  log.step(`Шаг 3. Инициализация чистой ветки [${TARGET_BRANCH}] и отправка...`);
  const gitDir = path.join(BUILD_DIR, '.git');
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  try {
    exec('git init', BUILD_DIR);
    exec(`git checkout -B ${TARGET_BRANCH}`, BUILD_DIR);
    exec('git config user.name "GitHub Pages Bot"', BUILD_DIR);
    exec('git config user.email "bot@gh-pages"', BUILD_DIR);
    exec('git add .', BUILD_DIR);
    exec('git commit -m "Deploy to GitHub Pages"', BUILD_DIR);
    exec(`git remote add origin ${repoUrl}`, BUILD_DIR);
    exec(`git push origin ${TARGET_BRANCH} --force`, BUILD_DIR);

    log.success(`Успешно опубликовано в ветку [${TARGET_BRANCH}]!`);
  } finally {
    // Подчищаем временный .git в dist
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true });
    }
  }
}

deploy().catch((err) => {
  log.error(`Деплой завершился с ошибкой: ${err.message}`);
  process.exit(1);
});