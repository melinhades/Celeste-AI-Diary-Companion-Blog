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
    const ST_CLIMB = 1;
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
    const SUPER_WALL_JUMP_FORCE_TIME = 0.2;    // SuperWallJumpForceTime
    const SUPER_WALL_JUMP_H = MAX_RUN + JUMP_HBOOST * 2; // 170

    // 状态
    const ST_NORMAL = 0;
    const ST_DASH = 2;

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
        flip:       { path: 'flip',       delay: 0.04, frames: range(0, 7),                  goto: 'runFast' },
        skid:       { path: 'flip',       delay: 0.04, frames: [8],         loop: true },
        runStumble: { path: 'runStumble', delay: 0.05, frames: [10, 11].concat(range(0, 11)), goto: 'runFast' }
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
        flip:   parseHair('-1,-1:2|-1,-1:1|0,-1:1|1,-1:0|1,-1:0|1,0:0|2,0:0|2,0:0|2,0:0'),
        runStumble: parseHair('1,1|1,2|1,2|1,0|1,-2|1,-2|1,-1|1,-1|1,-1|1,-1|1,-3|1,-2')
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
            const m = t && t[this.frameFileIndex()];
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
            this.ultraDashPending = false;
            this.wasDashing = false;
            this.lastClimbMove = 0;        // -1=up, 0=still, +1=down
            this.climbNoMoveTimer = 0;
            this.climbWallDir = 0;          // -1=左墙, +1=右墙
            this.wasTired = false;

            // Dash 状态变量
            this.dashes = 1;
            this.dashTime = 0;
            this.dashDir = { x: 1, y: 0 };
            this.dashCooldownTimer = 0;
            this.dashRefillCooldownTimer = 0;
            this.dashAttackTimer = 0;
            this.dashStartedOnGround = false;
            this.autoJump = false;
            this.autoJumpTimer = 0;
            this.forceMoveX = 0;
            this.forceMoveXTimer = 0;

            // Wall slide / Wall jump
            this.wallSlideTimer = WALL_SLIDE_TIME;
            this.wallSlideDir = 0;
            this.wallSpeedRetentionTimer = 0;
            this.wallSpeedRetained = 0;
            this.wallBoostTimer = 0;
            this.wallBoostDir = 0;

            // Hair / 回调
            this.groundYFn = () => 0;
            this.wallAtFn = null;              // (x, facing) => wallX | null（宽容，用于爬墙检测）
            this.wallCollideFn = null;         // (x, facing) => bool（严格，用于物理阻挡）
            this.onLand = null;
            this._moveX = 0; this._moveY = 0;
            const self = this;
            this.sprite.idleTimerRef = () => self.idleTimer;
        }

        get anim() { return this.sprite.current || this.sprite.last; }

        setGround(fn) { this.groundYFn = fn; }
        setWallAt(fn) { this.wallAtFn = fn; }
        // setWallCollideFn(fn): fn(x, facing) 返回 true 表示该方向有严格物理阻挡（碰撞用）
        setWallCollideFn(fn) { this.wallCollideFn = fn; }

        // ===== 进入 Climb 状态（ClimbBegin）=====
        beginClimb(dir) {
            this.state = ST_CLIMB;
            this.climbWallDir = dir;        // -1 或 +1
            this.vx = 0;
            this.climbNoMoveTimer = CLIMB_NO_MOVE_TIME;
            this.forceMoveX = -dir;         // 贴墙站立（离开墙的方向）
            this.forceMoveXTimer = 0.1;
            if (this.sprite.current === 'jumpFast' || this.sprite.current === 'jumpSlow') {
                this.sprite.play('fallSlow');
            }
        }

        // ===== 退出 Climb 状态（ClimbEnd）=====
        endClimb() {
            this.state = ST_NORMAL;
            this.climbWallDir = 0;
            this.climbNoMoveTimer = 0;
        }

        // ===== 进入 Dash 状态（DashBegin）=====
        beginDash(dirX, dirY, onGroundAtStart) {
            this.state = ST_DASH;
            // 8 方向归一化
            const mag = Math.hypot(dirX, dirY) || 1;
            this.dashDir = { x: dirX / mag, y: dirY / mag };
            this.dashTime = DASH_TIME;
            this.vx = this.dashDir.x * DASH_SPEED;
            this.vy = this.dashDir.y * DASH_SPEED;
            this.dashes = Math.max(0, this.dashes - 1);
            this.dashCooldownTimer = DASH_COOLDOWN;
            this.dashRefillCooldownTimer = DASH_REFILL_COOLDOWN;
            this.dashAttackTimer = DASH_ATTACK_TIME;
            this.dashStartedOnGround = !!onGroundAtStart;
            this.ducking = false;
            this.scaleX = 0.6; this.scaleY = 1.4;
            this.facing = Math.sign(dirX) || this.facing;
            // 原作 FlyPowerHairColor：冲刺瞬间头发闪黄
            this.hair.setColor(2);  // fly
        }

        // ===== 退出 Dash 状态（DashEnd）=====
        endDash() {
            // 原作：Speed = DashDir * EndDashSpeed；若向上则 Speed.Y *= 0.75
            this.vx = this.dashDir.x * END_DASH_SPEED;
            this.vy = this.dashDir.y * END_DASH_SPEED;
            if (this.dashDir.y < 0) this.vy *= END_DASH_UP_MULT;
            this.state = ST_NORMAL;
            // 着地冲刺起跳自动跳（原作 AutoJump / BounceAutoJumpTime=0.1）
            if (this.dashStartedOnGround) {
                this.autoJump = true;
                this.autoJumpTimer = 0.1;
            }
            // UltraDash 标记（postPhysics 着地时触发 DodgeSlideSpeedMult=1.2）
            this.wasDashing = true;
            this.ultraDashPending = this.dashDir.y > 0;   // 向下方向才触发
            // 头发颜色：dashes 用完 → 蓝（UsedHairColor），否则红（NormalHairColor）
            this.hair.setColor(this.dashes <= 0 ? 1 : 0);
        }

        // ===== 原作 Jump() =====
        jump() {
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
        }

        // ===== ClimbJump（爬墙跳）=====
        climbJump() {
            this.jumpBufferTimer = 0;
            this.jumpGraceTimer = 0;
            this.varJumpTimer = VAR_JUMP_TIME;
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
                leftWallX = this.wallAtFn(this.x, -1);
                rightWallX = this.wallAtFn(this.x, +1);
            }
            // 宽容匹配：wallAtFn 已经在附近时返回墙位置
            const onLeft = leftWallX !== null;
            const onRight = rightWallX !== null;
            return { onLeft, onRight, leftWallX, rightWallX };
        }

        // ===== 主入口：按当前状态分派 =====
        update(dt, input) {
            // 原作 Player.Update 开头的 timer bookkeeping（在 base.Update 之前）
            // 着地恢复 stamina / dash
            if (this.onGround) {
                this.stamina = CLIMB_MAX_STAMINA;
                if (this.dashRefillCooldownTimer <= 0 && this.dashes < 1) {
                    this.dashes = 1;
                    // 原作：dashes 恢复 → 头发从 UsedHairColor(蓝) 变回 NormalHairColor(红)
                    this.hair.setColor(0);
                }
                this.wallSlideTimer = WALL_SLIDE_TIME;
            }
            if (this.dashCooldownTimer > 0) this.dashCooldownTimer -= dt;
            if (this.dashRefillCooldownTimer > 0) this.dashRefillCooldownTimer -= dt;
            if (this.dashAttackTimer > 0) this.dashAttackTimer -= dt;
            if (this.jumpGraceTimer > 0) this.jumpGraceTimer -= dt;
            if (this.varJumpTimer > 0) this.varJumpTimer -= dt;
            if (this.autoJumpTimer > 0) this.autoJumpTimer -= dt;
            if (this.forceMoveXTimer > 0) this.forceMoveXTimer -= dt;
            else this.forceMoveX = 0;
            if (this.wallSlideTimer > 0 && this.wallSlideDir !== 0)
                this.wallSlideTimer -= dt;
            if (this.wallBoostTimer > 0) this.wallBoostTimer -= dt;
            if (this.wallSpeedRetentionTimer > 0) this.wallSpeedRetentionTimer -= dt;

            // 跳跃输入缓冲
            if (input.jumpPressed) this.jumpBufferTimer = JUMP_BUFFER_TIME;
            else if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;

            // ==== 方向（按原作顺序）====
            const moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            const moveY = (input.down ? 1 : 0) + (input.up ? -1 : 0);
            this._moveX = moveX; this._moveY = moveY;

            // ForceMoveX 覆盖
            const effMoveX = this.forceMoveXTimer > 0 ? this.forceMoveX : moveX;

            // 朝向更新
            if (effMoveX !== 0) {
                if (effMoveX !== this.facing && this.ducking) { this.scaleX = 0.8; this.scaleY = 1.2; }
                this.facing = effMoveX;
            }

            // ===== 检查 dash 输入（任何状态都可触发，除了已在 dash）=====
            if (this.state !== ST_DASH && input.dashPressed &&
                this.dashes > 0 && this.dashCooldownTimer <= 0) {
                this.beginDash(
                    input.aimX !== undefined ? input.aimX : effMoveX,
                    input.aimY !== undefined ? input.aimY : moveY,
                    this.onGround
                );
                // dash 触发后跳过下面 NormalUpdate 的墙滑检测
            }

            // ===== 分派 =====
            if (this.state === ST_NORMAL) {
                this.normalUpdate(dt, input, effMoveX, moveY);
            } else if (this.state === ST_CLIMB) {
                this.climbUpdate(dt, input, effMoveX, moveY);
            } else if (this.state === ST_DASH) {
                this.dashUpdate(dt, input, effMoveX, moveY);
            }

            // ===== 着地 + Scale 回弹 + Sprite 更新（所有状态共享）=====
            this.postPhysics(dt, input);
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
                // 墙滑：检测是否贴墙
                const wi = this.getWallInfo();
                const wallSliding = !this.ducking && (
                    (wi.onLeft && moveX <= 0 && (input.grabHeld || moveX === 0) && moveY !== 1 && this.vy >= 0) ||
                    (wi.onRight && moveX >= 0 && (input.grabHeld || moveX === 0) && moveY !== 1 && this.vy >= 0)
                );

                if (wallSliding) {
                    this.wallSlideDir = wi.onLeft ? -1 : +1;
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

            // —— 自动跳（dash 落地后 AutoJump）——
            if (this.autoJump && this.onGround) {
                this.autoJump = false;
                this.jump();
            }

            // —— 跳跃触发（缓冲 × 土狼）——
            if (this.jumpBufferTimer > 0 && this.jumpGraceTimer > 0) {
                if (this.wallSlideDir !== 0 && !this.onGround) {
                    // 墙跳
                    this.wallJump(this.wallSlideDir);
                } else {
                    this.jump();
                }
            } else if (this.jumpBufferTimer > 0 && this.wallSlideDir !== 0 && !this.onGround) {
                // 墙跳（允许在土狼期外但墙滑中触发）
                this.jumpBufferTimer = 0;
                this.wallJump(this.wallSlideDir);
            }

            // —— 进入 Climb：grab + 贴墙 ——
            if (!this.onGround && input.grabHeld && this.state === ST_NORMAL) {
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

            if (!wallHeld || letGo || this.stamina <= 0) {
                // 退出 Climb
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
            else if (climbMove === 1) targetVy = CLIMB_DOWN_SPEED;  // 80
            // 饥饿滑落
            if (this.stamina <= CLIMB_TIRED_THRESHOLD) {
                targetVy = Math.max(targetVy, CLIMB_SLIP_SPEED);  // 30
            }

            this.vy = approach(this.vy, targetVy, CLIMB_ACCEL * dt);
            // 水平贴墙
            this.vx = 0;

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

            // —— 着地 → 退出 Climb ——
            if (this.onGround) {
                this.endClimb();
                return;
            }
        }

        // ===== DashUpdate（8 方向冲刺）=====
        dashUpdate(dt, input, moveX, moveY) {
            this.dashTime -= dt;

            // 冲刺期间保持 DashSpeed × 方向
            // 但水平碰到墙会触发 WallBounce（SuperWallJump）
            const wi = this.getWallInfo();

            // WallBounce（SuperWallJump）：水平方向撞墙，反弹 + SuperWallJumpSpeed=-160
            // 原作 Player.DashUpdate 里：WallBounce 只在"按方向键朝墙时"触发（moveX 匹配），
            // 否则 grabHeld 会让 dash 直接转 Climb。
            // 统一公式：反弹 vx = -SUPER_WALL_JUMP_H * sign(dashDir.x)
            //  dashDir.x=-1（朝左撞左墙）→ vx = -170*(-1) = +170（向右反弹） ✓
            //  dashDir.x=+1（朝右撞右墙）→ vx = -170*(+1) = -170（向左反弹） ✓
            const hittingLeft  = this.dashDir.x < 0 && wi.onLeft;
            const hittingRight = this.dashDir.x > 0 && wi.onRight;
            if (hittingLeft || hittingRight) {
                const dirX = Math.sign(this.dashDir.x);   // -1 或 +1
                this.vx = -SUPER_WALL_JUMP_H * dirX;      // 反向反弹
                this.vy = SUPER_WALL_JUMP_SPEED;          // -160
                this.dashDir.x = -dirX;                   // 反转 dashDir
                this.varJumpTimer = SUPER_WALL_JUMP_VAR_TIME;
                this.varJumpSpeed = this.vy;
                this.wallSlideTimer = WALL_SLIDE_TIME;
                this.jumpGraceTimer = 0;
                this.jumpBufferTimer = 0;
                this.autoJump = false;
                this.dashCooldownTimer = DASH_COOLDOWN;
                this.scaleX = 0.6; this.scaleY = 1.4;
                this.state = ST_NORMAL;
                // WallBounce 没走 endDash，手动恢复头发颜色（dashes 已用完所以用蓝）
                this.hair.setColor(this.dashes <= 0 ? 1 : 0);
                return;
            }

            // 贴墙 + 按方向 → 进入 Climb
            if (input.grabHeld && !this.onGround) {
                const grabDir = (wi.onLeft && this.dashDir.x <= 0) ? -1 :
                                (wi.onRight && this.dashDir.x >= 0) ? +1 : 0;
                if (grabDir !== 0) {
                    this.endDash();
                    this.beginClimb(grabDir);
                    return;
                }
            }

            // 着地 → 自动 AutoJump（但不立即触发，等 NormalUpdate 的 autoJumpTimer 消耗）
            // 冲刺到地上也可以直接取消 dash 进入 normal，然后 NormalUpdate 消耗 autoJump

            // 冲刺结束
            // 浮点容差：9 帧 @ 60Hz 累加 dashTime 后会剩 +2e-17（正），需用 abs 容差
            if (this.dashTime <= 0 || Math.abs(this.dashTime) < 1e-9) {
                this.endDash();
            }
        }

        // ===== 共享：物理后处理（位移、着地、动画、头发）=====
        postPhysics(dt, input) {
            // 水平位移（带墙碰撞）
            const stepX = this.vx * dt;
            this.x += stepX;

            // 墙碰撞（严格 OnCollideH）
            if (this.wallCollideFn && this.state !== ST_CLIMB) {
                const halfBody = 4;
                if (this.vx > 0 && this.wallCollideFn(this.x + halfBody, +1)) {
                    this.x -= (this.x + halfBody) - Math.floor(this.x + halfBody);
                    this.vx = 0;
                    this.wallSlideDir = +1;
                } else if (this.vx < 0 && this.wallCollideFn(this.x - halfBody, -1)) {
                    this.vx = 0;
                    this.wallSlideDir = -1;
                }
            }

            // 垂直位移
            this.y += this.vy * dt;

            // 地面碰撞
            const gy = this.groundYFn(this.x);
            if (this.onGround) {
                if (gy - this.y > 2) {
                    this.onGround = false;
                } else {
                    this.y = gy;
                    if (this.vy > 0) this.vy = 0;
                }
            }
            if (!this.onGround && this.vy >= 0 && this.y >= gy) {
                const landVy = this.vy;
                this.y = gy; this.vy = 0; this.onGround = true;
                const a = Math.min(landVy / FAST_MAX_FALL, 1);
                this.scaleX = lerp(1, 1.6, a);
                this.scaleY = lerp(1, 0.4, a);
                if (this.highestAirY < this.y - 50 && landVy >= MAX_FALL && Math.abs(this.vx) >= MAX_RUN)
                    this.sprite.play('runStumble');
                // UltraDash：down-diagonal dash 着地时 vx *= DodgeSlideSpeedMult
                // 原作：NormalUpdate 着地判定里检测 wasDashing + downDir + vx≠0
                if (this.ultraDashPending) {
                    this.vx *= DODGE_SLIDE_SPEED_MULT;
                    this.ultraDashPending = false;
                }
                // 着地后立刻补满 dash
                if (this.onLand) this.onLand(landVy);
            }

            // 最高点
            if (this.onGround) this.highestAirY = this.y;
            else this.highestAirY = Math.min(this.y, this.highestAirY);

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
        }

        // ===== 动画状态机（按状态分派）=====
        updateSpriteAnim() {
            const S = this.sprite;
            if (this.ducking && this.state === ST_NORMAL) { S.play('duck'); return; }
            if (this.state === ST_CLIMB) {
                // Climb 没有单独帧图，复用 fallSlow
                if (!S.current.startsWith('fall')) S.play('fallSlow');
                return;
            }
            if (this.state === ST_DASH) {
                if (!S.current.startsWith('jump')) S.play('jumpFast');
                return;
            }
            if (this.onGround) {
                this.fastJump = false;
                if (Math.abs(this.vx) <= 25 && this._moveX === 0) {
                    if (this._moveY === -1) {
                        if (S.last !== 'lookUp') S.play('lookUp');
                    } else if (!S.current.includes('idle')) {
                        S.play('idle');
                    }
                } else if (Math.sign(this.vx) === -this._moveX && this._moveX !== 0) {
                    if (Math.abs(this.vx) > MAX_RUN) S.play('skid');
                    else if (S.current !== 'skid') S.play('flip');
                } else if (!S.running) {
                    S.play(Math.abs(this.vx) < 45 ? 'runSlow' : 'runFast');
                }
            } else if (this.vy < 0) {
                if (this.fastJump || Math.abs(this.vx) > MAX_RUN) {
                    this.fastJump = true; S.play('jumpFast');
                } else S.play('jumpSlow');
            } else {
                if (this.fastJump || this.vy >= MAX_FALL) {
                    this.fastJump = true;
                    if (S.last !== 'fallFast') S.play('fallFast');
                } else S.play('fallSlow');
            }
        }

        draw(ctx, toScreen, zoom) {
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
        for (const id of Object.keys(ANIMS)) paths[ANIMS[id].path] = true;
        const textures = {};
        const jobs = [];
        for (const path of Object.keys(paths)) {
            const count = HAIR[path].length;
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

    window.CelesteCharacter = { create, Character, ANIMS, HAIR };
})();
