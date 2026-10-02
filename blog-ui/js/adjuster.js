/* ============================================================
 * adjuster.js —— 临时可视化布局调整器（调完即移除）
 * 进入方式（页面 URL hash）：
 *   payphone.html#adjust        调电话亭
 *   internet_cafe.html#adjust   调建筑物热区
 *   internet_cafe.html#adjustNeon  调霓虹招牌动画
 * 操作：拖动方块移动；拖四角/四边手柄缩放；面板可输精确数值、
 *       复制 CSS、复位；Esc 退出。
 * 调完点「复制 CSS」发给开发者固化，之后本脚本与引用一起删除。
 * ============================================================ */
(function () {
  var page = location.pathname.split('/').pop();
  var hash = location.hash;
  var cfg = null;

  if (page === 'payphone.html' && hash.indexOf('adjust') >= 0) {
    cfg = { kind: 'box', sel: '#payphoneHotspot', sizeUnit: 'px', vEdge: 'bottom',
            labels: ['左 L%', '下 B%', '宽 Wpx', '高 Hpx'],
            reset: { left: 18, v: 8, width: 180, height: 256 } };
  } else if (page === 'internet_cafe.html') {
    // adjustNeon 也含 "adjust" 字样，必须先判
    if (hash.indexOf('adjustNeon') >= 0) {
      cfg = { kind: 'neon', sel: '#neonSign', sizeUnit: '%', vEdge: 'top',
              labels: ['中心 X%', '上 Y%', '宽 W%', '高 H%'],
              reset: { left: 50.5, v: 42.5, width: 13.5, height: 16 } };
    } else if (hash.indexOf('adjust') >= 0) {
      cfg = { kind: 'box', sel: '#buildHotspot', sizeUnit: '%', vEdge: 'top',
              labels: ['左 L%', '上 T%', '宽 W%', '高 H%'],
              reset: { left: 36, v: 17, width: 30, height: 49 } };
    }
  }
  if (!cfg) return;

  var el = document.querySelector(cfg.sel);
  if (!el) return;
  var root = document.documentElement;
  var HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

  // ===== 悬浮工具层 =====
  var layer = document.createElement('div');
  layer.id = '__adj_layer';
  layer.style.cssText = 'position:fixed;z-index:2147483646;cursor:move;box-sizing:border-box;' +
    'background:rgba(120,170,255,.14);border:2px solid #7ab0ff;' +
    'box-shadow:0 0 0 1px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.25);';
  layer.innerHTML = HANDLES.map(function (h) {
    return '<i data-h="' + h + '" style="position:absolute;z-index:2;"></i>';
  }).join('');
  document.body.appendChild(layer);

  // ===== 控制面板 =====
  var panel = document.createElement('div');
  panel.id = '__adj_panel';
  panel.innerHTML =
    '<div class="__ap_t">布局调整 <span id="__ap_x">✕</span></div>' +
    '<div class="__ap_grid">' +
      '<label>' + cfg.labels[0] + '</label><input type="number" step="0.1" data-k="left">' +
      '<label>' + cfg.labels[1] + '</label><input type="number" step="0.1" data-k="v">' +
      '<label>' + cfg.labels[2] + '</label><input type="number" step="0.1" data-k="width">' +
      '<label>' + cfg.labels[3] + '</label><input type="number" step="0.1" data-k="height">' +
    '</div>' +
    '<div class="__ap_btns">' +
      '<button id="__ap_reset">复位</button>' +
      '<button id="__ap_copy" class="p">复制 CSS</button>' +
    '</div>' +
    '<pre id="__ap_css"></pre>' +
    '<div class="__ap_tip">拖动方块移动 · 拖手柄缩放 · Esc 退出调整</div>';
  document.body.appendChild(panel);

  injectStyle();
  root.classList.add('__adjusting');

  var W = function () { return window.innerWidth; };
  var H = function () { return window.innerHeight; };
  var NEON_VARS = { left: '--neon-x', v: '--neon-y', width: '--neon-w', height: '--neon-h' };

  /* box 模式：初始定位来自 CSS 类，先具化为内联样式，
     否则 info() 读 el.style.xxx 得到空串（NaN） */
  if (cfg.kind === 'box') materialize();

  function materialize() {
    var r = el.getBoundingClientRect();
    el.style.left = (r.left / W() * 100) + '%';
    el.style[cfg.vEdge] = ((cfg.vEdge === 'top' ? r.top : H() - r.bottom) / H() * 100) + '%';
    if (cfg.sizeUnit === '%') {
      el.style.width = (r.width / W() * 100) + '%';
      el.style.height = (r.height / H() * 100) + '%';
    } else {
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
    }
  }

  // ===== 数值读取（统一语义：left/v/width/height） =====
  function info() {
    if (cfg.kind === 'neon') {
      var cs = getComputedStyle(root);
      return {
        left: parseFloat(cs.getPropertyValue(NEON_VARS.left)) || 0,
        v: parseFloat(cs.getPropertyValue(NEON_VARS.v)) || 0,
        width: parseFloat(cs.getPropertyValue(NEON_VARS.width)) || 0,
        height: parseFloat(cs.getPropertyValue(NEON_VARS.height)) || 0
      };
    }
    return {
      left: parseFloat(el.style.left),
      v: parseFloat(el.style[cfg.vEdge]),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height)
    };
  }

  // ===== 写入 =====
  function setBox(p) {
    var cur = info();
    var out = {
      left: p.left != null ? clamp(p.left, 0, 100) : cur.left,
      v: p.v != null ? clamp(p.v, 0, 100) : cur.v,
      width: p.width != null ? Math.max(2, p.width) : cur.width,
      height: p.height != null ? Math.max(2, p.height) : cur.height
    };
    if (cfg.kind === 'neon') {
      root.style.setProperty(NEON_VARS.left, out.left + '%');
      root.style.setProperty(NEON_VARS.v, out.v + '%');
      root.style.setProperty(NEON_VARS.width, out.width + '%');
      root.style.setProperty(NEON_VARS.height, out.height + '%');
    } else {
      el.style.left = out.left + '%';
      el.style[cfg.vEdge] = out.v + '%';
      el.style.width = out.width + cfg.sizeUnit;
      el.style.height = out.height + cfg.sizeUnit;
    }
    sync();
  }

  function sync() {
    var r = el.getBoundingClientRect();
    layer.style.left = r.left + 'px';
    layer.style.top = r.top + 'px';
    layer.style.width = r.width + 'px';
    layer.style.height = r.height + 'px';
    var p = info();
    ['left', 'v', 'width', 'height'].forEach(function (k) {
      var inp = panel.querySelector('input[data-k="' + k + '"]');
      if (inp && document.activeElement !== inp) inp.value = round(p[k], 2);
    });
    panel.querySelector('#__ap_css').textContent = genCss();
  }

  function genCss() {
    var p = info();
    if (cfg.kind === 'neon') {
      return ':root {\n' +
        '  --neon-x: ' + round(p.left, 2) + '%;\n' +
        '  --neon-y: ' + round(p.v, 2) + '%;\n' +
        '  --neon-w: ' + round(p.width, 2) + '%;\n' +
        '  --neon-h: ' + round(p.height, 2) + '%;\n}';
    }
    return cfg.sel + ' {\n' +
      '  left: ' + round(p.left, 2) + '%;\n' +
      '  ' + cfg.vEdge + ': ' + round(p.v, 2) + '%;\n' +
      '  width: ' + round(p.width, 2) + cfg.sizeUnit + ';\n' +
      '  height: ' + round(p.height, 2) + cfg.sizeUnit + ';\n}';
  }

  // ===== 拖拽移动 =====
  var drag = null;
  layer.addEventListener('pointerdown', function (e) {
    if (e.target !== layer) return;
    drag = { x: e.clientX, y: e.clientY, p: info() };
    layer.setPointerCapture(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  });
  layer.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var p = drag.p;
    var dl = (e.clientX - drag.x) / W() * 100;
    var dv = (cfg.vEdge === 'top' ? 1 : -1) * (e.clientY - drag.y) / H() * 100;
    setBox({ left: p.left + dl, v: p.v + dv });
  });
  layer.addEventListener('pointerup', function () { drag = null; });

  // ===== 手柄缩放 =====
  var rz = null;
  layer.addEventListener('pointerdown', function (e) {
    var h = e.target.getAttribute('data-h');
    if (!h) return;
    rz = { h: h, x: e.clientX, y: e.clientY, p: info() };
    layer.setPointerCapture(e.pointerId);
    e.preventDefault(); e.stopPropagation();
  });
  layer.addEventListener('pointermove', function (e) {
    if (!rz) return;
    var dx = e.clientX - rz.x, dy = e.clientY - rz.y;
    var h = rz.h, p = rz.p;
    var isPx = cfg.kind === 'box' && cfg.sizeUnit === 'px';
    // 尺寸增量：像素模式用 px，其余 %（neon 恒为 %）
    var dW = isPx ? dx : dx / W() * 100;
    var dH = isPx ? dy : dy / H() * 100;
    var dLeftPct = dx / W() * 100;   // 左/中心位移（百分比语义）
    var dVPct = dy / H() * 100;
    var box = {};
    if (h.indexOf('e') >= 0) box.width = p.width + dW;
    if (h.indexOf('s') >= 0) box.height = p.height + dH;
    if (h.indexOf('w') >= 0) {
      box.width = p.width - dW;
      // box：left 是左边界，全量跟移；neon：left 是中心，跟移一半
      box.left = p.left + (cfg.kind === 'neon' ? dLeftPct / 2 : dLeftPct);
    }
    if (h.indexOf('n') >= 0) {
      box.height = p.height - dH;
      if (cfg.vEdge === 'top') {
        // neon / top 锚 box：v 是顶部，全量跟移
        box.v = p.v + (isPx ? dVPct : dH);
      }
      // bottom 锚 box：bottom 不动
    }
    setBox(box);
  });
  layer.addEventListener('pointerup', function () { rz = null; });

  // ===== 面板事件 =====
  panel.addEventListener('input', function (e) {
    var k = e.target.getAttribute('data-k');
    if (!k) return;
    var o = {}; o[k] = parseFloat(e.target.value);
    setBox(o);
  });
  panel.querySelector('#__ap_reset').addEventListener('click', function () {
    setBox({ left: cfg.reset.left, v: cfg.reset.v,
             width: cfg.reset.width, height: cfg.reset.height });
  });
  panel.querySelector('#__ap_copy').addEventListener('click', function () {
    copyText(genCss());
    var b = panel.querySelector('#__ap_copy');
    b.textContent = '已复制 ✓';
    setTimeout(function () { b.textContent = '复制 CSS'; }, 1400);
  });
  panel.querySelector('#__ap_x').addEventListener('click', exit);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') exit();
  });
  window.addEventListener('resize', sync);

  function exit() {
    layer.remove(); panel.remove();
    root.classList.remove('__adjusting');
  }

  // ===== 工具函数 =====
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).catch(function () { fallback(t); });
    }
    return Promise.resolve(fallback(t));
  }
  function fallback(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }

  function injectStyle() {
    var st = document.createElement('style');
    st.textContent =
      'html.__adjusting, html.__adjusting body { user-select:none; }' +
      'html.__adjusting ' + cfg.sel + ' { transition:none !important; }' +
      'html.__adjusting ' + cfg.sel + '::after { display:none !important; }' +
      '#__adj_layer [data-h] { width:13px; height:13px; background:#fff; ' +
      'border:2px solid #4a86e8; border-radius:50%; box-sizing:border-box; }' +
      '#__adj_layer [data-h="nw"] { left:-8px; top:-8px; cursor:nwse-resize; }' +
      '#__adj_layer [data-h="n"]  { left:calc(50% - 7px); top:-8px; cursor:ns-resize; }' +
      '#__adj_layer [data-h="ne"] { right:-8px; top:-8px; cursor:nesw-resize; }' +
      '#__adj_layer [data-h="e"]  { right:-8px; top:calc(50% - 7px); cursor:ew-resize; }' +
      '#__adj_layer [data-h="se"] { right:-8px; bottom:-8px; cursor:nwse-resize; }' +
      '#__adj_layer [data-h="s"]  { left:calc(50% - 7px); bottom:-8px; cursor:ns-resize; }' +
      '#__adj_layer [data-h="sw"] { left:-8px; bottom:-8px; cursor:nesw-resize; }' +
      '#__adj_layer [data-h="w"]  { left:-8px; top:calc(50% - 7px); cursor:ew-resize; }' +
      '#__adj_panel { position:fixed; right:16px; bottom:16px; z-index:2147483647; ' +
      'width:262px; background:rgba(16,22,40,.96); border:1px solid rgba(122,176,255,.4); ' +
      'border-radius:14px; padding:12px 14px; color:#dce6ff; ' +
      'font:13px/1.4 "Segoe UI",sans-serif; box-shadow:0 10px 34px rgba(0,0,0,.5); }' +
      '#__adj_panel .__ap_t { font-weight:600; margin-bottom:9px; display:flex; ' +
      'justify-content:space-between; align-items:center; }' +
      '#__adj_panel .__ap_t span { cursor:pointer; color:#9fb2d8; padding:0 4px; }' +
      '#__adj_panel .__ap_grid { display:grid; grid-template-columns:1fr 84px; ' +
      'gap:6px 8px; align-items:center; }' +
      '#__adj_panel .__ap_grid label { color:#9fb2d8; font-size:12px; }' +
      '#__adj_panel .__ap_grid input { width:100%; box-sizing:border-box; ' +
      'background:#0e1530; border:1px solid #31406a; border-radius:6px; color:#dce6ff; ' +
      'padding:4px 6px; font-size:12px; }' +
      '#__adj_panel .__ap_btns { display:flex; gap:8px; margin:11px 0 8px; }' +
      '#__adj_panel .__ap_btns button { flex:1; background:#243056; color:#dce6ff; ' +
      'border:1px solid #3a4a78; border-radius:7px; padding:6px 0; cursor:pointer; font-size:12px; }' +
      '#__adj_panel .__ap_btns button.p { background:#3f6fd6; border-color:#5a86e8; }' +
      '#__adj_panel pre { margin:0 0 8px; max-height:118px; overflow:auto; ' +
      'background:#0b1126; border-radius:7px; padding:8px; font:11px/1.5 Consolas,monospace; ' +
      'color:#a9d8ff; white-space:pre-wrap; }' +
      '#__adj_panel .__ap_tip { font-size:11px; color:#7f90b8; }';
    document.head.appendChild(st);
  }

  sync();
})();
