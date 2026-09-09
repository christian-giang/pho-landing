/* Evening-photo carousel for the Abendkarte section.
   Crossfade between slides, auto-advance (paused on hover/focus/hidden tab and
   disabled under prefers-reduced-motion), with dots, arrows and touch swipe. */
(function () {
  "use strict";

  var root = document.getElementById("eveningCarousel");
  if (!root) return;
  var slides = Array.prototype.slice.call(root.querySelectorAll(".carousel-slide"));
  if (slides.length < 2) return;

  var dotsWrap = root.querySelector(".carousel-dots");
  var prev = root.querySelector(".carousel-prev");
  var next = root.querySelector(".carousel-next");

  var idx = 0;
  for (var i = 0; i < slides.length; i++) {
    if (slides[i].classList.contains("is-active")) {
      idx = i;
      break;
    }
  }

  var dots = slides.map(function (_, i) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-label", "Bild " + (i + 1));
    b.addEventListener("click", function () {
      go(i);
      restart();
    });
    dotsWrap.appendChild(b);
    return b;
  });

  function render() {
    slides.forEach(function (s, i) {
      var on = i === idx;
      s.classList.toggle("is-active", on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
      dots[i].setAttribute("aria-selected", on ? "true" : "false");
    });
  }
  function go(i) {
    idx = (i + slides.length) % slides.length;
    render();
  }
  function nextSlide() {
    go(idx + 1);
  }
  function prevSlide() {
    go(idx - 1);
  }

  if (next) next.addEventListener("click", function () { nextSlide(); restart(); });
  if (prev) prev.addEventListener("click", function () { prevSlide(); restart(); });

  // Auto-advance, disabled when the visitor prefers reduced motion.
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var timer = null;
  function start() {
    if (reduce) return;
    stop();
    timer = window.setInterval(nextSlide, 5000);
  }
  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }
  function restart() {
    stop();
    start();
  }
  root.addEventListener("mouseenter", stop);
  root.addEventListener("mouseleave", start);
  root.addEventListener("focusin", stop);
  root.addEventListener("focusout", start);
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  // Touch / pointer swipe.
  var startX = null;
  root.addEventListener("pointerdown", function (e) {
    startX = e.clientX;
  });
  root.addEventListener("pointerup", function (e) {
    if (startX === null) return;
    var dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 40) {
      if (dx < 0) nextSlide();
      else prevSlide();
      restart();
    }
  });

  render();
  start();
})();
