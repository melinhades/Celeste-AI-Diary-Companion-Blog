# Badeline 动作树系统 — 实施方案

## Context

镜之房间里的 Badeline 现在只是 9 帧 `idle00-08.png` 在镜前原地循环（`shelf.html` L1749-1763），无任何游荡/动作多样性。素材目录新增了 5 套完整动作 gif，本次改造目标：把 Badeline 升级为镜之房间内**自由游荡的动作树 NPC**，并补齐点击本人 → 对话的交互。

用户已澄清的关键决策：

* 5 套动作 = `lookingUp.gif` / `sleep.gif` / `pretendDead.gif`（=roll）/ `rollGetUp.gif`（=rollgetup）/ `spin.gif`

* 删 `idle00-08.png` + `walk00-11.png`

* 进房间时**随机**两种形态：① 还在镜子里（保留敲镜子召唤）② 已经破镜出来在游荡

* 游荡范围 = 镜之房间内**全屏**（含上下漂移）

* 点击 Badeline 本人触发对话（同 Madeline 架构，复用现有 `#badelineDialog` + `blSpeak` 演出链）

## 资源映射

| 状态名         | 文件              | 语义        | 移动               | 持续时长     | 优先级    |
| ----------- | --------------- | --------- | ---------------- | -------- | ------ |
| `lookUp`    | lookingUp.gif   | 抬头环顾/思考   | 否                | 2-4s     | 中      |
| `sleep`     | sleep.gif       | 睡觉        | 否                | 3-6s     | 低      |
| `roll`      | pretendDead.gif | 侧躺装死/打滚   | 否                | 2-4s     | 低      |
| `rollGetUp` | rollGetUp.gif   | 翻滚起身（一次性） | 是（短位移 200-400px） | 0.8-1.2s | 高（必走完） |
| `spin`      | spin.gif        | 旋转移动      | 是（长位移到随机目标点）     | 1.5-2.5s | 中      |

## 动作树状态转移

* 起始：`lookUp`

* `lookUp` → 60% `spin` / 20% `sleep` / 20% `roll`

* `spin` → 50% `lookUp` / 30% `roll` / 20% `sleep`

* `roll` → **100%** **`rollGetUp`**（侧躺后必起身）

* `rollGetUp` → 70% `lookUp` / 30% `spin`

* `sleep` → 50% `lookUp` / 30% `spin` / 20% `roll`

**优先级**：对话中断 > rollGetUp 一次性走完 > 普通随机切换

**朝向**：`spin` 移动时按目标点相对当前位置的 dx 决定 `scaleX(1)` 或 `scaleX(-1)`；`lookUp` 时随机选一个朝向停留；其他状态保持上次朝向。

## 全屏游荡定位策略

`#world` 有 `transform:translateX(-50%)`（panned 态），fixed 定位会被 transform 祖先污染。最干净方案：**DOM 移动**——自由游荡模式启动时把 `.badeline-wrap` 从 `#shelfMirror` 子级移到 `#mirrorRoom` 直接子级，定位上下文变为 `#mirrorRoom`（`position:relative`）。

* `#mirrorRoom` 全屏 50vw × 100vh，Badeline 用 `left: X%` `top: Y%` 定位（X ∈ \[8%, 92%]，Y ∈ \[18%, 78%]）

* 移动用 `transition: left 1.5s ease, top 1.5s ease, transform .3s ease` 平滑过渡

* 离开镜之房间或回到模式 A（在镜子里）时，DOM 移回 `#shelfMirror`，复位 `left/top/transform` 内联样式

## 召唤/游荡并存

进镜之房间时（room-back 切换或心门开启后）`Math.random()`：

* **模式 A（50%）**：`.badeline-wrap` 留在 `#shelfMirror` 内，保留现有 `idle00-08` 帧循环不动——等等，idle 要删。改用 `lookingUp.gif` 当待机帧。镜子可点击 → 现有召唤流程 `summon()` → `badelineRise` CSS 动画出来 → 出来后 JS 把 `.badeline-wrap` 移到 `#mirrorRoom` 子级，启动动作树

* **模式 B（50%）**：`.badeline-wrap` 直接 DOM 移到 `#mirrorRoom` 子级，初始 opacity:0 淡入到随机位置，立即启动动作树从 `lookUp` 起。镜子点击无效（弹一句"她不在镜子里"）

## 点击交互（复用现有对话框链）

将 click 监听从 `#shelfMirror` 改造为同时支持：

* 模式 A 时点 `#shelfMirror` → 触发召唤（保留）

* 任何时候点 `#badelineImg` → 暂停动作树 + 切到 `lookUp` 朝向玩家 + 调用现有 `openChat()` → 触发 `blSpeak` 演出链

* `closeChat()` 和 `blDialogClose()` 内调用 `window.__badelineResume()` 恢复游荡

`.badeline-wrap` 的 `pointer-events` 从 `none` 改为 `auto`，让子元素 `#badelineImg` 可点。

## 实施步骤

### 1. 资源清理

* 删除 `blog-ui/celeste-player/badeline/idle00.png` \~ `idle08.png`（9 个）

* 删除 `blog-ui/celeste-player/badeline/walk00.png` \~ `walk11.png`（12 个）

* 保留 5 个 gif 不变

### 2. CSS 改动（shelf.html）

* `.badeline-wrap`：`pointer-events:none` → `auto`

* 新增 `.badeline-wrap.free` 类（自由游荡态）：`position:absolute; transition: left 1.5s ease, top 1.5s ease, transform .3s ease;`（注意 `position:absolute` 相对新的父级 `#mirrorRoom`）

* 现有 `#shelfMirror.summoned .badeline-wrap` 的 `badelineRise` 动画保留（模式 A 用），但 `.summoned` 后需 JS 把 wrap 移出

* `#badelineImg` 默认 src 在 HTML 里从 `idle00.png` 改为 `lookingUp.gif`

### 3. HTML 改动（shelf.html L886 / L897）

* `#badelineImg` 的 `src="celeste-player/badeline/idle00.png"` → `lookingUp.gif`

* `#blHeadImg` 的 `src="celeste-player/badeline/idle00.png"` → `lookingUp.gif`

### 4. JS 改动（shelf.html）

**删除**：L1749-1763 的 `B_FRAMES` idle 帧循环 setInterval + `badelineImg.load` 设宽高逻辑（gif 自带尺寸，无需 ×6 放大，CSS `image-rendering:pixelated` + width 控制即可）

**保留并改造**：现有镜子 IIFE L1681-1731 的图层叠加逻辑保留；召唤流程 `summon()` L2077+ 内部加调用 `window.__badelineStartFreeRoam()` 启动游荡

**新增独立 IIFE**（放在镜子 IIFE 之后，约 150 行）：

```js
// ===== Badeline 动作树：镜之房间内自由游荡 =====
(function () {
    var room = document.getElementById('mirrorRoom');
    var mirror = document.getElementById('shelfMirror');
    var wrap = mirror.querySelector('.badeline-wrap');
    var img = document.getElementById('badelineImg');
    if (!room || !wrap || !img) return;

    var DIR = 'celeste-player/badeline/';
    // 5 套动作定义
    var ACTIONS = {
        lookUp:    { gif: 'lookingUp.gif',   move: false, dur: [2000, 4000] },
        sleep:     { gif: 'sleep.gif',       move: false, dur: [3000, 6000] },
        roll:      { gif: 'pretendDead.gif', move: false, dur: [2000, 4000] },
        rollGetUp: { gif: 'rollGetUp.gif',   move: true,  dur: [800, 1200], once: true },
        spin:      { gif: 'spin.gif',        move: true,  dur: [1500, 2500] }
    };
    // 状态转移概率表（见上方设计）
    var TRANS = {
        lookUp:    [['spin', .6], ['sleep', .2], ['roll', .2]],
        sleep:     [['lookUp', .5], ['spin', .3], ['roll', .2]],
        roll:      [['rollGetUp', 1]],
        rollGetUp: [['lookUp', .7], ['spin', .3]],
        spin:      [['lookUp', .5], ['roll', .3], ['sleep', .2]]
    };

    var cur = 'lookUp', face = 1, x = 50, y = 50;
    var timer = null, roaming = false, paused = false, inDialog = false;

    // 5 gif 预加载
    Object.keys(ACTIONS).forEach(function (k) { var im = new Image(); im.src = DIR + ACTIONS[k].gif; });

    function place(nx, ny, fx) {
        x = nx; y = ny; face = fx;
        wrap.style.left = x + '%';
        wrap.style.top = y + '%';
        wrap.style.transform = 'translate(-50%, -50%) scaleX(' + face + ')';
    }
    function setState(name) {
        cur = name;
        var a = ACTIONS[name];
        img.src = DIR + a.gif;
        if (a.move) {
            // 选目标点（spin 远 / rollGetUp 近）
            var range = name === 'spin' ? { x: 80, y: 60 } : { x: 25, y: 15 };
            var nx = Math.max(8, Math.min(92, x + (Math.random() * 2 - 1) * range.x));
            var ny = Math.max(18, Math.min(78, y + (Math.random() * 2 - 1) * range.y));
            var dx = nx - x;
            place(nx, ny, dx < 0 ? -1 : 1);
        } else if (name === 'lookUp') {
            // 原地随机翻转朝向
            wrap.style.transform = 'translate(-50%, -50%) scaleX(' + (Math.random() < .5 ? -1 : 1) + ')';
        }
        var d = a.dur[0] + Math.random() * (a.dur[1] - a.dur[0]);
        clearTimeout(timer);
        timer = setTimeout(next, d);
    }
    function next() {
        if (paused || inDialog || !roaming) return;
        var opts = TRANS[cur] || TRANS.lookUp;
        var r = Math.random(), acc = 0;
        for (var i = 0; i < opts.length; i++) {
            acc += opts[i][1];
            if (r < acc) return setState(opts[i][0]);
        }
        setState(opts[0][0]);
    }

    // ===== 自由游荡模式启动（DOM 移到 #mirrorRoom）=====
    function startFreeRoam(initialX, initialY, withFade) {
        if (roaming) return;
        room.appendChild(wrap);               // DOM 移出 #shelfMirror
        wrap.classList.add('free');
        wrap.style.left = initialX + '%';
        wrap.style.top = initialY + '%';
        wrap.style.transform = 'translate(-50%, -50%)';
        if (withFade) {
            wrap.style.opacity = '0';
            requestAnimationFrame(function () {
                wrap.style.transition = 'opacity .8s ease, left 1.5s ease, top 1.5s ease, transform .3s ease';
                wrap.style.opacity = '1';
            });
        }
        x = initialX; y = initialY;
        roaming = true; paused = false; inDialog = false;
        setState('lookUp');
    }
    function stopFreeRoam() {
        roaming = false; paused = false; inDialog = false;
        clearTimeout(timer);
        wrap.classList.remove('free');
        wrap.style.opacity = '';
        wrap.style.transition = '';
        wrap.style.left = ''; wrap.style.top = ''; wrap.style.transform = '';
        mirror.appendChild(wrap);            // DOM 移回 #shelfMirror
    }

    // ===== 对话暂停/恢复钩子 =====
    window.__badelinePauseForDialog = function () {
        if (!roaming) return;
        inDialog = true; clearTimeout(timer);
        // 切到 lookUp 朝向玩家（朝向中央玩家方向）
        var faceForPlayer = x < 50 ? 1 : -1;
        wrap.style.transform = 'translate(-50%, -50%) scaleX(' + faceForPlayer + ')';
        img.src = DIR + ACTIONS.lookUp.gif;
    };
    window.__badelineResumeAfterDialog = function () {
        if (!roaming) return;
        inDialog = false;
        setState('lookUp');  // 对话结束 → 从 lookUp 重新起步
    };
    window.__badelineStartFreeRoam = startFreeRoam;

    // ===== 进镜之房间时随机选模式 =====
    window.__badelineEnterRoom = function () {
        var modeA = Math.random() < .5;
        if (modeA) {
            // 模式 A：留在镜子里（用 lookingUp.gif 当待机帧），等召唤
            stopFreeRoam();  // 确保复位
            img.src = DIR + ACTIONS.lookUp.gif;
        } else {
            // 模式 B：直接破镜出来游荡
            var ix = 20 + Math.random() * 60;
            var iy = 30 + Math.random() * 35;
            startFreeRoam(ix, iy, true);
        }
    };
    window.__badelineLeaveRoom = stopFreeRoam;

    // ===== 点击 Badeline 本人 → 对话 =====
    img.addEventListener('click', function (e) {
        if (inDialog) return;
        e.stopPropagation();
        // 模式 A 且未召唤时：不响应（点镜子才召唤）
        if (!roaming && !mirror.classList.contains('summoned')) return;
        // 触发现有 openChat 流程（外部定义）
        if (typeof openChat === 'function') openChat();
        window.__badelinePauseForDialog();
    });
})();
```

**改造现有召唤流程**：`summon()` L2077+ 函数末尾（召唤动画完后）加：

```js
setTimeout(function () {
    if (window.__badelineStartFreeRoam) {
        window.__badelineStartFreeRoam(50, 50, false);
    }
}, 900);  // badelineRise 动画 0.9s 走完
```

**改造** **`closeChat()`** **L2035**：内部加 `window.__badelineResumeAfterDialog && window.__badelineResumeAfterDialog()`（在 `byeSheLeaves()` 之前，或 `byeSheLeaves` 内 stopFreeRoam）

**改造** **`byeSheLeaves()`** **L2044**：内部加 `window.__badelineLeaveRoom && window.__badelineLeaveRoom()` 让 DOM 复位

**进/出镜之房间钩子**：在 `world.classList.add('panned')` L2776 之前调 `__badelineEnterRoom()`；`world.classList.remove('panned')` L2781 之前调 `__badelineLeaveRoom()`

### 5. 性能与质量保证

* 5 个 gif 进房间时一次性预加载，切换无网络延迟

* 动作切换 = 单行 `img.src =`，< 5ms

* 位置移动 = CSS transition GPU 加速，无 JS 帧

* 点击响应 = `img.click` → `openChat()`，< 50ms

* gif 自带尺寸，`#badelineImg` CSS 用 `width: clamp(60px, 12vw, 120px); height: auto; image-rendering: pixelated` 统一规格（避免不同 gif 尺寸不一造成的跳动）—— 需在 CSS 里加 `#badelineImg { width: clamp(60px, 12vw, 120px); height: auto; }`

* 离开镜之房间清理 timer + DOM 复位，无残留 setInterval

## 关键文件

* [blog-ui/shelf.html](file:///c:/Users/28464/IdeaProjects/blog/blog-ui/shelf.html) — 主改动文件

  * CSS：L196-219 `.badeline-wrap` / `.badeline-inner` / `#badelineImg` 块

  * HTML：L886 `#badelineImg` src、L897 `#blHeadImg` src

  * JS：L1681-1731 镜子图层叠加 IIFE（保留）、L1749-1763 idle 帧循环（删）、L2077-2088 `summon()`（加钩子）、L2035 `closeChat()` / L2044 `byeSheLeaves()`（加钩子）、L2776/L2781 `panned` 切换（加钩子）、新增动作树 IIFE

* `blog-ui/celeste-player/badeline/` — 删 21 个 png（idle00-08 + walk00-11），留 5 个 gif

## 验证步骤

1. 浏览器打开 `shelf.html`，登录后通过心门进入镜之房间
2. 多次进入/退出，验证模式 A/B 随机出现：

   * 模式 A：Badeline 在镜子前 lookingUp，敲镜子 → 召唤动画 → 出来后开始游荡

   * 模式 B：进房间时 Badeline 已在随机位置淡入游荡
3. 观察动作树：5 个状态都会出现，`roll` 后必走 `rollGetUp`，`spin` 时位移+朝向正确
4. 点击游荡中的 Badeline → 动作暂停 + 切 lookUp 朝向玩家 + 对话框弹出 + 逐字演出
5. 对话结束（点对话框关闭或 6s 自动收）→ 恢复游荡
6. 离开镜之房间再回来 → 状态正确重置（无残留 setInterval、DOM 复位）
7. 性能：动作切换肉眼无卡顿（gif 自动播放），点击响应无明显延迟
8. DevTools Console 无报错

