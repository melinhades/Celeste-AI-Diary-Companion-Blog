// ================================================================
// ===== Celeste 人物操作引擎（逐行对齐反编译 Player.cs / PlayerSprite）=====
// 依赖：celeste-hair.js（window.CelesteHair）
// 用法：
//   const ch = await CelesteCharacter.create({
//       base: 'Atlases/Gameplay/characters/player',
//       color: CelesteHair.MADELINE, x: -60, y: 0
//   });
//   每帧：ch.update(dt, { left, right, down, up, jumpHeld, jumpPressed,
//                         grabHeld, grabPressed, dashPressed });
//        ch.draw(ctx, toScreen, zoom);
// 说明：模拟全部在"游戏单位"空间（1 单位 = 原作 1 像素，y 向下）。
//       完整实现 StNormal(0) / StClimb(1) / StDash(2) 三状态机。
//       wallSlide 墙滑、wallJump 墙跳、climbHop 攀爬弹跳、climbJump 爬墙跳。
// ================================================================
(function () {
    // ===== 物理常数（Player.cs 常量区逐字复制）=====
    const MAX_RUN = 90;
    const RUN_ACCEL = 1000;
    const RUN_REDUCE = 400;
    const AIR_MULT = 0.65;
    const DUCK_FRICTION = 500;
    const MAX_FALL = 160;
    const FAST_MAX_FALL = 240;
    const FAST_MAX_ACCEL = 300;
    const GRAVITY = 900;
    const HALF_GRAV_THRESHOLD = 40;
    const JUMP_SPEED = -105;
    const JUMP_HBOOST = 40;
    const VAR_JUMP_TIME = 0.2;
    const JUMP_GRACE_TIME = 0.1;
    const JUMP_BUFFER_TIME = 0.08;

    // Wall slide / Wall jump
    const WALL_SLIDE_START_MAX = 20;
    const WALL_SLIDE_TIME = 1.2;
    const WALL_JUMP_HSPEED = MAX_RUN + JUMP_HBOOST;       // 130
    const WALL_JUMP_FORCE_TIME = 0.16;
    const WALL_SPEED_RETENTION_TIME = 0.06;

    // Climb（攀爬）
    const CLIMB_MAX_STAMINA = 110;
    const CLIMB_UP_COST = 100 / 2.2;                       // 45.4545
    const CLIMB_STILL_COST = 100 / 10;                     // 10
    const CLIMB_JUMP_COST = 110 / 4;                       // 27.5
    const CLIMB_NO_MOVE_TIME = 0.1;
    const CLIMB_TIRED_THRESHOLD = 20;
    const CLIMB_UP_SPEED = -45;
    const CLIMB_DOWN_SPEED = 80;
    const CLIMB_SLIP_SPEED = 30;
    const CLIMB_ACCEL = 900;
    const CLIMB_GRAB_Y_MULT = 0.2;
    const CLIMB_HOP_Y = -120;
    const CLIMB_HOP_X = 100;
    const CLIMB_HOP_FORCE_TIME = 0.2;
    const CLIMB_JUMP_BOOST_TIME = 0.2;
    const CLIMB_HOP_NO_WIND_TIME = 0.3;

    // Dash
    const DASH_SPEED = 240;
    const END_DASH_SPEED = 160;
    const END_DASH_UP_MULT = 0.75;
    const DASH_TIME = 0.15;
    const DASH_COOLDOWN = 0.2;
    const DASH_REFILL_COOLDOWN = 0.1;
    const DASH_ATTACK_TIME = 0.3;
    const DODGE_SLIDE_SPEED_MULT = 1.2;       // 原作 DodgeSlideSpeedMult：ultradash/wavedash
    const SUPER_WALL_JUMP_SPEED = -160;        // 原作 SuperWallJumpSpeed：墙反弹垂直
    const SUPER_WALL_JUMP_VAR_TIME = 0.25;     // SuperWallJumpVarTime
    const SUPER_WALL_JUMP_H = MAX_RUN + JUMP_HBOOST * 2; // 170
    const SUPER_JUMP_SPEED = JUMP_SPEED;       // SuperJumpSpeed = JumpSpeed
    const SUPER_JUMP_H = 260;                  // SuperJumpH
    const DUCK_SUPER_JUMP_X_MULT = 1.25;       // DuckSuperJumpXMult → 325
    const DUCK_SUPER_JUMP_Y_MULT = 0.5;        // DuckSuperJumpYMult → -52.5
    const DASH_CORNER_CORRECTION = 4;          // DashCornerCorrection
    const DASH_V_FLOOR_SNAP_DIST = 3;          // DashVFloorSnapDist
    const UPWARD_CORNER_CORRECTION = 4;        // UpwardCornerCorrection
    const BODY_HALF_W = 4;                     // Hitbox 8×11 → 半宽 4
    const BODY_H = 11;                         // Hitbox 8×11 → 脚底到头顶 11
    const CLIMB_DANGLE_PROBE = 6;              // Position + UnitX*Facing*6 → dangling 判定
    const UPWARD_CORRECTION_VARJUMP = 0.15;    // 撞头后 varJumpTimer < .15 → 0
    const WALL_JUMP_CHECK_DIST = 3;            // WallJumpCheckDist
    const HAIR_FLASH_TIME = 0.12;              // 闪白时长
    const FREEZE_TIME = 0.05;                  // Celeste.Freeze(.05f) → 3 帧

    // Boost / RedDash（Player.cs 第 3788–3927 行 + 安装版 IL 核对）
    const BOOST_MOVE_SPEED = 80;               // BoostMoveSpeed：BoostUpdate 逼近目标的速度
    const BOOST_TIME = 0.25;                   // BoostTime：BoostCoroutine 停驻时长，到点自动进入 Dash/RedDash
    const BOOST_AIM_OFFSET = 3;                // Input.Aim.Value * 3
    const DASH_H_JUMPTHRU_NUDGE = 6;           // DashHJumpThruNudge：红冲水平吸附
    // Launch（Player.cs 第 3982–4079 行 + 安装版 IL 核对）
    const LAUNCH_SPEED = 280;                  // LaunchSpeed
    const LAUNCH_CANCEL_THRESHOLD = 220;       // LaunchCancelThreshold
    const LAUNCH_SNAP_UP_DOT = -0.7;           // 安装版：snapUp 且 dot <= -0.7 → 纯上
    const LAUNCH_SIDE_LO = -0.55;              // 安装版：水平吸附区间 [-0.55, 0.65]
    const LAUNCH_SIDE_HI = 0.65;
    const LAUNCH_UP_CAP = 50;                  // Speed.Y <= 50 → 抬升加成
    const LAUNCH_UP_MIN = -150;                // min(-150, Speed.Y)
    const LAUNCH_BOOST_MULT = 1.2;             // 安装版：同向输入的水平加速
    const LAUNCH_BOOST_DELAY = 0.01;           // 安装版：反向/无输入时的延迟补速
    const LAUNCH_APPROACH_X_SPEED = 60;        // LaunchUpdate: MoveTowardsX(..., 60*dt)
    const LAUNCH_FREEZE = 0.1;                 // Celeste.Freeze(.1f)
    // HitSquash（Player.cs 第 3933–3974 行）
    const HIT_SQUASH_NO_MOVE_TIME = 0.1;       // HitSquashNoMoveTime
    const HIT_SQUASH_FRICTION = 800;           // HitSquashFriction

    // DreamDash（Player.cs 的 DreamDashBegin / DreamDashEnd / DreamDashUpdate + DreamDashCheck）
    const DREAM_DASH_SPEED = 240;              // DreamDashBegin: Speed = DashDir * 240
    const DREAM_DASH_MIN_TIME = 0.1;           // dreamDashCanEndTimer = 0.1f
    const DREAM_DASH_STAMINA = 110;            // DreamDashBegin: Stamina = 110f
    const DREAM_DASH_WALL_NUDGE = 5;           // 出口贴墙：MoveHExact(±5)
    const DREAM_DASH_TRAIL_INTERVAL = 0.1;     // StDreamDash 内 OnInterval(.1f) CreateTrail

    // 冲刺残影（纯表现层，不参与物理）
    const DASH_TRAIL_TIME = 0.22;              // 单枚残影存活时长
    const DASH_TRAIL_MAX = 10;                 // 同屏最多残影数
    // 原作 Celeste.Player.GetCurrentTrailColor："Get the current player dash trail color."
    // 即残影按当前 trail 颜色着色（本地 Celeste.xml L7017-7021 有据）。
    // 顺序与 celeste-hair.js 的 HAIR_COLORS 一致：normal/used/flash/two/fly
    const TRAIL_COLORS = ['#AC3232', '#44B7FF', '#FFFFFF', '#FF6DEF', '#F2EB6D'];
    const trailCache = new WeakMap();
    // 把人物当前帧染成 trail 色，作为残影贴图（结果缓存，每色一份）
    function trailTexture(img, colorIdx) {
        if (typeof document === 'undefined' || !img) return img || null;
        let byColor = trailCache.get(img);
        if (!byColor) { byColor = {}; trailCache.set(img, byColor); }
        if (byColor[colorIdx]) return byColor[colorIdx];
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        g.globalCompositeOperation = 'multiply';
        g.fillStyle = TRAIL_COLORS[colorIdx] || TRAIL_COLORS[0];
        g.fillRect(0, 0, c.width, c.height);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(img, 0, 0);
        byColor[colorIdx] = c;
        return c;
    }

    // ===== 原作 Celeste.Player 状态（D14）=====
    // 依据：REA 从本地 Celeste.dll 取出的 #US 字面量顺序 + 13 处独立 IL 常量命中
    //      （研究文档 celeste-dash-反编译研究.md 第 15 章，双重证据）。
    const ST = {
        Normal: 0, Climb: 1, Dash: 2, Swim: 3, Boost: 4, RedDash: 5,
        HitSquash: 6, Launch: 7, Pickup: 8, DreamDash: 9, SummitLaunch: 10,
        Dummy: 11, IntroWalk: 12, IntroJump: 13, IntroRespawn: 14, IntroWakeUp: 15,
        BirdDashTutorial: 16, Frozen: 17, ReflectionFall: 18, StarFly: 19,
        TempleFall: 20, CassetteFly: 21, Attract: 22, IntroMoonJump: 23,
        FlingBird: 24, IntroThinkForABit: 25
    };
    // 状态号 → 名字（整数键按数值升序枚举，下标即状态号）
    const STATE_NAMES = Object.keys(ST);
    // 本引擎已实现的状态；其余为 Swim/关卡剧情态，见研究文档第 18 章 D24–D27 的不移植判定
    const ST_NORMAL = ST.Normal, ST_CLIMB = ST.Climb, ST_DASH = ST.Dash;
    const ST_BOOST = ST.Boost, ST_RED_DASH = ST.RedDash;
    const ST_HIT_SQUASH = ST.HitSquash, ST_LAUNCH = ST.Launch;
    const ST_DREAM_DASH = ST.DreamDash;

    const SCALE_RECOVER = 1.75;

    function approach(v, target, step) {
        return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
    }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function range(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }
    function parseHair(s) {
        return s.split('|').map(e => {
            const [xy, bang] = e.split(':');
            const [x, y] = xy.split(',').map(Number);
            return { x, y, bang: bang === undefined ? 0 : Number(bang) };
        });
    }
    function loadImage(src) {
        return new Promise(res => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = () => res(null);
            i.src = src;
        });
    }

    // ===== 动画表（Sprites.xml 逐字）=====
    const ANIMS = {
        idle:       { path: 'idle',       delay: 0.10, frames: range(0, 8),                  goto: 'idle' },
        idleA:      { path: 'idleA',      delay: 0.12, frames: range(0, 11),                 goto: 'idle' },
        idleB:      { path: 'idleB',      delay: 0.16, frames: range(0, 23),                 goto: 'idle' },
        idleC:      { path: 'idleC',      delay: 0.05, frames: range(0, 11),                 goto: 'idle' },
        lookUp:     { path: 'lookUp',     delay: 0.10, frames: range(2, 7),                  goto: null },
        runSlow:    { path: 'runSlow',    delay: 0.07, frames: range(0, 11),                 goto: 'runFast' },
        runFast:    { path: 'runFast',    delay: 0.05, frames: range(0, 11), loop: true },
        jumpSlow:   { path: 'jumpSlow',   delay: 0.10, frames: [0, 1],      loop: true },
        jumpFast:   { path: 'jumpFast',   delay: 0.10, frames: [0, 1],      loop: true },
        fallSlow:   { path: 'jumpSlow',   delay: 0.10, frames: [2, 3],      goto: null },
        fallFast:   { path: 'jumpFast',   delay: 0.10, frames: [2, 3],      goto: null },
        duck:       { path: 'duck',       delay: 0,    frames: [0],         loop: true },
        // 冲刺 / 蹲滑 / 力竭：逐字取自 Sprites.xml
        //   <Loop id="dash"  path="dash"  delay="0.09" />   全帧 0-3
        //   <Loop id="slide" path="slide" delay="0.03" />   全帧 0-2
        //   <Loop id="tired" path="tired" delay="0.18" />   全帧 0-3
        dash:       { path: 'dash',       delay: 0.09, frames: range(0, 3),  loop: true },
        slide:      { path: 'slide',      delay: 0.03, frames: range(0, 2),  loop: true },
        tired:      { path: 'tired',      delay: 0.18, frames: range(0, 3),  loop: true },
        // 地面姿态（orig_UpdateSprite 的 State 0 分支）：推墙 / 站在边沿 / 背对边沿
        //   <Loop id="push"     path="push"      delay="0.1" />   全帧 0-15
        //   <Loop id="edge"     path="edge"      delay="0.25" frames="0-13" />
        //   <Loop id="edgeBack" path="edge_back" delay="0.25" />  全帧 0-13
        push:       { path: 'push',       delay: 0.10, frames: range(0, 15), loop: true },
        edge:       { path: 'edge',       delay: 0.25, frames: range(0, 13), loop: true },
        edgeBack:   { path: 'edge_back',  delay: 0.25, frames: range(0, 13), loop: true },
        // 攀爬两套动画逐字取自本地 Sprites.xml（Content\Graphics\Sprites.xml L38、L41）：
        //   <Loop id="wallslide" path="climb" frames="0" />
        //   <Loop id="climbup"  path="climb" delay="0.04" frames="0-5" />
        // 只加载 0-8 帧，与原作 climb 的 hair 元数据条目数（9 条）一致；
        // 帧 9-14 属于 climbPush(0,9-11) / climbPull(0,12-14)，是上翻瞬间的姿势，不平移时不该播。
        climbup:    { path: 'climb',      delay: 0.04, frames: range(0, 5),  loop: true },
        wallslide:  { path: 'climb',      delay: 0,    frames: [0],         loop: true },
        // State 1（Climb）的另外三种姿态，逐字取自 Sprites.xml：
        //   <Loop id="dangling" path="dangling" delay="0.11" frames="0-9" />      面前 6px 没墙 = 悬挂
        //   <Anim id="climbLookBackStart" path="climb" delay="0.08" frames="6,7,8" goto="climbLookBack" />
        //   <Loop id="climbLookBack" path="climb" frames="8" />                   回头（远离墙的方向）
        dangling:   { path: 'dangling',   delay: 0.11, frames: range(0, 9),  loop: true },
        climbLookBackStart: { path: 'climb', delay: 0.08, frames: [6, 7, 8], goto: 'climbLookBack' },
        climbLookBack:      { path: 'climb', frames: [8], loop: true },
        flip:       { path: 'flip',       delay: 0.04, frames: range(0, 7),                  goto: 'runFast' },
        skid:       { path: 'flip',       delay: 0.04, frames: [8],         loop: true },
        runStumble: { path: 'runStumble', delay: 0.05, frames: [10, 11].concat(range(0, 11)), goto: 'runFast' },
        // DreamDash（Sprites.xml L28-30 逐字）：
        //   <Anim id="dreamDashIn" path="dreamDash" delay="0.04" frames="0-3" goto="dreamDashLoop" />
        //   <Loop id="dreamDashLoop" path="dreamDash" delay="0.03" frames="4-16" />
        //   <Anim id="dreamDashOut" path="dreamDash" delay="0.04" frames="17-20" />
        // dreamDashOut 在 Sprites.xml 里定义，但本次取证的 PlayerSprite.Update 未找到播放入口 → 记 gap
        dreamDashIn:   { path: 'dreamDash', delay: 0.04, frames: range(0, 3),   goto: 'dreamDashLoop' },
        dreamDashLoop: { path: 'dreamDash', delay: 0.03, frames: range(4, 16),  loop: true },
        dreamDashOut:  { path: 'dreamDash', delay: 0.04, frames: range(17, 20), goto: null }
    };

    const HAIR = {
        idle:   parseHair('0,-2|0,-2|0,-2|0,-2|0,-1|0,-1|0,-1|0,-1|0,-1'),
        idleA:  parseHair('0,-2|-1,-2:1|-1,-2:2|-1,-2:2|-1,-2:2|-1,-1:2|-1,-1:2|-1,-1:2|-1,-1:1|-1,-1:1|-1,-1|0,-1|0,-1'),
        idleB:  parseHair('0,-2|-1,-2|-1,-2|-1,-2|-1,-2|-1,-2|-1,-2|-1,-2|-1,-2:1|-1,-2:2|-1,-2:2|-1,-2:2|-1,-2:2|-1,-2:1|-1,-2|-1,-2|-1,-2|0,-2|0,-2|0,-1|0,-1|0,-1|0,-1|0,-1'),
        idleC:  parseHair('0,-2|-1,-2|-2,-2|-2,-2|-2,-2|-2,-2|1,-1|2,0|0,0|-1,-1|0,-1|0,-1'),
        lookUp: parseHair('0,-2|0,-2|0,-2|0,-2|-1,-2:1|-1,-2:1|-1,-2:1|-1,-2:1|-1,-3:1'),
        runSlow: parseHair('1,-2|1,-1|1,-1|1,-1|1,-3|1,-2|1,-1|1,-1|1,-1|1,-1|1,-3|1,-2'),
        runFast: parseHair('1,-2|1,-1|1,-1|1,-1|1,-3|1,-2|1,-1|1,-1|1,-1|1,-1|1,-3|1,-2'),
        jumpSlow: parseHair('1,-3|1,-3|1,-2|0,-2'),
        jumpFast: parseHair('1,-3|1,-3|1,-2|0,-2'),
        duck:   parseHair('0,3'),
        // 以下五条逐字复制 Sprites.xml 的 <Metadata><Frames path="…" hair="…">
        dash:   parseHair('2,0|2,0|2,0|2,1'),
        slide:  parseHair('0,3|0,3|0,3'),
        tired:  parseHair('0,1|0,2|0,1|0,0'),
        push:   parseHair('1,-2|1,-1|1,-1|1,-1|1,-2|1,-2|1,-2|1,-2|1,-1|1,-1|1,-1|1,-1|1,-2|1,-2|1,-2|1,-2'),
        edge:   parseHair('-1,-2|-1,-2|-1,-2|-1,-1|-1,-1|-1,-1|-1,-2|0,-2|1,-2|0,-2|0,-1|-1,-1|-1,-1|-1,-2'),
        edge_back: parseHair('1,-2:1|1,-2:2|0,-2:2|0,-1:2|-1,-2:2|0,-2:2|1,-2:2|1,-2:2|1,-2:2|1,-2:2|2,-1|2,-1|2,-1|2,-2'),
        dangling: parseHair('0,-2|0,-2|0,-2|0,-2|-1,-2|-1,-2|-1,-2|-1,-2|-1,-2|-1,-2'),
        // 逐字复制本地 Sprites.xml L116：<Frames path="climb" hair="0,-2|0,-2|0,-2|0,-2|-1,-2|-1,-2|0,-1|1,-2:1|2,-2:2"/>
        // 只有 9 条（帧 0-8）；原作帧 9-14（climbPush / climbPull）没有 hair 元数据，本引擎也不加载它们。
        climb:  parseHair('0,-2|0,-2|0,-2|0,-2|-1,-2|-1,-2|0,-1|1,-2:1|2,-2:2'),
        flip:   parseHair('-1,-1:2|-1,-1:1|0,-1:1|1,-1:0|1,-1:0|1,0:0|2,0:0|2,0:0|2,0:0'),
        runStumble: parseHair('1,1|1,2|1,2|1,0|1,-2|1,-2|1,-1|1,-1|1,-1|1,-1|1,-3|1,-2'),
        // 逐字复制本地 Sprites.xml L111：<Frames path="dreamDash" hair="…"/>（21 条 = 帧 0-20）
        dreamDash: parseHair('2,0|1,0|0,0|0,0|1,1|2,1|2,1|2,0|1,0|1,0|1,0|1,0|1,0|1,0|1,0|1,0|1,0|0,0|1,0|1,0|2,1')
    };

    class Sprite {
        constructor(textures, opts) {
            this.textures = textures;
            this.fidgets = !opts || opts.fidgets !== false;
            this.idleTimerRef = null;
            this.current = 'idle';
            this.last = 'idle';
            this.anim = ANIMS.idle;
            this.frameIdx = 0;
            this.timer = 0;
            this.animating = this.anim.delay > 0;
            const self = this;
            this.onLastFrame = function (id) {
                if (id === 'idle' && self.fidgets && self.idleTimerRef() > 3 && Math.random() < 0.2) {
                    const r = Math.random() * 9;
                    self.play(r < 5 ? 'idleA' : (r < 8 ? 'idleB' : 'idleC'));
                }
            };
        }
        play(id) {
            if (this.current === id) return;
            this.current = id;
            this.last = id;
            this.anim = ANIMS[id];
            this.frameIdx = 0;
            this.timer = 0;
            this.animating = this.anim.delay > 0;
        }
        get running() { return this.last === 'flip' || this.last.startsWith('run'); }
        frameFileIndex() { return this.anim.frames[this.frameIdx]; }
        texture() {
            const arr = this.textures[this.anim.path];
            return arr ? arr[this.frameFileIndex()] : null;
        }
        hairMeta() {
            const t = HAIR[this.anim.path];
            if (!t || !t.length) return { x: 0, y: 0, bang: 0, hide: true };
            // 元数据条目比分帧少时沿到最后一条（climb 只有帧 0-8 有 hair，
            // 而 dangling 用到帧 9），否则会在帧尾突然秃头。
            const m = t[Math.min(this.frameFileIndex(), t.length - 1)];
            return m || { x: 0, y: 0, bang: 0, hide: true };
        }
        update(dt) {
            if (!this.animating) return;
            this.timer += dt;
            if (this.timer < this.anim.delay) return;
            this.timer -= this.anim.delay;
            this.frameIdx++;
            if (this.frameIdx >= this.anim.frames.length) {
                const id = this.current;
                this.onLastFrame(id);
                if (this.current !== id) return;
                if (this.anim.goto) {
                    this.current = this.anim.goto;
                    this.last = this.current;
                    this.anim = ANIMS[this.current];
                    this.frameIdx = 0;
                    this.animating = this.anim.delay > 0;
                } else if (this.anim.loop) {
                    this.frameIdx = 0;
                } else {
                    this.frameIdx = this.anim.frames.length - 1;
                    this.animating = false;
                    this.current = '';
                }
            }
        }
    }

    // ===== 人物 =====
    class Character {
        constructor(textures, hair, opts) {
            this.sprite = new Sprite(textures, opts);
            this.hair = hair;

            // 基础物理
            this.x = 0; this.y = 0;
            this.vx = 0; this.vy = 0;
            this.facing = 1;
            this.onGround = true;
            this.ducking = false;
            this.scaleX = 1; this.scaleY = 1;
            this.maxFall = MAX_FALL;
            this.varJumpTimer = 0; this.varJumpSpeed = 0;
            this.jumpGraceTimer = 0; this.jumpBufferTimer = 0;
            this.fastJump = false;
            this.idleTimer = 0;
            this.highestAirY = 0;
            this.hairHidden = false;

            // 状态机
            this.state = ST_NORMAL;

            // Climb 状态变量
            this.stamina = CLIMB_MAX_STAMINA;
            this.lastClimbMove = 0;        // -1=up, 0=still, +1=down
            this.climbNoMoveTimer = 0;
            this.climbWallDir = 0;          // -1=左墙, +1=右墙
            this.wasTired = false;

            // Dash 状态变量
            this.dashes = 1;
            this.maxDashes = 1;
            this.dashTime = 0;
            this.dashDir = { x: 1, y: 0 };
            this.dashCooldownTimer = 0;
            this.dashRefillCooldownTimer = 0;
            this.dashAttackTimer = 0;
            this.dashStartedOnGround = false;
            this.dashSpeedSet = false;                    // false = 协程 yield return null 那一帧
            this.freezeTimer = 0;                         // Celeste.Freeze 冻结
            this.lastAim = { x: 1, y: 0 };                // 原作 lastAim：冲刺方向来源
            this.beforeDashSpeed = { x: 0, y: 0 };        // 原作 beforeDashSpeed
            this.lastDashes = 1;                          // 原作 lastDashes：比较触发闪白
            this.hairFlashTimer = 0;                      // 原作 hairFlashTimer
            this.dashTrail = [];                          // 冲刺残影（表现层）
            this.autoJump = false;
            this.autoJumpTimer = 0;
            this.forceMoveX = 0;
            this.forceMoveXTimer = 0;
            this.wasDashB = false;                        // 原作 wasDashB：记录按下瞬间是否为 2 格
            this.hopWaitX = 0;                            // 原作 hopWaitX（NormalEnd 复位）

            // Boost / RedDash 状态变量（Player.cs 第 3788–3927 行）
            this.boostRed = false;                        // 原作 boostRed：0 绿球 / 1 红球
            this.boostTarget = { x: 0, y: 0 };            // 原作 boostTarget（= booster.Center；本引擎用脚底坐标）
            this.currentBooster = null;                   // 原作 CurrentBooster / lastBooster（记账用）
            this.boostTime = 0;                           // BoostCoroutine 的剩余停驻时间

            // Launch 状态变量（Player.cs 第 3980–4079 行）
            this.launched = false;                        // LaunchBegin
            this.launchApproachX = null;                  // 原作 float? launchApproachX
            this.explodeLaunchBoostTimer = 0;             // 安装版：反向输入的延迟补速计时
            this.explodeLaunchBoostSpeed = 0;

            // HitSquash 状态变量（Player.cs 第 3936 行）
            this.hitSquashNoMoveTimer = 0;

            // DreamDash 状态变量（Player.cs DreamDashBegin / DreamDashEnd / DreamDashUpdate）
            this.dreamBlock = null;                       // 原作 DreamBlock dreamBlock：正在穿越的方块
            this.dreamDashCanEndTimer = 0;                // dreamDashCanEndTimer：最短穿越时长
            this.dreamJump = false;                       // dreamJump：出口按跳 / 水平出口时置位
            this.dreamDashEnabled = false;                // 对应 Session.Inventory.DreamDash
            this.dreamBlockFn = null;                     // (x, feetY) => DreamBlock | null
            this.dreamTrailTimer = 0;                     // OnInterval(.1f) 的残影节流
            this.onDreamDashEnter = null;
            this.onDreamDashExit = null;
            this.onDreamDashDeath = null;

            // Wall slide / Wall jump
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.wallSlideDir = 0;
            this.wallSpeedRetentionTimer = 0;
            this.wallSpeedRetained = 0;
            this.wallBoostTimer = 0;
            this.wallBoostDir = 0;

            // Hair / 回调
            this.groundYFn = () => 0;
            this.wallAtFn = null;              // (x, feetY, dir) => wallX | null（宽容，用于爬墙检测）
            this.wallCollideFn = null;         // (x, feetY, dir) => wallX | null（严格，用于物理阻挡）
            this.ceilingFn = null;             // (x, feetY) => 头顶重叠的天花板底边 y | null
            this.bodySolidFn = null;           // (x, feetY) => 以该点为脚底的 8×11 身体盒是否与实心重叠
            this.dreamForeignFn = null;        // (x, feetY) => 同上，但只对「非 Solid 非 DreamBlock」实体（CollideCheck<Solid, DreamBlock> 排除语义）
            this.onLand = null;
            this._moveX = 0; this._moveY = 0;
            const self = this;
            this.sprite.idleTimerRef = () => self.idleTimer;
        }

        get anim() { return this.sprite.current || this.sprite.last; }

        setGround(fn) { this.groundYFn = fn; }
        setWallAt(fn) { this.wallAtFn = fn; }
        // setWallCollideFn(fn): fn(x, feetY, dir) 返回被撞墙面的 x，null = 没撞（严格物理阻挡）
        setWallCollideFn(fn) { this.wallCollideFn = fn; }
        // setCeiling(fn): fn(x, feetY) 返回「与头顶重叠的天花板底边 y」，null = 没碰到
        //   —— 对应原作 OnCollideV 的 Speed.Y < 0 分支（此前引擎完全没有头部碰撞）
        setCeiling(fn) { this.ceilingFn = fn; }
        // setBodySolid(fn): fn(x, feetY) 返回「脚底在 (x, feetY) 时，8×11 身体盒是否与实心重叠」
        //   —— 对应原作 CollideCheck<Solid>(Position + offset)，push / edge / dangling 全靠它
        setBodySolid(fn) { this.bodySolidFn = fn; }
        // setDreamForeignFn(fn): fn(x, feetY) 返回「8×11 身体盒是否与非实心/非梦境块的可碰撞实体重叠」
        //   —— 对应原作 CollideCheck<Solid, DreamBlock>（Monocle 双泛型排除语义）
        setDreamForeignFn(fn) { this.dreamForeignFn = fn; }
        // setDreamBlockFn(fn): fn(x, feetY) 返回「8×11 身体盒（脚底在 x,feetY）重叠的 DreamBlock」，null = 不在块内
        //   —— 对应原作 CollideFirst<DreamBlock>(Position) / (Position + dir)
        setDreamBlockFn(fn) { this.dreamBlockFn = fn; }

        // ===== 进入 Climb 状态（ClimbBegin）=====
        beginClimb(dir) {
            this.setState(ST_CLIMB);
            this.climbWallDir = dir;        // -1 或 +1
            this.vx = 0;
            // 朝向墙（原作攀爬时人物面朝墙壁；之前写成背对墙壁，方向是反的）
            this.facing = dir;
            this.climbNoMoveTimer = CLIMB_NO_MOVE_TIME;
            this.forceMoveX = -dir;         // 贴墙站立（离开墙的方向，仅用于物理靠墙）
            this.forceMoveXTimer = 0.1;
            this.sprite.play('climbup');
        }

        // ===== 退出 Climb 状态（ClimbEnd）=====
        endClimb() {
            this.setState(ST_NORMAL);
            this.climbWallDir = 0;
            this.climbNoMoveTimer = 0;
        }

        // ===== 进入 Dash 状态（原作 DashBegin）=====
        // 原文顺序：冻结 0.05s、双冷却、dashAttackTimer=0.3、记录 beforeDashSpeed、
        //           Speed = Vector2.Zero、DashDir = Vector2.Zero。
        //          ★ 速度 / 方向不在这里给，由 dashUpdate 的第一帧（协程 yield return null 之后）赋值。
        beginDash(onGroundAtStart) {
            this.setState(ST_DASH);
            this.dashSpeedSet = false;
            this.freezeTimer = FREEZE_TIME;
            this.dashTime = DASH_TIME;
            this.dashDir = { x: 0, y: 0 };
            this.beforeDashSpeed = { x: this.vx, y: this.vy };
            this.vx = 0;
            this.vy = 0;
            // 注意：冲刺数扣减在 startDash()（原作 StartDash）；此处只做 DashBegin
            this.dashCooldownTimer = DASH_COOLDOWN;
            this.dashRefillCooldownTimer = DASH_REFILL_COOLDOWN;
            this.dashAttackTimer = DASH_ATTACK_TIME;
            this.dashStartedOnGround = !!onGroundAtStart;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.lastAim = this.lastAim || { x: this.facing, y: 0 };
            // 原作：if (!onGround && Ducking && CanUnDuck) Ducking = false;
            if (!this.onGround && this.ducking) this.ducking = false;
        }

        // ===== Dash Slide（原作 Ultra / DodgeSlide 的两处实现，共用）=====
        dashSlide() {
            this.dashDir = { x: Math.sign(this.dashDir.x), y: 0 };
            this.vy = 0;
            this.vx *= DODGE_SLIDE_SPEED_MULT;
            this.ducking = true;
        }

        // ===== 冲刺结束（原作 DashCoroutine 尾部）=====
        // ★ DashDir.Y <= 0 才重置速度；向下 / 下斜保留冲刺速度。
        // ★ AutoJump 只用于半重力判定，绝不自动起跳。
        endDash() {
            this.autoJump = true;
            this.autoJumpTimer = 0;
            if (this.dashDir.y <= 0) {
                this.vx = this.dashDir.x * END_DASH_SPEED;
                this.vy = this.dashDir.y * END_DASH_SPEED;
            }
            if (this.vy < 0) this.vy *= END_DASH_UP_MULT;
            this.setState(ST_NORMAL);
            this.dashSpeedSet = false;
        }

        // ===== DreamDash 切入判定（原作 DreamDashCheck，由 OnCollideH / OnCollideV 调用）=====
        // IL（Player::DreamDashCheck）逐条：
        //   ① !Inventory.DreamDash || !DashAttacking → false
        //   ② dir.X != Sign(DashDir.X) || dir.Y != Sign(DashDir.Y) → false
        //   ③ blk = CollideFirst<DreamBlock>(Position + dir)；null → false
        //   ④ CollideCheck<Solid, DreamBlock>(Position + dir) 时做「轴交换」平移修正：
        //        ★ 双泛型是排除语义（collidecheck_il.txt L119-176：遍历全体实体，跳过在
        //        Solid / DreamBlock 列表里的）——只与「非 Solid 非 DreamBlock」的可碰撞实体判定，
        //        瓦片/果冻/梦境块全部不参与；本场景只剩尖刺与车可能触发
        //        axis = (|dir.Y|, |dir.X|)
        //        dir.X != 0：flag = Speed.Y <= 0，flag2 = Speed.Y >= 0
        //        dir.Y != 0：flag = Speed.X <= 0，flag2 = Speed.X >= 0
        //        flag  → i = -1..-4 依次试 Position + dir + axis*i，空则平移并返回 true
        //        flag2 → j =  1.. 4 同理（探测同样是排除语义）
        //        都失败 → false（仍与外部实体重叠，不能进块）
        //   ⑤ 否则 dreamBlock = blk，return true
        dreamDashCheck(dirX, dirY) {
            if (!this.dreamDashEnabled || !this.dashAttacking) return false;
            if (dirX === 0 && dirY === 0) return false;
            // 门禁按 IL（player_dream_il.txt DreamDashCheck L11-26）：
            //   if (dir.X == Sign(DashDir.X)) 跳过 Y 检查；否则才 if (dir.Y != Sign(DashDir.Y)) return false;
            // 即「任一非零分量匹配」即可通过。旧实现用双轴 AND，导致斜向冲刺撞墙/撞地/撞顶全部进不了块。
            const signX = Math.sign(this.dashDir.x), signY = Math.sign(this.dashDir.y);
            if (dirX !== signX && dirY !== signY) return false;
            if (!this.dreamBlockFn) return false;
            const blk = this.dreamBlockFn(this.x + dirX, this.y + dirY);
            if (!blk) return false;
            // 玩家同时与其它「非实心」可碰撞实体重叠：沿「轴交换」方向微调 1..4px 找空位（原作 ④）
            if (this.dreamForeignAt(dirX, dirY)) {
                const ax = Math.abs(dirY), ay = Math.abs(dirX);
                let flag, flag2;
                if (dirX !== 0) { flag = !(this.vy > 0); flag2 = !(this.vy < 0); }
                else { flag = !(this.vx > 0); flag2 = !(this.vx < 0); }
                if (flag) {
                    for (let i = -1; i >= -4; i--) {
                        if (!this.dreamForeignAt(dirX + ax * i, dirY + ay * i)) {
                            this.x += ax * i; this.y += ay * i;
                            this.dreamBlock = blk;
                            return true;
                        }
                    }
                }
                if (flag2) {
                    for (let j = 1; j <= 4; j++) {
                        if (!this.dreamForeignAt(dirX + ax * j, dirY + ay * j)) {
                            this.x += ax * j; this.y += ay * j;
                            this.dreamBlock = blk;
                            return true;
                        }
                    }
                }
                return false;
            }
            this.dreamBlock = blk;
            return true;
        }

        // 原作 DreamDashBegin：Speed = DashDir*240、TreatNaive、Depth=-12000、
        //                     dreamDashCanEndTimer=0.1、Stamina=110、dreamJump=false
        // ★ OnCollideH/V 的 IL（oncollide_il.txt L232-243 / L535-546 / L825-836）：
        //   DreamDashCheck 成功 → State=9 → 立即 dashAttackTimer = 0、gliderBoostTimer = 0。
        //   链式穿过相邻多块靠 TreatNaive + 每帧 CollideFirst<DreamBlock>（不离开 StDreamDash），
        //   不靠 DashAttacking。引擎无 glider 系统，gliderBoostTimer 无对应字段（gap）。
        beginDreamDash() {
            this.setState(ST_DREAM_DASH);
            this.dashAttackTimer = 0;
            this.vx = this.dashDir.x * DREAM_DASH_SPEED;
            this.vy = this.dashDir.y * DREAM_DASH_SPEED;
            this.dreamDashCanEndTimer = DREAM_DASH_MIN_TIME;
            this.stamina = DREAM_DASH_STAMINA;
            this.dreamJump = false;
            this.dreamTrailTimer = 0;
            if (this.onDreamDashEnter) this.onDreamDashEnter(this.dreamBlock);
        }

        // 原作 DreamDashEnd：非跳跃退出时 AutoJump；回充 dash / 体力；
        //                   水平出口给 0.1s 土狼时间（jumpGraceTimer），然后通知方块 OnPlayerExit
        dreamDashEnd() {
            if (!this.dreamJump) {
                this.autoJump = true;
                this.autoJumpTimer = 0;
            }
            // 原作：if (!Inventory.NoRefills) { RefillDash(); RefillStamina(); }（本场景无 NoRefills 变体）
            this.refillDash();
            this.refillStamina();
            const blk = this.dreamBlock;
            if (blk) {
                if (this.dashDir.x !== 0) {
                    this.jumpGraceTimer = JUMP_GRACE_TIME;
                    this.dreamJump = true;
                } else {
                    this.jumpGraceTimer = 0;
                }
                this.dreamBlock = null;
                if (this.onDreamDashExit) this.onDreamDashExit(blk);
            }
        }

        // 原作 StDreamDash.Update（DreamDashUpdate）：
        //   Input.Rumble(0,1); NaiveMove(Speed*dt); if (dreamDashCanEndTimer > 0) timer -= dt;
        //   blk = CollideFirst<DreamBlock>(Position)
        //   blk != null → 继续穿（残影 / Displacement 特效在场景层）
        //   blk == null → 先 DreamDashedIntoSolid 脱困，再按 timer 决定收尾
        dreamDashUpdate(dt, input) {
            this.x += this.vx * dt;
            this.y += this.vy * dt;
            if (this.dreamDashCanEndTimer > 0) this.dreamDashCanEndTimer -= dt;

            const blk = this.dreamBlockFn ? this.dreamBlockFn(this.x, this.y) : null;
            if (blk) {
                this.dreamBlock = blk;
                return;
            }

            // DreamDashedIntoSolid：身体盒与实心重叠 → 按 IL 的四层顺序试 100 个点：
            //   for (i = 1; i <= 5; i++)         ← x 幅值（step 1）
            //     for (j = -1; j <= 1; j += 2)   ← x 符号
            //       for (k = 1; k <= 5; k++)     ← y 幅值（step 1）
            //         for (l = -1; l <= 1; l += 2) ← y 符号
            //           偏移 = (i*j, k*l)，探测用 CollideCheck<Solid>（单泛型，含梦境块），
            //           遇到第一个非实心点就平移过去并返回 false
            // （player_dreamdash_il.txt L504-573；顺序决定脱困方向，不能改成「最近点」或全扫描）
            if (this.bodySolidAt(0, 0)) {
                let escaped = false;
                for (let i = 1; i <= 5 && !escaped; i++) {
                    for (let j = -1; j <= 1 && !escaped; j += 2) {
                        for (let k = 1; k <= 5 && !escaped; k++) {
                            for (let l = -1; l <= 1 && !escaped; l += 2) {
                                const ox = i * j, oy = k * l;
                                if (!this.bodySolidAt(ox, oy)) {
                                    this.x += ox;
                                    this.y += oy;
                                    escaped = true;
                                }
                            }
                        }
                    }
                }
                if (!escaped) {
                    // 100 点全实心：原作 Assists.Invincible 反弹，否则 Die(position, false, true)
                    // 本场景无 Assist，直接按死亡处理
                    this.setState(ST_NORMAL);
                    if (this.onDreamDashDeath) this.onDreamDashDeath(this);
                    return;
                }
            }

            if (this.dreamDashCanEndTimer > 0) return;  // 还在最短穿越时间内

            this.freezeTimer = FREEZE_TIME;             // 原作 Celeste.Freeze(.05f)
            // 出口跳：只有水平冲刺才能借此起跳（DashDir.X != 0）
            // 原作：Jump(true, true) → 第 2 参 fromDreamBlock，在脚底播 4 粒 -π/2 尘土
            if (input.jumpPressed && this.dashDir.x !== 0) {
                this.dreamJump = true;
                this.jump(true);
                this.setState(ST_NORMAL);
                return;
            }
            // IL（player_dreamdash_il.txt L368-377）：
            //   DashDir.Y >= 0 → 贴墙修正段；否则 DashDir.X == 0（纯向上）→ 直接返回 StNormal
            //   即修正段条件 = (DashDir.Y >= 0 || DashDir.X != 0)，覆盖水平/向下/上斜
            if (this.dashDir.y >= 0 || this.dashDir.x !== 0) {
                // 贴墙修正：Position∓5px 处有实心 → MoveHExact(∓5) 逐像素贴回去（撞到即停）
                // 探测是 CollideCheck<Solid> 单泛型（含梦境块，bodySolidAt 已含）
                if (this.dashDir.x > 0 && this.bodySolidAt(-DREAM_DASH_WALL_NUDGE, 0))
                    this.moveHExact(-DREAM_DASH_WALL_NUDGE);
                else if (this.dashDir.x < 0 && this.bodySolidAt(DREAM_DASH_WALL_NUDGE, 0))
                    this.moveHExact(DREAM_DASH_WALL_NUDGE);

                // 抓墙出口：GrabCheck && moveX 方向 ClimbCheck → Facing = moveX，直接转 Climb（原作返回 1）
                // IL：NoGrabbing=false（默认）不执行 ClimbTrigger/Speed.X=0——清零是 NoGrabbing=true 分支
                if (input.grabHeld) {
                    const mv = this._moveX;
                    if (mv === 1 && this.wallCheck(1)) { this.beginClimb(1); return; }
                    if (mv === -1 && this.wallCheck(-1)) { this.beginClimb(-1); return; }
                }
            }
            this.setState(ST_NORMAL);
        }

        // ===== 原作 Jump(bool particles, bool fromDreamBlock) =====
        // fromDreamBlock = true（梦境方块出口跳）时：脚底 BottomCenter 播 4 粒 -π/2 尘土
        // （原作还有 jump_dreamblock 音效，本工程无该音频素材，列入 gap）
        jump(fromDreamBlock) {
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
            this.varJumpTimer = VAR_JUMP_TIME;
            this.autoJump = false;
            this.autoJumpTimer = 0;
            this.dashAttackTimer = 0;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.wallBoostTimer = 0;
            this.vx += JUMP_HBOOST * this._moveX;
            this.vy = JUMP_SPEED;
            this.varJumpSpeed = this.vy;
            this.scaleX = 0.6; this.scaleY = 1.4;
            this.onGround = false;
            this.dashSpeedSet = false;
            if (fromDreamBlock && this.onDreamJump) this.onDreamJump();
        }

        // ===== SuperJump（原作：水平冲刺 + 跳 → super / hyper / wavedash）=====
        // 速度 (±260, -105)；蹲下变体 (±325, -52.5)
        superJump() {
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
            this.varJumpTimer = VAR_JUMP_TIME;
            this.autoJump = false;
            this.autoJumpTimer = 0;
            this.dashAttackTimer = 0;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.wallBoostTimer = 0;
            this.vx = SUPER_JUMP_H * this.facing;
            this.vy = SUPER_JUMP_SPEED;
            if (this.ducking) {
                this.ducking = false;
                this.vx *= DUCK_SUPER_JUMP_X_MULT;
                this.vy *= DUCK_SUPER_JUMP_Y_MULT;
            }
            this.varJumpSpeed = this.vy;
            this.scaleX = 0.6; this.scaleY = 1.4;
            this.onGround = false;
            this.setState(ST_NORMAL);
            this.dashSpeedSet = false;
        }

        // ===== SuperWallJump（原作：纯上冲 + 贴墙跳 → 真正的 wallbounce）=====
        // dir = 运动方向 = 背离墙的方向
        superWallJump(dir) {
            this.ducking = false;
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
            this.varJumpTimer = SUPER_WALL_JUMP_VAR_TIME;
            this.autoJump = false;
            this.autoJumpTimer = 0;
            this.dashAttackTimer = 0;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.wallBoostTimer = 0;
            this.vx = SUPER_WALL_JUMP_H * dir;
            this.vy = SUPER_WALL_JUMP_SPEED;
            this.varJumpSpeed = this.vy;
            this.facing = dir;
            this.scaleX = 0.6; this.scaleY = 1.4;
            this.onGround = false;
            this.setState(ST_NORMAL);
            this.dashSpeedSet = false;
        }

        // ===== Wall Jump（ClimbJump / SuperJump）=====
        wallJump(wallDir) {
            // wallDir: -1 时墙在左边，wall jump 向右跳，水平 = WallJumpHSpeed * (-wallDir)
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
            this.varJumpTimer = VAR_JUMP_TIME;
            this.autoJump = false;
            this.dashAttackTimer = 0;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.vx = WALL_JUMP_HSPEED * -wallDir;   // 离开墙的方向
            this.vy = JUMP_SPEED;
            this.varJumpSpeed = this.vy;
            this.facing = -wallDir;
            this.scaleX = 0.6; this.scaleY = 1.4;
            this.onGround = false;
            this.forceMoveX = -wallDir;
            this.forceMoveXTimer = WALL_JUMP_FORCE_TIME;
            this.dashSpeedSet = false;
            // 原作 WallJump 的调用点一律 return StNormal；这里统一收口，
            // 使 HitSquash / RedDash 等状态调墙跳后也能正确回到 Normal。
            this.setState(ST_NORMAL);
        }

        // ===== ClimbJump（爬墙跳）=====
        climbJump() {
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
            this.varJumpTimer = VAR_JUMP_TIME;
            this.autoJump = false;
            this.dashAttackTimer = 0;
            this.dashSpeedSet = false;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.stamina = Math.max(0, this.stamina - CLIMB_JUMP_COST);
            // 水平：离开墙方向 × CLIMB_HOP_X 或墙跳方向（向上/向下不同）
            const dir = this.climbWallDir;
            this.vx = WALL_JUMP_HSPEED * -dir;
            this.vy = CLIMB_HOP_Y;
            this.varJumpSpeed = this.vy;
            this.facing = -dir;
            this.scaleX = 0.6; this.scaleY = 1.4;
            this.onGround = false;
            this.forceMoveX = -dir;
            this.forceMoveXTimer = WALL_JUMP_FORCE_TIME;
            // 同 WallJump：原作调用点一律 return StNormal
            this.setState(ST_NORMAL);
        }

        // ===== ClimbHop（翻过头）=====
        climbHop() {
            this.jumpBufferTimer = 0;
            this.varJumpTimer = VAR_JUMP_TIME;
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.vx = CLIMB_HOP_X * this.climbWallDir;   // 沿墙方向
            this.vy = CLIMB_HOP_Y;
            this.varJumpSpeed = this.vy;
            this.forceMoveX = this.climbWallDir;
            this.forceMoveXTimer = CLIMB_HOP_FORCE_TIME;
        }

        // ===== 墙检测辅助 =====
        // 返回 { onLeft: bool, onRight: bool, leftWallX, rightWallX }
        getWallInfo() {
            let leftWallX = null, rightWallX = null;
            if (this.wallAtFn) {
                leftWallX = this.wallAtFn(this.x, this.y, -1);
                rightWallX = this.wallAtFn(this.x, this.y, +1);
            }
            // 宽容匹配：wallAtFn 已经在附近时返回墙位置
            const onLeft = leftWallX !== null;
            const onRight = rightWallX !== null;
            return { onLeft, onRight, leftWallX, rightWallX };
        }

        // 原作 WallJumpCheck(dir)：向 dir 方向 3px 内是否有墙
        wallCheck(dir) {
            if (!this.wallAtFn) return false;
            return this.wallAtFn(this.x + dir * WALL_JUMP_CHECK_DIST, this.y, dir) !== null;
        }

        // 原作 ClimbBoundsCheck(dir)：不让角色爬出房间左右边界。本引擎无固定房间，恒真。
        climbBoundsCheck() { return true; }

        // 原作 CollideCheck<Solid>(Position + offset)：把 8×11 身体盒整体平移后是否与实心重叠。
        // 未接线 bodySolidFn 时退回墙体探测（只能处理水平方向）。
        bodySolidAt(dx, dy) {
            if (this.bodySolidFn) return !!this.bodySolidFn(this.x + dx, this.y + dy);
            const dir = Math.sign(dx);
            if (dir === 0 || !this.wallAtFn) return false;
            return this.wallAtFn(this.x + dx - dir * BODY_HALF_W, this.y + (dy || 0), dir) !== null;
        }

        // 原作 DreamDashCheck 里的 CollideCheck<Solid, DreamBlock>(Position + dir)：
        // Monocle 双泛型是排除语义（collidecheck_il.txt L119-176）——遍历全体实体，跳过
        // 在 Solid / DreamBlock 列表里的，只与「既非实心也非梦境块」的可碰撞实体判定
        // （本场景：尖刺、车）。场景层用 setDreamForeignFn 接入；未接线 = 无此类实体，恒 false。
        dreamForeignAt(dx, dy) {
            return this.dreamForeignFn ? !!this.dreamForeignFn(this.x + dx, this.y + dy) : false;
        }

        // 原作 Actor::MoveHExact(int, null, null)：逐像素平移，撞到实心立刻停下（不是瞬移）。
        // IL 里 DreamDashUpdate 的出口修正调用 MoveHExact(∓5)，传的两个回调都是 null，
        // 所以撞墙时只停住、不改 Speed（不同于 MoveH 的 OnCollideH）。
        moveHExact(amount) {
            if (!amount) return;
            const dir = Math.sign(amount);
            for (let i = 0; i < Math.abs(amount); i++) {
                if (this.wallCollideFn &&
                    this.wallCollideFn(this.x + dir * (1 + BODY_HALF_W), this.y, dir) !== null) return;
                this.x += dir;
            }
        }

        // 原作 DashAttacking = dashAttackTimer > 0 || State == StRedDash
        get dashAttacking() { return this.dashAttackTimer > 0 || this.state === ST_RED_DASH; }

        // ===== 状态转移统一入口（D20）=====
        // 对应 Monocle.StateMachine 切状态时调用上一状态的 End 与下一状态的 Begin。
        setState(next) {
            if (this.state === next) return;
            if (this.state === ST_NORMAL) this.normalEnd();
            if (this.state === ST_DREAM_DASH) this.dreamDashEnd();
            this.state = next;
            if (next === ST_NORMAL) this.normalBegin();
        }
        // 原作 NormalBegin()：maxFall = MaxFall
        normalBegin() { this.maxFall = MAX_FALL; }
        // 原作 NormalEnd()：wallBoostTimer = 0; wallSpeedRetentionTimer = 0; hopWaitX = 0
        normalEnd() {
            this.wallBoostTimer = 0;
            this.wallSpeedRetentionTimer = 0;
            this.hopWaitX = 0;
        }

        // ===== D21 统一回充（原作 RefillStamina / RefillDash）=====
        refillStamina() { this.stamina = CLIMB_MAX_STAMINA; }
        refillDash() {
            if (this.dashes < this.maxDashes) { this.dashes = this.maxDashes; return true; }
            return false;
        }

        // ===== D22 原作 CheckStamina / IsTired =====
        // CheckStamina = Stamina + ClimbJumpCost (wallBoostTimer > 0)；IsTired = CheckStamina < 20
        checkStamina() { return this.wallBoostTimer > 0 ? this.stamina + CLIMB_JUMP_COST : this.stamina; }
        get isTired() { return this.checkStamina() < CLIMB_TIRED_THRESHOLD; }

        // ===== D19 原作 CanDash（判定，不改状态）/ StartDash（扣冲刺数）=====
        // 原作 CanDash：Input.Dash.Pressed && dashCooldownTimer <= 0 && Dashes > 0
        canDash(input) {
            return !!input.dashPressed && this.dashCooldownTimer <= 0 && this.dashes > 0;
        }
        // 原作 StartDash()：wasDashB = (Dashes == 2); Dashes = Max(0, Dashes - 1); 返回目标状态号
        startDash() {
            this.wasDashB = this.dashes === 2;
            this.dashes = Math.max(0, this.dashes - 1);
            return ST_DASH;
        }

        // ===== 主入口：按当前状态分派 =====
        update(dt, input) {
            // 原作 Celeste.Freeze(.05f)：冻结期间整个世界暂停（冲刺起手 3 帧）
            if (this.freezeTimer > 0) {
                this.freezeTimer -= dt;
                if (this.freezeTimer > 1e-9) return;
                this.freezeTimer = 0;
            }

            // ==== 瞄准（原作 lastAim = Input.GetAimVector(Facing)）====
            // 缺口：GetAimVector 不在官方仓库。等价实现：8 向单位化 + 零输入回落 Facing。
            let ax = input.aimX || 0, ay = input.aimY || 0;
            if (ax === 0 && ay === 0) ax = this.facing;
            const amag = Math.hypot(ax, ay) || 1;
            this.lastAim = { x: ax / amag, y: ay / amag };

            // 原作 Player.Update 开头的 timer bookkeeping（在 base.Update 之前）
            // 着地恢复 stamina / 土狼时间；并清 AutoJump（IL：onGround && State != StClimb → AutoJump = false）
            // 不清的话，DreamDashEnd 写入的 AutoJump 会在落地后永久当作「按住跳跃」→ 半重力发飘
            if (this.onGround) {
                if (this.state !== ST_CLIMB) this.autoJump = false;
                this.refillStamina();
                this.wallSlideTimer = WALL_SLIDE_TIME;
                this.jumpGraceTimer = JUMP_GRACE_TIME;
            } else if (this.jumpGraceTimer > 0) {
                this.jumpGraceTimer -= dt;
            }
            if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
            if (this.dashRefillCooldownTimer > 0) this.dashRefillCooldownTimer -= dt;
            // 原作回充：RefillDash() 是满充（Dashes = MaxDashes），不是补一发
            else if (this.onGround) {
                this.refillDash();
            }
            if (this.dashAttackTimer > 0) this.dashAttackTimer -= dt;
            if (this.varJumpTimer > 0) this.varJumpTimer -= dt;
            if (this.autoJumpTimer > 0) this.autoJumpTimer -= dt;
            if (this.forceMoveXTimer > 0) this.forceMoveXTimer -= dt;
            else this.forceMoveX = 0;
            if (this.wallSlideTimer > 0 && this.wallSlideDir !== 0)
                this.wallSlideTimer -= dt;
            if (this.wallBoostTimer > 0) this.wallBoostTimer -= dt;
            if (this.wallSpeedRetentionTimer > 0) this.wallSpeedRetentionTimer -= dt;

            // 原作 WallSpeedRetention：撞墙后 0.06s 内墙消失则返还速度
            if (this.wallSpeedRetentionTimer > 0 && this.wallSpeedRetained !== 0) {
                const rd = Math.sign(this.wallSpeedRetained);
                if (Math.sign(this.vx) === -rd) {
                    this.wallSpeedRetentionTimer = 0;
                } else if (this.wallCollideFn && this.wallCollideFn(this.x + rd * 5, this.y, rd) === null) {
                    this.vx = this.wallSpeedRetained;
                    this.wallSpeedRetentionTimer = 0;
                }
            }

            // 跳跃输入缓冲
            if (input.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER_TIME;
            else if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

            // ==== 方向（按原作顺序）====
            const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            const moveY = (input.down ? 1 : 0) + (input.up ? -1 : 0);
            this._moveX = moveX; this._moveY = moveY;

            // 原作 orig_Update 内的 explodeLaunchBoostTimer（安装版新增）：
            // timer > 0 时若本帧输入方向 == sign(explodeLaunchBoostSpeed) → 立刻补上该速度并清零；
            // 否则只递减计时（超时后并不会补速）。修正来源：annotated.txt 的 orig_Update IL。
            if (this.explodeLaunchBoostTimer > 0) {
                if (this._moveX === Math.sign(this.explodeLaunchBoostSpeed)) {
                    this.vx = this.explodeLaunchBoostSpeed;
                    this.explodeLaunchBoostTimer = 0;
                } else {
                    this.explodeLaunchBoostTimer -= dt;
                }
            }

            // ForceMoveX 覆盖
            const effMoveX = this.forceMoveXTimer > 0 ? this.forceMoveX : moveX;

            // 朝向更新（攀爬时朝向由墙面决定，不被 ForceMoveX 覆盖）
            if (this.state !== ST_CLIMB && effMoveX !== 0) {
                if (effMoveX !== this.facing && this.ducking) { this.scaleX = 0.8; this.scaleY = 1.2; }
                this.facing = effMoveX;
            }

            // ===== CanDash（原作 NormalUpdate / ClimbUpdate 内的冲刺触发）=====
            // 只在 Normal / Climb 里做全局判定；Dash、Boost、RedDash、Launch、HitSquash
            // 各自在自己 Update 内处理 CanDash（原作就是这么写的）。
            let justDashed = false;
            if ((this.state === ST_NORMAL || this.state === ST_CLIMB) && this.canDash(input)) {
                this.startDash();
                this.beginDash(this.onGround);
                justDashed = true;   // 触发帧只做 DashBegin，不跑 dashUpdate（对应协程 yield return null）
            }

            // ===== 分派 =====
            // 记录本帧开始时是否处于 StDreamDash：退出 9 的那一帧位移已由 NaiveMove 完成，
            // 不能再跑一遍 postPhysics（否则同一帧走两步，原作没有这一段）
            const startedDreamDash = this.state === ST_DREAM_DASH;
            if (!justDashed) {
                if (this.state === ST_NORMAL) {
                    this.normalUpdate(dt, input, effMoveX, moveY);
                } else if (this.state === ST_CLIMB) {
                    this.climbUpdate(dt, input, effMoveX, moveY);
                } else if (this.state === ST_DASH) {
                    this.dashUpdate(dt, input, effMoveX, moveY);
                } else if (this.state === ST_BOOST) {
                    this.boostUpdate(dt, input);
                } else if (this.state === ST_RED_DASH) {
                    this.redDashUpdate(dt, input);
                } else if (this.state === ST_HIT_SQUASH) {
                    this.hitSquashUpdate(dt, input);
                } else if (this.state === ST_LAUNCH) {
                    this.launchUpdate(dt, input);
                } else if (this.state === ST_DREAM_DASH) {
                    this.dreamDashUpdate(dt, input);
                }
            }

            // 原作 UpdateHair()：发色语义
            this.updateHairColor(dt);

            // ===== 着地 + Scale 回弹 + Sprite 更新（所有状态共享）=====
            // StDreamDash 的位移在 dreamDashUpdate 内用 NaiveMove 完成，不走 MoveH/MoveV，
            // 因此跳过整套碰撞（原作此时也不触发 OnCollideH / OnCollideV）。
            if (startedDreamDash || this.state === ST_DREAM_DASH) this.updateSharedVisuals(dt);
            else this.postPhysics(dt, input);
        }

        // 原作 UpdateHair()：红=有 dash / 粉=2格 / 蓝=已用完 / 白=闪 0.12s
        updateHairColor(dt) {
            if (this.dashes === 0 && this.dashes < this.maxDashes) {
                this.hair.setColor('used');            // 蓝（引擎里是直接切贴图，原作是 Lerp）
            } else if (this.lastDashes !== this.dashes) {
                this.hair.setColor('flash');           // 白闪
                this.hairFlashTimer = HAIR_FLASH_TIME;
            } else if (this.hairFlashTimer > 0) {
                this.hairFlashTimer -= dt;
                this.hair.setColor('flash');
            } else if (this.dashes === 2) {
                this.hair.setColor('two');             // 粉
            } else {
                this.hair.setColor('normal');          // 红
            }
            this.lastDashes = this.dashes;
        }

        // ===== NormalUpdate（完整保留，加入 wallSlide → Climb 判定）=====
        normalUpdate(dt, input, moveX, moveY) {
            // —— 蹲下 / 起身 ——
            if (this.ducking) {
                if (this.onGround && moveY !== 1) {
                    this.ducking = false; this.scaleX = 0.8; this.scaleY = 1.2;
                }
            } else if (this.onGround && moveY === 1 && this.vy >= 0) {
                this.ducking = true; this.scaleX = 1.4; this.scaleY = 0.6;
            }

            // —— 水平移动 ——
            if (this.ducking && this.onGround) {
                this.vx = approach(this.vx, 0, DUCK_FRICTION * dt);
            } else {
                const mult = this.onGround ? 1 : AIR_MULT;
                if (Math.abs(this.vx) > MAX_RUN && Math.sign(this.vx) === moveX)
                    this.vx = approach(this.vx, MAX_RUN * moveX, RUN_REDUCE * mult * dt);
                else
                    this.vx = approach(this.vx, MAX_RUN * moveX, RUN_ACCEL * mult * dt);
            }

            // —— maxFall 过渡 + 快落拉伸 ——
            if (moveY === 1 && this.vy >= MAX_FALL) {
                this.maxFall = approach(this.maxFall, FAST_MAX_FALL, FAST_MAX_ACCEL * dt);
                const mid = MAX_FALL + (FAST_MAX_FALL - MAX_FALL) * 0.5;
                if (this.vy >= mid) {
                    const a = Math.min(1, (this.vy - mid) / (FAST_MAX_FALL - mid));
                    this.scaleX = lerp(1, 0.5, a);
                    this.scaleY = lerp(1, 1.5, a);
                }
            } else {
                this.maxFall = approach(this.maxFall, MAX_FALL, FAST_MAX_ACCEL * dt);
            }

            // —— 重力（含墙滑）——
            if (!this.onGround) {
                // 原作 NormalUpdate 的墙滑判定（IL 620-759）：
                //   (moveX == Facing || (moveX == 0 && GrabCheck)) && MoveY != 1
                //   && Speed.Y >= 0 && wallSlideTimer > 0 && !Holding
                //   && ClimbBoundsCheck(Facing) && CollideCheck<Solid>(Position + UnitX*Facing)
                // 命中后：Ducking = false; wallSlideDir = Facing。
                // ⚠ 旧版写成「moveX<=0 且左墙」，方向语义是反的（只会在背对墙时触发）。
                const dir = this.facing;
                const grab = !!input.grabHeld;
                const pushing = (moveX === dir) || (moveX === 0 && grab);
                const touching = this.bodySolidAt(dir, 0);
                const wallSliding = pushing && moveY !== 1 && this.vy >= 0 &&
                    this.wallSlideTimer > 0 && touching && this.climbBoundsCheck(dir);

                if (wallSliding) {
                    this.ducking = false;
                    this.wallSlideDir = dir;
                    // 墙滑 fall cap：Lerp(160, 20, wallSlideTimer / 1.2)
                    const slideMax = lerp(MAX_FALL, WALL_SLIDE_START_MAX,
                        clamp(this.wallSlideTimer / WALL_SLIDE_TIME, 0, 1));
                    const half = (Math.abs(this.vy) < HALF_GRAV_THRESHOLD && (input.jumpHeld || this.autoJump)) ? 0.5 : 1;
                    this.vy = approach(this.vy, slideMax, GRAVITY * half * dt);
                } else {
                    this.wallSlideDir = 0;
                    const half = (Math.abs(this.vy) < HALF_GRAV_THRESHOLD && (input.jumpHeld || this.autoJump)) ? 0.5 : 1;
                    this.vy = approach(this.vy, this.maxFall, GRAVITY * half * dt);
                }
            } else {
                this.wallSlideDir = 0;
            }

            // —— 可变跳高 ——
            if (this.varJumpTimer > 0) {
                if (input.jumpHeld || this.autoJump) this.vy = Math.min(this.vy, this.varJumpSpeed);
                else this.varJumpTimer = 0;
            }

            // —— 跳跃触发（原作顺序：土狼跳优先，其次墙面）——
            if (this.jumpBufferTimer > 0) {
                if (this.jumpGraceTimer > 0) {
                    this.jump();
                } else if (this.wallCheck(+1) || this.wallCheck(-1)) {
                    const wallSide = this.wallCheck(+1) ? +1 : -1;   // 墙在哪一侧
                    if (input.grabHeld && this.stamina > 0) {
                        this.climbWallDir = wallSide;
                        this.climbJump();                            // 抓墙跳优先于墙跳
                    } else if (this.dashAttacking && this.dashDir.x === 0 && this.dashDir.y === -1) {
                        this.superWallJump(-wallSide);               // 纯上冲 → wallbounce（DashAttack 0.15s 宽容窗口）
                    } else {
                        this.wallJump(wallSide);
                    }
                }
            }

            // —— 进入 Climb：grab + 贴墙 ——
            // 原作 NormalUpdate:2792-2805 只要求 Input.Grab.Check && Speed.Y >= 0 && ClimbCheck(Facing)，
            // 没有 onGround 限制 —— 站在地上贴墙按住 G 也能抓住并往上爬。
            if (input.grabHeld && this.vy >= 0) {
                const wi = this.getWallInfo();
                if (wi.onLeft) this.beginClimb(-1);
                else if (wi.onRight) this.beginClimb(+1);
            }

            // 空中下落后自动解蹲
            if (this.vy > 0 && !this.onGround && this.jumpGraceTimer <= 0) this.ducking = false;
        }

        // ===== ClimbUpdate =====
        climbUpdate(dt, input, moveX, moveY) {
            // 检查是否还贴墙
            const wi = this.getWallInfo();
            const wallHeld = (this.climbWallDir === -1 ? wi.onLeft : wi.onRight);

            // 脱离墙（放 grab 或 离开墙的方向）
            const letGo = !input.grabHeld ||
                (this.climbWallDir === -1 && moveX === 1 && !input.grabHeld) ||
                (this.climbWallDir === +1 && moveX === -1 && !input.grabHeld);

            // 原作 ClimbUpdate:3129-3152：放抓松开 / 没有墙时退出；
            // 向上爬过平台边缘（Speed.Y < 0）要 ClimbHop 翻上去，而不是直接掉下来。
            if (!wallHeld) {
                if (this.vy < 0) this.climbHop();
                this.endClimb();
                return;
            }
            if (letGo || this.stamina <= 0) {
                this.endClimb();
                return;
            }

            // 体力消耗（按 lastClimbMove）
            // moveY < -0.5 → up, > 0.5 → down, else still
            let climbMove = 0;
            if (moveY < -0.5) climbMove = -1;
            else if (moveY > 0.5) climbMove = 1;
            else climbMove = 0;

            if (climbMove !== 0) this.climbNoMoveTimer = CLIMB_NO_MOVE_TIME;
            else this.climbNoMoveTimer -= dt;

            const cost = climbMove === -1 ? CLIMB_UP_COST :
                         climbMove === 0 ? CLIMB_STILL_COST : 0;
            this.stamina = Math.max(0, this.stamina - cost * dt);
            this.lastClimbMove = climbMove;

            // 速度更新（ClimbAccel 向目标靠近）
            let targetVy = 0;
            if (climbMove === -1) targetVy = CLIMB_UP_SPEED;   // -45
            else if (climbMove === 1) targetVy = onGround ? 0 : CLIMB_DOWN_SPEED;  // 原作 3209-3214：贴地向下 = 0
            // 饥饿滑落
            if (this.stamina <= CLIMB_TIRED_THRESHOLD) {
                targetVy = Math.max(targetVy, CLIMB_SLIP_SPEED);  // 30
            }

            this.vy = approach(this.vy, targetVy, CLIMB_ACCEL * dt);
            // 水平贴墙，朝向始终面向墙
            this.vx = 0;
            this.facing = this.climbWallDir;

            // —— 跳跃 → ClimbJump ——
            if (this.jumpBufferTimer > 0) {
                this.jumpBufferTimer = 0;
                this.climbJump();
                this.endClimb();
                return;
            }

            // —— ClimbHop（长时间没移动，体力足够）——
            if (this.climbNoMoveTimer <= 0 && this.stamina > CLIMB_JUMP_COST) {
                this.climbHop();
                this.endClimb();
                return;
            }
        }

        // ===== DashUpdate（逐行对齐原作 DashCoroutine + DashUpdate）=====
        dashUpdate(dt, input, moveX, moveY) {
            // —— 相位 0：等价于协程的 `yield return null` ——
            // 冲刺触发的这一帧速度仍是 0；下一帧才读 lastAim 赋速。
            if (!this.dashSpeedSet) {
                const dir = this.lastAim;
                let nx = dir.x * DASH_SPEED;
                let ny = dir.y * DASH_SPEED;
                // 原作 beforeDashSpeed 同向保留（D8）
                if (Math.sign(this.beforeDashSpeed.x) === Math.sign(nx) &&
                    Math.abs(this.beforeDashSpeed.x) > Math.abs(nx))
                    nx = this.beforeDashSpeed.x;
                this.vx = nx;
                this.vy = ny;
                this.dashDir = { x: dir.x, y: dir.y };
                if (dir.x !== 0) this.facing = Math.sign(dir.x);
                // 原作 Dash Slide（协程内那段）：起手就贴地下斜冲
                if (this.onGround && dir.x !== 0 && dir.y > 0 && this.vy > 0)
                    this.dashSlide();
                this.dashSpeedSet = true;
                return;                      // 本帧不推进 dashTime
            }

            // —— 每帧：跳跃打断是唯一的墙跳 / SuperJump / wallbounce 入口 ——
            if (this.jumpBufferTimer > 0) {
                if (this.dashDir.y === 0 && this.jumpGraceTimer > 0) {
                    this.superJump();        // 水平冲 + 土狼期跳 → super / hyper
                    return;
                }
                if (this.dashDir.x === 0 && this.dashDir.y === -1) {
                    // 纯上冲：贴墙跳 → wallbounce（上斜不行，这是社区最常见的误解）
                    if (this.wallCheck(+1)) { this.superWallJump(-1); return; }
                    if (this.wallCheck(-1)) { this.superWallJump(+1); return; }
                } else {
                    if (this.wallCheck(+1)) { this.wallJump(+1); return; }
                    if (this.wallCheck(-1)) { this.wallJump(-1); return; }
                }
            }

            // —— 冲刺中抓墙 → 转 Climb ——
            if (input.grabHeld && !this.onGround) {
                const wi = this.getWallInfo();
                const grabDir = (wi.onLeft && this.dashDir.x <= 0) ? -1 :
                                (wi.onRight && this.dashDir.x >= 0) ? +1 : 0;
                if (grabDir !== 0) {
                    this.dashSpeedSet = false;
                    this.beginClimb(grabDir);   // 原作：Dash → Climb 直切，不经 Normal
                    return;
                }
            }

            // 冲刺结束。浮点容差：9 帧 @60Hz 累加后会剩 +2e-17（正数），需用 abs 容差
            this.dashTime -= dt;
            if (this.dashTime <= 0 || Math.abs(this.dashTime) < 1e-9) {
                this.endDash();
            }
        }

        // ===== 原作 HitSquash(6)：红球冲刺（StRedDash）硬撞实心 =====
        // 触发源：安装版 OnCollideH / OnCollideV 在 State == StRedDash(5) 时置 State = 6
        //（研究文档第 7 章 + 本轮重新逐指令核对：两处皆为 `State == 5 → ldc.i4.6 set_State`）。
        beginHitSquash() {
            this.setState(ST_HIT_SQUASH);
            this.hitSquashNoMoveTimer = HIT_SQUASH_NO_MOVE_TIME;
        }
        hitSquashUpdate(dt, input) {
            this.vx = approach(this.vx, 0, HIT_SQUASH_FRICTION * dt);
            this.vy = approach(this.vy, 0, HIT_SQUASH_FRICTION * dt);

            if (input.jumpPressed) {
                if (this.onGround) {
                    this.jump();
                } else if (this.wallCheck(+1)) {
                    if (this.facing === +1 && input.grabHeld && this.stamina > 0) {
                        this.climbWallDir = +1; this.climbJump();
                    } else this.wallJump(-1);
                } else if (this.wallCheck(-1)) {
                    if (this.facing === -1 && input.grabHeld && this.stamina > 0) {
                        this.climbWallDir = -1; this.climbJump();
                    } else this.wallJump(+1);
                }
                this.jumpBufferTimer = 0;              // 原作 Input.Jump.ConsumeBuffer()
                this.setState(ST_NORMAL);
                return;
            }

            if (this.canDash(input)) { this.startDash(); this.beginDash(this.onGround); return; }
            if (input.grabHeld && this.wallCheck(this.facing)) { this.beginClimb(this.facing); return; }

            if (this.hitSquashNoMoveTimer > 0) this.hitSquashNoMoveTimer -= dt;
            else this.setState(ST_NORMAL);
        }

        // ===== 原作 ExplodeLaunch(from, snapUp, sidesOnly) → Launch(7) =====
        // 安装版（Everest）比 vanilla 多了 sidesOnly 参数，且水平吸附区间是 [-0.55, 0.65]、
        // 上吸阈值 -0.7、并含同向 ×1.2 / 反向 0.01s 延迟补速。以安装版 IL 为准（研究文档 16.4）。
        explodeLaunch(from, snapUp, sidesOnly) {
            this.freezeTimer = LAUNCH_FREEZE;              // Celeste.Freeze(.1f)
            this.launchApproachX = null;

            // normal = (Center - from).SafeNormalize(-Vector2.UnitY)：零向量回落正上方
            let dx = this.x - from.x, dy = this.y - from.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) { dx = 0; dy = -1; } else { dx /= len; dy /= len; }
            let nx = dx, ny = dy;
            const dot = ny;                                // Vector2.Dot(normal, UnitY)
            if (snapUp && dot <= LAUNCH_SNAP_UP_DOT) { nx = 0; ny = -1; }
            else if (dot >= LAUNCH_SIDE_LO && dot <= LAUNCH_SIDE_HI) { nx = Math.sign(nx); ny = 0; }
            if (sidesOnly && nx !== 0) { nx = Math.sign(nx); ny = 0; }

            this.vx = LAUNCH_SPEED * nx;
            this.vy = LAUNCH_SPEED * ny;
            if (this.vy <= LAUNCH_UP_CAP) { this.vy = Math.min(LAUNCH_UP_MIN, this.vy); this.autoJump = true; }

            if (this.vx !== 0) {
                if (this._moveX === Math.sign(this.vx)) {
                    this.explodeLaunchBoostTimer = 0;
                    this.vx *= LAUNCH_BOOST_MULT;
                } else {
                    this.explodeLaunchBoostTimer = LAUNCH_BOOST_DELAY;
                    this.explodeLaunchBoostSpeed = this.vx * LAUNCH_BOOST_MULT;
                }
            }

            this.refillDash();
            this.refillStamina();
            this.dashCooldownTimer = DASH_COOLDOWN;
            this.launched = true;                          // LaunchBegin
            this.setState(ST_LAUNCH);
        }
        launchUpdate(dt, input) {
            if (this.launchApproachX !== null)
                this.x = approach(this.x, this.launchApproachX, LAUNCH_APPROACH_X_SPEED * dt);

            if (this.canDash(input)) { this.startDash(); this.beginDash(this.onGround); return; }

            // 减速：Speed.Y → MaxFall，上升 Gravity*0.5 / 下降 Gravity*0.25；Speed.X → 0，RunAccel*0.2
            if (this.vy < 0) this.vy = approach(this.vy, MAX_FALL, GRAVITY * 0.5 * dt);
            else this.vy = approach(this.vy, MAX_FALL, GRAVITY * 0.25 * dt);
            this.vx = approach(this.vx, 0, RUN_ACCEL * 0.2 * dt);

            if (Math.hypot(this.vx, this.vy) < LAUNCH_CANCEL_THRESHOLD) this.setState(ST_NORMAL);
        }

        // ===== 原作 Boost(Booster) / RedBoost(Booster) → Boost(4) =====
        // booster：{ x, y } = 目标脚底坐标（原作 boostTarget = booster.Center；本引擎以脚底为原点）
        boost(booster, red) {
            this.setState(ST_BOOST);
            this.vx = 0; this.vy = 0;                      // Speed = Vector2.Zero
            this.boostTarget = { x: booster.x, y: booster.y };
            this.boostRed = !!red;
            this.currentBooster = booster;
            this.boostTime = BOOST_TIME;
            // BoostBegin / orig_BoostBegin：RefillDash + RefillStamina（原作还有持物 Drop，本引擎无持物）
            this.refillDash();
            this.refillStamina();
        }
        boostUpdate(dt, input) {
            // to = Calc.Approach(ExactPosition, boostTarget - Collider.Center + Input.Aim * 3, 80 * dt)
            const tx = this.boostTarget.x + (input.aimX || 0) * BOOST_AIM_OFFSET;
            const ty = this.boostTarget.y + (input.aimY || 0) * BOOST_AIM_OFFSET;
            this.x = approach(this.x, tx, BOOST_MOVE_SPEED * dt);
            this.y = approach(this.y, ty, BOOST_MOVE_SPEED * dt);

            if (input.dashPressed) {                       // 提前按冲刺 → 立刻离球
                if (this.boostRed) this.beginRedDash();
                else this.beginDash(this.onGround);
                return;
            }
            // BoostCoroutine：停驻 BoostTime 后自动进入 Dash / RedDash
            this.boostTime -= dt;
            if (this.boostTime <= 0) {
                if (this.boostRed) this.beginRedDash();
                else this.beginDash(this.onGround);
            }
        }

        // ===== 原作 RedDashBegin / RedDashUpdate / RedDashCoroutine =====
        beginRedDash() {
            this.setState(ST_RED_DASH);
            this.dashSpeedSet = false;
            this.freezeTimer = FREEZE_TIME;                 // Celeste.Freeze(.05f)
            this.dashCooldownTimer = DASH_COOLDOWN;
            this.dashRefillCooldownTimer = DASH_REFILL_COOLDOWN;
            this.dashAttackTimer = DASH_ATTACK_TIME;
            this.dashStartedOnGround = false;
            this.vx = 0; this.vy = 0;                       // Speed = Vector2.Zero
            this.dashDir = { x: 0, y: 0 };
            if (!this.onGround && this.ducking) this.ducking = false;
        }
        redDashUpdate(dt, input) {
            // —— 相位 0：等价 RedDashCoroutine 的 `yield return null` ——
            // 下一帧才赋速：Speed = lastAim * DashSpeed（与普通冲刺同速，没有额外倍率）
            if (!this.dashSpeedSet) {
                const dir = this.lastAim;
                this.vx = dir.x * DASH_SPEED;
                this.vy = dir.y * DASH_SPEED;
                this.dashDir = { x: dir.x, y: dir.y };
                if (dir.x !== 0) this.facing = Math.sign(dir.x);
                this.dashSpeedSet = true;
                return;
            }

            // 原作 RedDashUpdate：StRedDash 不自带结束计时器，只在下面四条出口离开
            if (this.canDash(input)) { this.startDash(); this.beginDash(this.onGround); return; }

            if (this.dashDir.y === 0) {
                // 水平红冲：SuperJump（土狼期）
                if (input.jumpPressed && this.jumpGraceTimer > 0 && !this.ducking) { this.superJump(); return; }
            }

            // get_SuperWallJumpAngleCheck：|DashDir.X| <= 0.2 && DashDir.Y <= -0.75（近垂直向上）
            if (this.superWallJumpAngleCheck) {
                if (input.jumpPressed) {
                    if (this.wallCheck(+1)) { this.superWallJump(-1); return; }
                    if (this.wallCheck(-1)) { this.superWallJump(+1); return; }
                }
                return;   // 纯上红冲不再走下面的普通墙跳分支
            }

            if (input.jumpPressed) {
                if (this.wallCheck(+1)) {
                    if (this.facing === +1 && input.grabHeld && this.stamina > 0) {
                        this.climbWallDir = +1; this.climbJump();
                    } else this.wallJump(-1);
                    return;
                }
                if (this.wallCheck(-1)) {
                    if (this.facing === -1 && input.grabHeld && this.stamina > 0) {
                        this.climbWallDir = -1; this.climbJump();
                    } else this.wallJump(+1);
                    return;
                }
            }
        }

        // 原作 get_SuperWallJumpAngleCheck：|DashDir.X| <= 0.2 && DashDir.Y <= -0.75
        get superWallJumpAngleCheck() {
            return Math.abs(this.dashDir.x) <= 0.2 && this.dashDir.y <= -0.75;
        }

        // ===== 共享：物理后处理（位移、着地、动画、头发）=====
        postPhysics(dt, input) {
            const halfBody = 4;

            // ===== 水平：原作 MoveH 的 OnCollideH =====
            // wallCollideFn(edgeX, y, dir) 返回"被撞墙面的 x"，null 表示没撞。
            let blocked = null;   // 撞到的墙面 x
            if (this.wallCollideFn && this.state !== ST_CLIMB && this.vx !== 0) {
                const dir = Math.sign(this.vx);
                blocked = this.wallCollideFn(this.x + this.vx * dt + dir * halfBody, this.y, dir);
            }

            const collidedH = blocked !== null;   // 本帧是否发生水平碰撞（OnCollideH）

            // 原作 Dash corner correction（OnCollideH）：水平冲撞边沿时上下挪 ≤4px 继续走
            // 安装版 IL：StDash 与 StRedDash 共用该角修正分支
            if (blocked !== null && (this.state === ST_DASH || this.state === ST_RED_DASH) && this.vy === 0) {
                const dir = Math.sign(this.vx);
                let fixed = false;
                for (let i = 1; i <= DASH_CORNER_CORRECTION && !fixed; i++) {
                    for (let j = 1; j >= -1; j -= 2) {
                        if (this.wallCollideFn(this.x + dir * (1 + halfBody), this.y + i * j, dir) === null) {
                            this.y += i * j;
                            this.x += dir;
                            fixed = true;
                            break;
                        }
                    }
                }
                if (fixed) blocked = null;
            }

            // 原作 OnCollideH 内的 DreamDashCheck(UnitX * Sign(Speed.X))：
            // ★ 调用点在 DashCorrectCheck 角修正之后（player_collide_il.txt L137d99-137db5）
            if (collidedH && this.dreamDashCheck(Math.sign(this.vx), 0)) {
                const dir = Math.sign(this.vx);
                if (blocked !== null) this.x = dir > 0 ? blocked - halfBody : blocked + halfBody;
                this.beginDreamDash();
                this.updateSharedVisuals(dt);
                return;
            }

            if (blocked !== null) {
                const dir = Math.sign(this.vx);
                // 原作 Speed retention：撞墙记录速度，0.06s 内墙消失可返还
                if (this.wallSpeedRetentionTimer <= 0) {
                    this.wallSpeedRetained = this.vx;
                    this.wallSpeedRetentionTimer = WALL_SPEED_RETENTION_TIME;
                }
                this.x = dir > 0 ? blocked - halfBody : blocked + halfBody;
                this.vx = 0;
                this.wallSlideDir = dir;
                this.dashAttackTimer = 0;      // 原作：撞墙清 DashAttacking 窗口
                // 原作 OnCollideH：红球冲刺硬撞实心 → Speed.Y=0 / dashAttackTimer=0 → StHitSquash(6)
                // （安装版 IL 双证据：collide 里 State==5 → ldc.i4.6 set_State）
                if (this.state === ST_RED_DASH) {
                    this.vy = 0;
                    this.beginHitSquash();
                }
            } else {
                this.x += this.vx * dt;
            }

            // 原作 Player.Update 每帧重算：Speed.Y >= 0 且脚下有实心 → onGround。
            // 向上移动（跳跃 / 爬墙）时必须立刻离地，否则会被下面的贴地逻辑按回去。
            if (this.onGround && this.vy < 0) this.onGround = false;

            // ===== 垂直：Dash Floor Snapping（原作 Update 内）=====
            // 水平冲（DashDir.Y == 0）离地 ≤3px 时吸附到地面
            if (!this.onGround && this.dashAttacking && this.dashDir.y === 0 &&
                (this.state === ST_DASH || this.state === ST_RED_DASH)) {
                const fy = this.groundYFn(this.x);
                if (fy - this.y > 0 && fy - this.y <= DASH_V_FLOOR_SNAP_DIST) this.y = fy;
            }

            this.y += this.vy * dt;

            // ===== 天花板：原作 OnCollideV 的 Speed.Y < 0 分支 =====
            // 安装版 IL 逐条：num = UpwardCornerCorrection(4)，纵向冲刺时 5；
            //   ① Speed.X <= 0.01 → 向 -i 试探 Position + (-i,-1)，空则平移过去继续上升；
            //   ② Speed.X >= -0.01 → 向 +i 同理；
            //   ③ 都不行 → 撞停，且 varJumpTimer < 0.15 时清 0（不然会贴顶持续上浮）。
            // 旧版完全没有这一段：向上跳会直接穿头。
            if (this.vy < 0 && this.ceilingFn) {
                const cy = this.ceilingFn(this.x, this.y);
                if (cy !== null && this.y - BODY_H <= cy) {
                    let num = UPWARD_CORNER_CORRECTION;
                    if (this.dashAttacking && Math.abs(this.vx) < 0.01) num = 5;
                    let fixed = false;
                    if (this.vx <= 0.01) {
                        for (let i = 1; i <= num && !fixed; i++) {
                            if (this.ceilingFn(this.x - i, this.y - 1) === null) {
                                this.x -= i; this.y -= 1; fixed = true;
                            }
                        }
                    }
                    if (!fixed && this.vx >= -0.01) {
                        for (let i = 1; i <= num && !fixed; i++) {
                            if (this.ceilingFn(this.x + i, this.y - 1) === null) {
                                this.x += i; this.y -= 1; fixed = true;
                            }
                        }
                    }
                    if (!fixed) {
                        this.y = cy + BODY_H;          // 脚底贴到天花板下方
                        this.vy = 0;
                        if (this.varJumpTimer < UPWARD_CORRECTION_VARJUMP) this.varJumpTimer = 0;
                    }
                    // 原作 OnCollideV(向上)：角修正与 varJumpTimer 清零之后才 DreamDashCheck(UnitY*Sign(Speed.Y))
                    // （player_collide_il.txt L138102-13811e 位于向上角修正之后；否则擦边沿会误进梦境）
                    if (this.dreamDashCheck(0, -1)) {
                        this.beginDreamDash();
                        this.updateSharedVisuals(dt);
                        return;
                    }
                }
            }

            // ===== 地面碰撞 =====
            let gy = this.groundYFn(this.x);
            // 本帧是否发生「落地/触地」事件（原作 OnCollideV 被调用）：DreamDashCheck 在其后执行
            const groundHit = !this.onGround && this.vy >= 0 && this.y >= gy;
            if (this.onGround) {
                if (gy - this.y > 2) {
                    this.onGround = false;
                } else {
                    this.y = gy;
                    if (this.vy > 0) this.vy = 0;
                }
            }
            // 原作 OnCollideV(向下)：
            if (!this.onGround && this.vy >= 0 && this.y >= gy) {
                // 原作 Dash corner correction（OnCollideV）：下冲落地时若脚下是边沿，横向挪 ≤4px 滑过去
                // 安装版 IL：StDash 与 StRedDash 共用该角修正分支
                if ((this.state === ST_DASH || this.state === ST_RED_DASH) && !this.dashStartedOnGround && this.vy > 0) {
                    let fixed = false;
                    if (this.vx <= 0) {
                        for (let i = -1; i >= -DASH_CORNER_CORRECTION && !fixed; i--)
                            if (this.groundYFn(this.x + i) > this.y + 1) { this.x += i; this.y += 1; fixed = true; }
                    }
                    if (this.vx >= 0) {
                        for (let i = 1; i <= DASH_CORNER_CORRECTION && !fixed; i++)
                            if (this.groundYFn(this.x + i) > this.y + 1) { this.x += i; this.y += 1; fixed = true; }
                    }
                    if (fixed) gy = this.groundYFn(this.x);
                    else {
                        const landVy = this.vy;
                        this.y = gy; this.vy = 0; this.onGround = true;
                        // 原作 Dash Slide（OnCollideV）：向下冲落地 → vy=0、vx×1.2、蹲滑、DashDir.Y=0
                        if (this.dashDir.x !== 0 && this.dashDir.y > 0) this.dashSlide();
                        this.landEffects(landVy);
                        gy = this.groundYFn(this.x);
                        if (this.y < gy) { this.y = gy; }
                        // 原作 OnCollideV：红球冲刺硬撞地面 → StHitSquash(6)
                        if (this.state === ST_RED_DASH) this.beginHitSquash();
                    }
                } else {
                    const landVy = this.vy;
                    this.y = gy; this.vy = 0; this.onGround = true;
                    this.landEffects(landVy);
                    // 原作 OnCollideV：红球冲刺硬撞地面 → StHitSquash(6)
                    if (this.state === ST_RED_DASH) this.beginHitSquash();
                }
            }

            // 原作 OnCollideV(向下) 的 DreamDashCheck(UnitY * Sign(Speed.Y))：
            // ★ 在落地 + Dash 角修正（OnGround / MoveHExact / MoveVExact 循环）之后执行
            if (groundHit && this.dreamDashCheck(0, 1)) {
                this.beginDreamDash();
                this.updateSharedVisuals(dt);
                return;
            }

            // 最高点
            if (this.onGround) this.highestAirY = this.y;
            else this.highestAirY = Math.min(this.y, this.highestAirY);

            this.updateSharedVisuals(dt);
        }

        // ===== 所有状态共享的表现更新（原作 Player.Update 末尾的 UpdateSprite / 头发 / 残影）=====
        updateSharedVisuals(dt) {
            // idleTimer
            this.idleTimer += dt;
            if (this.vx !== 0 || this.vy !== 0) this.idleTimer = 0;

            // 所有状态共享的 squash 回弹
            this.scaleX = approach(this.scaleX, 1, SCALE_RECOVER * dt);
            this.scaleY = approach(this.scaleY, 1, SCALE_RECOVER * dt);

            // 动画更新（按当前状态分派）
            this.updateSpriteAnim();
            this.sprite.update(dt);

            // 头发
            const hm = this.sprite.hairMeta();
            this.hairHidden = !!hm.hide;
            this.hair.update(this.x, this.y, this.facing, hm.x, hm.y, dt, this.scaleY);

            // 冲刺残影（只读当前状态，不参与物理）
            this.updateDashTrail(dt);
        }

        // ===== 冲刺残影（表现层，不改任何物理量）=====
        updateDashTrail(dt) {
            for (let i = this.dashTrail.length - 1; i >= 0; i--) {
                const t = this.dashTrail[i];
                t.life -= dt;
                if (t.life <= 0) this.dashTrail.splice(i, 1);
            }
            if (this.state === ST_DREAM_DASH) {
                // 原作 StDreamDash 只在 CollideFirst<DreamBlock>(Position) != null 时才
                // OnInterval(.1f) CreateTrail()；dreamBlock 为空（已出块待收尾）不产生残影
                if (!this.dreamBlock) return;
                this.dreamTrailTimer -= dt;
                if (this.dreamTrailTimer > 0) return;
                this.dreamTrailTimer = DREAM_DASH_TRAIL_INTERVAL;
            } else if ((this.state !== ST_DASH && this.state !== ST_RED_DASH) || !this.dashSpeedSet) {
                return;
            }
            const img = trailTexture(this.sprite.texture(), this.hair.colorIdx || 0);
            if (!img) return;
            this.dashTrail.push({
                x: this.x, y: this.y, facing: this.facing,
                scaleX: this.scaleX, scaleY: this.scaleY,
                img, life: DASH_TRAIL_TIME, max: DASH_TRAIL_TIME
            });
            if (this.dashTrail.length > DASH_TRAIL_MAX) this.dashTrail.shift();
        }

        // 着地表现（squash + 摔倒动画 + 回调）
        landEffects(landVy) {
            const a = Math.min(landVy / FAST_MAX_FALL, 1);
            this.scaleX = lerp(1, 1.6, a);
            this.scaleY = lerp(1, 0.4, a);
            if (this.highestAirY < this.y - 50 && landVy >= MAX_FALL && Math.abs(this.vx) >= MAX_RUN)
                this.sprite.play('runStumble');
            if (this.onLand) this.onLand(landVy);
        }

        // ===== 动画状态机（逐条对齐 orig_UpdateSprite）=====
        updateSpriteAnim() {
            const S = this.sprite;
            const moveX = this._moveX, moveY = this._moveY;

            // —— State 2 / 5（Dash / RedDash）——
            // IL 228-234：DashAttacking && onGround && DashDir.Y==0 && !Ducking
            //             && Speed.X!=0 && moveX != Sign(Speed.X) → skid（超冲扬尘）
            //             Ducking → duck；否则 → dash
            // 旧版这里播 jumpFast，冲刺全程看到的是跳跃起手帧。
            if (this.state === ST_DASH || this.state === ST_RED_DASH) {
                if (this.dashAttacking && this.onGround && this.dashDir.y === 0 && !this.ducking &&
                    this.vx !== 0 && moveX !== Math.sign(this.vx)) {
                    S.play('skid');
                } else if (this.ducking) {
                    S.play('duck');
                } else {
                    S.play('dash');
                }
                return;
            }

            // —— State 9（DreamDash）——
            // Sprites.xml：dreamDashIn(0-3,0.04) → goto dreamDashLoop(4-16,0.03)；循环态只播 Loop
            if (this.state === ST_DREAM_DASH) {
                S.play(S.current === 'dreamDashLoop' ? 'dreamDashLoop' : 'dreamDashIn');
                return;
            }

            // —— 离开 State 9：原作 UpdateSprite 的 dreamDashOut 分支 ——
            // PlayerSprite.DreamDashing => LastAnimationID.StartsWith("dreamDash")
            // IL（player_normal_il.txt L14418-14434）：
            //   if (Sprite.DreamDashing && LastAnimationID != "dreamDashOut") Play("dreamDashOut");
            //   else if (CurrentAnimationID != "dreamDashOut") 才继续下面的普通分支
            if (S.last && S.last.indexOf('dreamDash') === 0 && S.last !== 'dreamDashOut') {
                S.play('dreamDashOut');
                return;
            }
            if (S.current === 'dreamDashOut') return;   // 收招动画播完（current=''）后自然交还状态机

            // —— State 1（Climb）——
            // IL：lastClimbMove<0 → climbUp；>0 → wallslide；
            //     面前 6px 无墙 → dangling；moveX == -Facing → climbLookBackStart/Back；否则 wallslide
            if (this.state === ST_CLIMB) {
                if (this.lastClimbMove < 0) {
                    S.play('climbup');
                } else if (this.lastClimbMove > 0) {
                    S.play('wallslide');
                } else if (!this.bodySolidAt(this.facing * CLIMB_DANGLE_PROBE, 0)) {
                    S.play('dangling');
                } else if (moveX === -this.facing) {
                    const back = S.current === 'climbLookBackStart' || S.current === 'climbLookBack';
                    S.play(back ? 'climbLookBack' : 'climbLookBackStart');
                } else {
                    S.play('wallslide');
                }
                return;
            }

            // 其余状态（Boost / Launch / HitSquash）不接管动画，沿用各自的表现
            if (this.state !== ST_NORMAL) return;

            // —— State 0：蹲下 ——
            // slide 是「蹲着还在滑行」的姿态（3 帧 0.03）；完全停住才是单帧 duck
            if (this.ducking) {
                S.play(this.onGround && Math.abs(this.vx) > 45 ? 'slide' : 'duck');
                return;
            }

            // —— State 0：地面 ——
            if (this.onGround) {
                this.fastJump = false;
                // ① push：朝墙推（原作 CollideCheck<Solid>(Position + UnitX*moveX)）
                if (moveX !== 0 && moveX === this.facing && this.bodySolidAt(moveX, 0)) {
                    S.play('push');
                    return;
                }
                // ② 静止 / 微动：edge → edgeBack → lookUp → idle
                //    原作三个探针 = CollideCheck<Solid>(Position + (Facing*2, 2)) / (Facing*4, 2) 等：
                //    身体整体前移并下探 2px 后全空 = 只有一点点搭在悬崖上 → 探身看边缘
                if (Math.abs(this.vx) <= 25 && moveX === 0) {
                    const f = this.facing;
                    if (!this.bodySolidAt(f * 2, 2) && !this.bodySolidAt(f * 4, 2)) {
                        S.play('edge');
                    } else if (!this.bodySolidAt(-f * 2, 2) && !this.bodySolidAt(-f * 4, 2)) {
                        S.play('edgeBack');
                    } else if (moveY === -1 && S.last !== 'lookUp') {
                        S.play('lookUp');
                    } else if (S.current.indexOf('idle') < 0) {
                        S.play('idle');
                    }
                    return;
                }
                // ③ 反向急转
                if (moveX !== 0 && Math.sign(this.vx) === -moveX) {
                    S.play(Math.abs(this.vx) > MAX_RUN ? 'skid' : 'flip');
                    return;
                }
                // ④ 跑
                if (!S.running) S.play(Math.abs(this.vx) < 45 ? 'runSlow' : 'runFast');
                return;
            }

            // —— State 0：空中 ——
            // wallslide 优先（IL：wallSlideDir != 0 && !Holding → wallslide，力竭时 tired）
            if (this.wallSlideDir !== 0) {
                S.play(this.isTired ? 'tired' : 'wallslide');
                return;
            }
            if (this.vy < 0) {
                if (this.fastJump || Math.abs(this.vx) > MAX_RUN) {
                    this.fastJump = true;
                    S.play('jumpFast');
                } else {
                    S.play('jumpSlow');
                }
            } else if (this.fastJump || this.vy >= MAX_FALL) {
                this.fastJump = true;
                if (S.last !== 'fallFast') S.play('fallFast');
            } else {
                S.play('fallSlow');
            }
        }

        draw(ctx, toScreen, zoom) {
            // 冲刺残影：画在人物下层（原作 PlayerSprite.CreateTrail 的叠加式残影）
            if (this.dashTrail.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (const t of this.dashTrail) {
                    const a = t.life / t.max;
                    const p = toScreen(t);
                    ctx.globalAlpha = a * a * 0.45;
                    ctx.save();
                    ctx.translate(Math.round(p.x), Math.round(p.y));
                    ctx.scale(Math.abs(t.scaleX) * t.facing * zoom, t.scaleY * zoom);
                    ctx.drawImage(t.img, -16, -32);
                    ctx.restore();
                }
                ctx.restore();
            }
            if (!this.hairHidden)
                this.hair.draw(ctx, toScreen, zoom, this.sprite.hairMeta().bang, this.scaleX);
            const img = this.sprite.texture();
            const p = toScreen({ x: this.x, y: this.y });
            if (img) {
                ctx.save();
                ctx.translate(Math.round(p.x), Math.round(p.y));
                ctx.scale(Math.abs(this.scaleX) * this.facing * zoom, this.scaleY * zoom);
                ctx.drawImage(img, -16, -32);
                ctx.restore();
            }
        }
    }

    // ===== 工厂 =====
    async function create(opts) {
        opts = opts || {};
        const base = opts.base || 'Atlases/Gameplay/characters/player';
        const color = opts.color || (window.CelesteHair ? CelesteHair.MADELINE : '#AC3232');
        const paths = {};
        // 每套动画加载几帧：取该 path 下所有动画引用到的最大帧号 + 1
        // （climb 目录有 0-14，但本引擎只用到 dangling 的 0-9）
        for (const id of Object.keys(ANIMS)) {
            const a = ANIMS[id];
            const last = Math.max.apply(null, a.frames);
            paths[a.path] = Math.max(paths[a.path] || 0, last + 1);
        }
        const textures = {};
        const jobs = [];
        for (const path of Object.keys(paths)) {
            const count = paths[path];
            textures[path] = new Array(count);
            for (let i = 0; i < count; i++) {
                const idx = i;
                jobs.push(loadImage(base + '/' + path + String(idx).padStart(2, '0') + '.png')
                    .then(img => { textures[path][idx] = img; }));
            }
        }
        const hairTex = await CelesteHair.load(base, color);
        await Promise.all(jobs);
        const ch = new Character(textures, new CelesteHair.Hair(hairTex, opts.hairCount || 4), opts);
        if (opts.x !== undefined) ch.x = opts.x;
        if (opts.y !== undefined) ch.y = opts.y;
        if (opts.facing) ch.facing = opts.facing;
        ch.hair.reset(ch.x, ch.y, ch.facing);
        return ch;
    }

    window.CelesteCharacter = { create, Character, ANIMS, HAIR, ST, STATE_NAMES };
})();
