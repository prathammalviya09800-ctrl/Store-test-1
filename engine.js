/* ============================================================
   VOLTRIX ENGINE — procedural 3D phones & earbuds (Three.js r128)
   One shared render loop drives every mounted instance; instances
   outside the viewport are skipped to save battery on mobile.
   ============================================================ */
(function (global) {
  if (!window.THREE) { global.Voltrix3D = { mount: function () { return null; } }; return; }
  var THREE = window.THREE;

  /* ---------------- shared helpers ---------------- */

  function roundedRectShape(w, h, r) {
    var s = new THREE.Shape();
    var x = -w / 2, y = -h / 2;
    s.moveTo(x, y + r);
    s.lineTo(x, y + h - r);
    s.quadraticCurveTo(x, y + h, x + r, y + h);
    s.lineTo(x + w - r, y + h);
    s.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
    s.lineTo(x + w, y + r);
    s.quadraticCurveTo(x + w, y, x + w - r, y);
    s.lineTo(x + r, y);
    s.quadraticCurveTo(x, y, x, y + r);
    return s;
  }

  function slabGeo(w, h, depth, r, bevel) {
    var shape = roundedRectShape(w, h, r);
    var geo = new THREE.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 6, curveSegments: 20, steps: 1
    });
    geo.translate(0, 0, -depth / 2);
    return geo;
  }

  function glowSprite(color, size) {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.95)');
    gr.addColorStop(0.4, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    var tex = new THREE.CanvasTexture(c);
    var m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    var s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }

  /* studio environment: a few light panels baked into a PMREM map,
     shared across all instances so we only build it once */
  var sharedEnv = null;
  function studioEnv(renderer) {
    if (sharedEnv) return sharedEnv;
    var envScene = new THREE.Scene();
    function panel(w, h, col, power, pos, look) {
      var m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(power), side: THREE.DoubleSide })
      );
      m.position.set(pos[0], pos[1], pos[2]);
      m.lookAt(look ? look[0] : 0, look ? look[1] : 0, look ? look[2] : 0);
      envScene.add(m);
    }
    envScene.background = new THREE.Color(0x1c1a15);
    panel(9, 7, 0xffcf8f, 5.5, [-6, 6, 6]);
    panel(7, 11, 0x8fb3c9, 1.6, [7, 2, -5]);
    panel(16, 3, 0xfff2d9, 1.1, [0, 9, 2]);
    panel(10, 10, 0x2a2015, 0.7, [0, -6, 0]);
    var pmrem = new THREE.PMREMGenerator(renderer);
    sharedEnv = pmrem.fromScene(envScene, 0.04).texture;
    return sharedEnv;
  }

  /* ---------------- screen texture (UI face of the phone) ---------------- */
  function screenTexture(opts) {
    var W = 620, H = 1340;
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, opts.wallTop || '#3a3f52');
    grad.addColorStop(1, opts.wallBot || '#13131c');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);

    // status bar
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.font = '600 26px Inter, sans-serif';
    g.fillText('9:41', 34, 62);
    g.fillStyle = 'rgba(255,255,255,.8)';
    [0, 1, 2].forEach(function (i) { g.fillRect(W - 108 + i * 16, 44, 10, 16 - i * 3); });

    if (opts.notch === 'island') {
      g.fillStyle = '#000'; roundRectPath(g, W / 2 - 62, 26, 124, 34, 17); g.fill();
    } else if (opts.notch === 'punch') {
      g.fillStyle = '#000'; g.beginPath(); g.arc(W / 2, 44, 12, 0, 7); g.fill();
    }

    // big clock
    g.fillStyle = 'rgba(255,255,255,.95)';
    g.font = '300 108px Fraunces, Georgia, serif';
    g.textAlign = 'center';
    g.fillText(opts.clock || '9:41', W / 2, 330);
    g.font = '400 30px Inter, sans-serif';
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.fillText(opts.date || 'Tuesday, 29 September', W / 2, 372);
    g.textAlign = 'left';

    // dock / app icons
    var rows = opts.iconRows || 2, cols = 4;
    var top = H - (rows === 2 ? 430 : 300);
    var cell = W / cols;
    for (var r = 0; r < rows; r++) {
      for (var col = 0; col < cols; col++) {
        var cx = cell * col + cell / 2, cy = top + r * 150;
        var hue = (col * 47 + r * 91 + (opts.hueShift || 0)) % 360;
        g.fillStyle = 'hsla(' + hue + ',60%,55%,.85)';
        roundRectPath(g, cx - 40, cy - 40, 80, 80, 20); g.fill();
      }
    }
    // dock bar
    g.fillStyle = 'rgba(255,255,255,.14)';
    roundRectPath(g, 40, H - 140, W - 80, 96, 30); g.fill();
    for (var d = 0; d < 4; d++) {
      var dx = 40 + (W - 80) / 4 * d + (W - 80) / 8;
      g.fillStyle = 'hsla(' + ((d * 63 + (opts.hueShift || 0)) % 360) + ',55%,58%,.9)';
      roundRectPath(g, dx - 32, H - 122, 64, 64, 16); g.fill();
    }

    function roundRectPath(ctx, x, y, w, h, rad) {
      ctx.beginPath();
      ctx.moveTo(x + rad, y);
      ctx.arcTo(x + w, y, x + w, y + h, rad);
      ctx.arcTo(x + w, y + h, x, y + h, rad);
      ctx.arcTo(x, y + h, x, y, rad);
      ctx.arcTo(x, y, x + w, y, rad);
      ctx.closePath();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function glassStreakTexture() {
    var c = document.createElement('canvas'); c.width = c.height = 512;
    var g = c.getContext('2d');
    g.clearRect(0, 0, 512, 512);
    var grad = g.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.42, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,.16)');
    grad.addColorStop(0.58, 'rgba(255,255,255,0)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
    return new THREE.CanvasTexture(c);
  }

  /* ---------------- lens module for camera bumps ---------------- */
  function makeLens(radius, ringMat, glassMat) {
    var g = new THREE.Group();
    var glass = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.03, 32), glassMat);
    glass.rotation.x = Math.PI / 2;
    var ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.08, radius * 0.14, 12, 32), ringMat);
    var dot = glowSprite('rgba(210,225,235,.7)', radius * 0.9);
    dot.position.set(radius * 0.32, radius * 0.32, 0.03);
    g.add(glass, ring, dot);
    return g;
  }

  var LAYOUTS = {
    'triple-tri': function (bump, r, ringMat, glassMat) {
      var pos = [[-0.34, 0.34], [0.34, 0.34], [0, -0.34]];
      pos.forEach(function (p) {
        var l = makeLens(r, ringMat, glassMat);
        l.position.set(p[0], p[1], 0.05);
        bump.add(l);
      });
    },
    'quad-strip': function (bump, r, ringMat, glassMat) {
      var ys = [0.46, 0.02, -0.42];
      ys.forEach(function (y) {
        var l = makeLens(r * 0.92, ringMat, glassMat);
        l.position.set(-0.02, y, 0.05);
        bump.add(l);
      });
      var flash = new THREE.Mesh(new THREE.CircleGeometry(r * 0.34, 20), glassMat);
      flash.position.set(0.42, 0.46, 0.05);
      bump.add(flash);
    },
    'dual-diag': function (bump, r, ringMat, glassMat) {
      var big = [[-0.28, 0.22], [0.28, -0.05]];
      big.forEach(function (p) {
        var l = makeLens(r * 1.1, ringMat, glassMat);
        l.position.set(p[0], p[1], 0.05);
        bump.add(l);
      });
      var small = makeLens(r * 0.55, ringMat, glassMat);
      small.position.set(-0.3, -0.28, 0.05);
      bump.add(small);
    },
    'single': function (bump, r, ringMat, glassMat) {
      var l = makeLens(r * 1.25, ringMat, glassMat);
      l.position.set(0, 0, 0.05);
      bump.add(l);
    }
  };

  /* ---------------- PHONE BUILDER ---------------- */
  function buildPhone(opts, env) {
    var group = new THREE.Group();
    var W = 1.55, H = 3.18, D = 0.185;

    var bodyMat = new THREE.MeshPhysicalMaterial({
      color: opts.color, metalness: 0.65, roughness: 0.32,
      clearcoat: 0.55, clearcoatRoughness: 0.28, envMap: env, envMapIntensity: 1.15
    });
    var body = new THREE.Mesh(slabGeo(W, H, D, 0.34, 0.045), bodyMat);
    body.castShadow = body.receiveShadow = true;
    group.add(body);

    // screen (UI layer + glass streak overlay)
    var screenW = W - 0.16, screenH = H - 0.16;
    var screen = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW, screenH),
      new THREE.MeshBasicMaterial({ map: screenTexture(opts.screen || {}), toneMapped: false })
    );
    screen.position.z = D / 2 + 0.006;
    group.add(screen);

    var streak = new THREE.Mesh(
      new THREE.PlaneGeometry(screenW, screenH),
      new THREE.MeshBasicMaterial({ map: glassStreakTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    streak.position.z = D / 2 + 0.008;
    group.add(streak);

    // camera bump on back
    var bumpMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(opts.color).multiplyScalar(0.55), metalness: 0.8, roughness: 0.4,
      envMap: env, envMapIntensity: 1
    });
    var ringMat = new THREE.MeshStandardMaterial({ color: 0xcdd3d8, metalness: 1, roughness: 0.28, envMap: env, envMapIntensity: 1.2 });
    var glassMat = new THREE.MeshPhysicalMaterial({ color: 0x07080a, metalness: 0.1, roughness: 0.08, clearcoat: 1, envMap: env, envMapIntensity: 1.4 });

    var bumpW = opts.bumpStyle === 'single' ? 0.62 : 0.98;
    var bumpH = opts.bumpStyle === 'quad-strip' ? 1.5 : 1.0;
    var bump = new THREE.Mesh(slabGeo(bumpW, bumpH, 0.09, 0.22, 0.02), bumpMat);
    bump.position.set(opts.bumpStyle === 'quad-strip' ? -(W / 2 - bumpW / 2 - 0.16) : -(W / 2 - bumpW / 2 - 0.18),
      H / 2 - bumpH / 2 - 0.2, -D / 2 - 0.045);
    bump.rotation.y = Math.PI;
    (LAYOUTS[opts.bumpStyle] || LAYOUTS['triple-tri'])(bump, 0.155, ringMat, glassMat);
    group.add(bump);

    // side buttons
    var btnMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(opts.color).multiplyScalar(0.8), metalness: 0.85, roughness: 0.35, envMap: env });
    [[W / 2 + 0.012, H * 0.14, 0.34], [W / 2 + 0.012, H * 0.02, 0.34]].forEach(function (p) {
      var btn = new THREE.Mesh(new THREE.BoxGeometry(0.03, p[2], 0.1), btnMat);
      btn.position.set(p[0], p[1], 0);
      group.add(btn);
    });
    var power = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.1), btnMat);
    power.position.set(-W / 2 - 0.012, H * 0.1, 0);
    group.add(power);

    group.userData = { bodyMat: bodyMat, bumpMat: bumpMat, btnMat: btnMat, baseColor: new THREE.Color(opts.color) };
    group.rotation.set(0.06, -0.55, 0);
    return group;
  }

  /* ---------------- EARBUDS BUILDER ---------------- */
  function buildEarbuds(opts, env) {
    var group = new THREE.Group();
    var caseW = 1.5, caseH = 1.08, caseD = 0.62;

    var caseMat = new THREE.MeshPhysicalMaterial({ color: opts.color, metalness: 0.35, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.3, envMap: env, envMapIntensity: 1.1 });
    var base = new THREE.Mesh(slabGeo(caseW, caseH * 0.62, caseD, 0.4, 0.05), caseMat);
    base.rotation.x = Math.PI / 2;
    base.position.y = -caseH * 0.14;
    group.add(base);

    var lid = new THREE.Mesh(slabGeo(caseW, caseH * 0.5, caseD * 0.92, 0.4, 0.05), caseMat);
    var hinge = new THREE.Group();
    hinge.position.set(0, caseH * 0.15, -caseD * 0.42);
    lid.position.set(0, caseH * 0.22, caseD * 0.06);
    lid.rotation.x = Math.PI / 2;
    hinge.add(lid);
    hinge.rotation.x = -1.15; // open lid
    group.add(hinge);

    var led = glowSprite('rgba(180,255,200,.9)', 0.09);
    led.position.set(0, -caseH * 0.05, caseD / 2 + 0.02);
    group.add(led);

    function bud(x) {
      var budMat = new THREE.MeshPhysicalMaterial({ color: opts.budColor || 0xf2f0ea, metalness: 0.15, roughness: 0.22, clearcoat: 0.5, envMap: env, envMapIntensity: 1.1 });
      var b = new THREE.Group();
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 18), budMat);
      head.scale.set(1, 0.92, 1.05);
      var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.42, 16), budMat);
      stem.position.y = -0.28;
      b.add(head, stem);
      if (opts.tip) {
        var tipMat = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 });
        var tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.1, 16), tipMat);
        tip.position.y = -0.5; tip.rotation.x = Math.PI;
        b.add(tip);
      }
      b.position.set(x, -caseH * 0.05, caseD * 0.12);
      b.rotation.x = -0.2;
      return b;
    }
    group.add(bud(-0.36), bud(0.36));

    group.userData = { bodyMat: caseMat, baseColor: new THREE.Color(opts.color) };
    group.rotation.set(0.15, -0.4, 0);
    return group;
  }

  /* ---------------- instance registry + shared render loop ---------------- */
  var registry = [];
  var clock = new THREE.Clock();
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(clock.getDelta(), 0.05);
    for (var i = 0; i < registry.length; i++) {
      var inst = registry[i];
      if (inst.paused) continue;
      inst.time += dt;
      updateInstance(inst, dt);
      inst.renderer.render(inst.scene, inst.camera);
    }
  }
  requestAnimationFrame(tick);

  function updateInstance(inst, dt) {
    var g = inst.group;

    // colour tween
    if (inst.colorTarget) {
      g.userData.bodyMat.color.lerp(inst.colorTarget, 1 - Math.exp(-dt * 6));
      if (g.userData.bumpMat) g.userData.bumpMat.color.copy(g.userData.bodyMat.color).multiplyScalar(0.55);
      if (g.userData.btnMat) g.userData.btnMat.color.copy(g.userData.bodyMat.color).multiplyScalar(0.8);
    }

    // intro drop + settle
    if (!inst.landed) {
      inst.vy -= 13 * dt;
      inst.introY += inst.vy * dt;
      if (inst.introY <= 0) {
        inst.introY = 0; inst.vy = -inst.vy * 0.22;
        if (Math.abs(inst.vy) < 0.35) { inst.landed = true; inst.vy = 0; inst.flare.material.opacity = 1; }
      }
      if (reduce) { inst.introY = 0; inst.landed = true; }
    }

    // drag / inertia / idle auto-rotate
    if (inst.dragging) {
      // handled directly in pointer handlers
    } else if (Math.abs(inst.spin) > 0.0001) {
      g.rotation.y += inst.spin;
      inst.spin *= Math.pow(0.9, dt * 60);
    } else if (!reduce) {
      g.rotation.y += dt * (inst.idleSpeed || 0.18);
    }

    g.position.y = inst.introY + Math.sin(inst.time * 1.4) * (inst.landed ? 0.045 : 0);
    inst.camera.position.set(inst.camPos[0], inst.camPos[1], inst.camPos[2]);
    inst.camera.lookAt(0, inst.camLook || 0, 0);
    inst.key.position.set(-2.2, 4.4, 3.2);
    inst.key.target.position.set(0, 0.3, 0);
  }

  /* ---------------- mount / public API ---------------- */
  function mount(container, opts) {
    if (!window.THREE) return null;
    var canvas = document.createElement('canvas');
    container.appendChild(canvas);
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
    } catch (e) { return null; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new THREE.Scene();
    scene.background = new THREE.Color(opts.bg || 0x1c1a15);
    var env = studioEnv(renderer);
    scene.environment = env;

    var camera = new THREE.PerspectiveCamera(28, 1, 0.1, 30);

    var key = new THREE.SpotLight(0xffe2b0, 1.6, 0, 0.6, 0.7, 1.1);
    scene.add(key, key.target);
    scene.add(new THREE.HemisphereLight(0xaebfd0, 0x1a140c, 0.35));
    var rim = new THREE.DirectionalLight(0x8fc4ff, 0.7);
    rim.position.set(3, 2, -3);
    scene.add(rim);

    // reflective disc under the product
    var discCanvas = document.createElement('canvas'); discCanvas.width = discCanvas.height = 256;
    var dg = discCanvas.getContext('2d');
    var rg = dg.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, 'rgba(255,200,140,.35)');
    rg.addColorStop(1, 'rgba(255,200,140,0)');
    dg.fillStyle = rg; dg.fillRect(0, 0, 256, 256);
    var discTex = new THREE.CanvasTexture(discCanvas);
    var disc = new THREE.Mesh(new THREE.CircleGeometry(2.6, 48), new THREE.MeshBasicMaterial({ map: discTex, transparent: true }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -1.75;
    scene.add(disc);

    var group = opts.type === 'earbuds' ? buildEarbuds(opts, env) : buildPhone(opts, env);
    group.position.y = 0;
    scene.add(group);

    var flare = glowSprite('rgba(255,210,140,.0)', 3.4);
    flare.material.opacity = 0;
    flare.position.y = -1.6;
    scene.add(flare);

    var inst = {
      renderer: renderer, scene: scene, camera: camera, group: group, key: key,
      time: 0, introY: opts.type === 'earbuds' ? 2.4 : 3.4, vy: 0, landed: false,
      spin: 0, dragging: false, idleSpeed: opts.idleSpeed != null ? opts.idleSpeed : 0.18,
      camPos: opts.type === 'earbuds' ? [0.3, 1.1, 4.4] : [0.4, 0.9, 5.6],
      camLook: opts.type === 'earbuds' ? 0.1 : 0.3,
      colorTarget: null, paused: false, flare: flare
    };
    registry.push(inst);

    function resize() {
      var w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(container);
    else window.addEventListener('resize', resize);

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { inst.paused = !e.isIntersecting; });
      }, { threshold: 0.05 }).observe(container);
    }

    if (opts.allowDrag !== false) attachDrag(canvas, inst);

    return {
      setColor: function (hex) { inst.colorTarget = new THREE.Color(hex); },
      group: group,
      dispose: function () {
        registry = registry.filter(function (r) { return r !== inst; });
        renderer.dispose();
      }
    };
  }

  function attachDrag(canvas, inst) {
    var lastX = 0, lastY = 0, idleTimer = null;
    function down(x, y) {
      inst.dragging = true; lastX = x; lastY = y; inst.spin = 0;
      clearTimeout(idleTimer);
      canvas.style.cursor = 'grabbing';
    }
    function move(x, y) {
      if (!inst.dragging) return;
      var dx = x - lastX, dy = y - lastY;
      inst.group.rotation.y += dx * 0.0072;
      inst.group.rotation.x = Math.max(-0.5, Math.min(0.5, inst.group.rotation.x + dy * 0.004));
      inst.spin = dx * 0.0072;
      lastX = x; lastY = y;
    }
    function up() {
      if (!inst.dragging) return;
      inst.dragging = false;
      canvas.style.cursor = 'grab';
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { inst.spin = inst.idleSpeed ? 0 : 0; }, 10);
    }
    canvas.addEventListener('pointerdown', function (e) { canvas.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', function (e) { move(e.clientX, e.clientY); });
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', function () { if (inst.dragging) up(); });
  }

  global.Voltrix3D = { mount: mount };
})(window);
