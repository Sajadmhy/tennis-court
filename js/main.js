/* Starts the WebGL hero. Pauses when off-screen or the tab is hidden,
   renders a single still frame when the visitor prefers reduced motion,
   and silently keeps the CSS gradient if WebGL is unavailable. */
(function () {
  'use strict';

  var canvas = document.querySelector('canvas[data-tennis-hero]');
  if (!canvas || typeof window.createHero !== 'function') return;

  var hero = null;
  try {
    hero = window.createHero(canvas, { getSpeed: function () { return 1; } });
  } catch (err) {
    hero = null;
  }
  if (!hero) return;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    hero.renderAt(2.4);
    window.addEventListener('resize', function () { hero.renderAt(2.4); });
    return;
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { e.isIntersecting ? hero.play() : hero.pause(); });
    }).observe(canvas);
  } else {
    hero.play();
  }

  document.addEventListener('visibilitychange', function () {
    document.hidden ? hero.pause() : hero.play();
  });
})();
