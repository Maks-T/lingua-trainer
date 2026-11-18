/**
 * Встроенный плеер YouTube в модальном окне.
 */
import { audio } from './audio.js';
import { escapeHtml } from './utils.js';

export function thumbnailUrl(video) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg`;
}

export function watchUrl(video) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(video.id)}${video.start ? `&t=${video.start}s` : ''}`;
}

export function openVideoModal(video) {
  const modal = document.getElementById('video-modal');
  if (!modal || !video) return;
  audio.stopSpeech();
  const params = new URLSearchParams({ autoplay: '1', rel: '0', modestbranding: '1', playsinline: '1' });
  if (video.start) params.set('start', String(video.start));
  modal.querySelector('#video-title').textContent = video.title || 'Видео урока';
  modal.querySelector('#video-open-yt').href = watchUrl(video);
  modal.querySelector('.video-frame').innerHTML = `
    <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}?${params}"
      title="${escapeHtml(video.title || 'YouTube video')}"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  modal.hidden = false;
  modal.querySelector('#btn-close-video')?.focus();
}

export function closeVideoModal() {
  const modal = document.getElementById('video-modal');
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  // Удаляем iframe, чтобы остановить воспроизведение
  modal.querySelector('.video-frame').innerHTML = '';
}

export function initVideoModal() {
  const modal = document.getElementById('video-modal');
  if (!modal) return;
  modal.querySelector('#btn-close-video')?.addEventListener('click', closeVideoModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeVideoModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeVideoModal();
  });
}
