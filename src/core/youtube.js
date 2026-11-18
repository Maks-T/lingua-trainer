/**
 * YouTube IFrame Player API: загрузка и управляемый плеер
 * (переход к фрагменту, автопауза в конце фразы, скорость).
 */

let apiPromise = null;

export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Не удалось загрузить YouTube'));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

/**
 * @param {HTMLElement} el контейнер плеера
 * @param {{id: string, start?: number}} video
 * @param {{onReady?: Function, onTime?: (t: number) => void}} handlers
 */
export async function createSegmentPlayer(el, video, handlers = {}) {
  const YT = await loadYouTubeApi();
  let player = null;
  let ready = false;
  let segmentEnd = null;
  let timer = null;
  let destroyed = false;

  const stopWatch = () => {
    clearInterval(timer);
    timer = null;
  };

  const watch = () => {
    stopWatch();
    timer = setInterval(() => {
      if (!ready || destroyed) return;
      const t = player.getCurrentTime?.() ?? 0;
      handlers.onTime?.(t);
      if (segmentEnd !== null && t >= segmentEnd) {
        player.pauseVideo();
        player.setPlaybackRate?.(1);
        segmentEnd = null;
      }
    }, 100);
  };

  await new Promise((resolve) => {
    player = new YT.Player(el, {
      videoId: video.id,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        cc_load_policy: 0, // встроенные субтитры подсказали бы ответ
        iv_load_policy: 3,
        start: Math.floor(video.start || 0),
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          ready = true;
          watch();
          handlers.onReady?.();
          resolve();
        },
        onStateChange: (e) => {
          // Пользователь сам запустил видео — снимаем автопаузу фрагмента
          if (e.data === YT.PlayerState.PLAYING && segmentEnd === null) watch();
        },
      },
    });
  });

  return {
    /** Проигрывает отрезок [start, end] и ставит паузу в конце. */
    playSegment(start, end, rate = 1) {
      if (!ready) return;
      segmentEnd = end;
      player.setPlaybackRate?.(rate);
      player.seekTo(start, true);
      player.playVideo();
      watch();
    },
    seek(t) {
      if (!ready) return;
      segmentEnd = null;
      player.seekTo(t, true);
    },
    pause() {
      if (!ready) return;
      segmentEnd = null;
      player.pauseVideo();
    },
    currentTime() {
      return ready ? player.getCurrentTime?.() ?? 0 : 0;
    },
    destroy() {
      destroyed = true;
      stopWatch();
      try {
        player?.destroy();
      } catch {
        /* уже удалён */
      }
    },
  };
}
