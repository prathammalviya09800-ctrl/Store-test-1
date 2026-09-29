/* ============================================================
   VOLTRIX — shared page glue (shutter transitions, nav, swatches)
   ============================================================ */
(function () {
  var WA_NUMBER = '919999999999'; // TODO: replace with the real store WhatsApp number

  function waLink(message) {
    return 'https://wa.me/' + WA_NUMBER + '?text=' + encodeURIComponent(message);
  }
  window.Voltrix = window.Voltrix || {};
  window.Voltrix.waLink = waLink;

  document.addEventListener('DOMContentLoaded', function () {
    /* ---- wire up every WhatsApp CTA that carries data-wa-msg ---- */
    document.querySelectorAll('[data-wa-msg]').forEach(function (el) {
      el.setAttribute('href', waLink(el.getAttribute('data-wa-msg')));
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
    });

    /* ---- shutter intro ---- */
    var shutter = document.getElementById('shutter');
    if (shutter) {
      shutter.classList.add('run');
      setTimeout(function () { shutter.style.display = 'none'; }, 980);
    }

    /* ---- mobile nav toggle ---- */
    var toggle = document.querySelector('.navtoggle');
    var nav = document.querySelector('nav.primary');
    if (toggle && nav) {
      toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
      nav.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('open'); });
      });
    }

    /* ---- mark the active nav link ---- */
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav.primary a[href]').forEach(function (a) {
      var target = a.getAttribute('href').split('/').pop();
      if (target === here) a.classList.add('active');
    });

    /* ---- outro shutter on internal navigation ---- */
    document.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#') return;
      if (a.target === '_blank' || a.hasAttribute('data-wa-msg') || /^https?:\/\//.test(href)) return;
      a.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        var out = shutter || document.getElementById('shutter');
        if (!out || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          location.href = href; return;
        }
        out.style.display = 'block';
        out.classList.remove('run'); out.classList.add('leaving');
        setTimeout(function () { location.href = href; }, 560);
      });
    });

    /* ---- colour swatches on product pages ---- */
    document.querySelectorAll('.swatches').forEach(function (row) {
      var stageId = row.getAttribute('data-stage');
      var inst = window.Voltrix.instances && window.Voltrix.instances[stageId];
      row.querySelectorAll('.swatch').forEach(function (sw) {
        sw.addEventListener('click', function () {
          row.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('active'); });
          sw.classList.add('active');
          var hex = sw.getAttribute('data-hex');
          var nameEl = document.querySelector('[data-color-name="' + stageId + '"]');
          if (nameEl) nameEl.textContent = sw.getAttribute('data-name') || '';
          var live = window.Voltrix.instances && window.Voltrix.instances[stageId];
          if (live) live.setColor(hex);
        });
      });
    });
  });

  /* build the shutter markup once per page (9 slats + a flare) */
  (function () {
    var n = 9, slats = '';
    for (var i = 0; i < n; i++) {
      slats += '<div class="slat" style="top:' + (i * 100 / n) + '%;animation-delay:' + (i * 22) + 'ms"></div>';
    }
    document.write('<div id="shutter" aria-hidden="true">' + slats + '<div class="glow"></div></div>');
  })();
})();
