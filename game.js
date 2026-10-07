// ==========================================
// DIRT PITCH - 2 Jogadores Locais (1v1)
// P1 (vermelho, esquerda): WASD + Q (forte) + E (fraco)
// P2 (azul, direita):      OKLÇ + P (forte) + I (fraco)
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Escala pixel-art
const PIXEL_SCALE = 3;
const VIEW_W = 480;
const VIEW_H = 180;
canvas.width = VIEW_W * PIXEL_SCALE;
canvas.height = VIEW_H * PIXEL_SCALE;
ctx.imageSmoothingEnabled = false;

// ==========================================
// TELA INICIAL
// ==========================================
const titleScreen = document.getElementById('titleScreen');
const playButton  = document.getElementById('playButton');

let gameStarted = false;

if (playButton) {
    playButton.addEventListener('click', () => {
        if (gameStarted) return;
        gameStarted = true;

        titleScreen.classList.add('fade-out');

        titleScreen.addEventListener('transitionend', () => {
            titleScreen.remove();
            startGame();
        }, { once: true });
    });
}

// ==========================================
// DIMENSÕES DO CAMPO E GOLS
// ==========================================
const FIELD_MARGIN = 6;

const GOAL_HEIGHT = 50;
const GOAL_DEPTH  = 8;
const GOAL_TOP    = (VIEW_H - GOAL_HEIGHT) / 2;
const GOAL_BOTTOM = GOAL_TOP + GOAL_HEIGHT;

const AREA_W = 40;
const AREA_H = 90;
const AREA_TOP    = (VIEW_H - AREA_H) / 2;
const AREA_BOTTOM = AREA_TOP + AREA_H;

// ==========================================
// INPUT (teclado apenas)
// ==========================================
const keys = {};

function normalizeKey(k) {
    k = k.toLowerCase();
    if (k === 'ç') return 'ç';
    if (k === 'c') return 'c';
    return k;
}

window.addEventListener('keydown', e => {
    const k = normalizeKey(e.key);
    keys[k] = true;

    const blocked = ['w','a','s','d','q','e','o','k','l','p','i','ç',' '];
    if (blocked.includes(k)) e.preventDefault();
});

window.addEventListener('keyup', e => {
    const k = normalizeKey(e.key);
    keys[k] = false;
});

// ==========================================
// UTILITÁRIOS
// ==========================================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ==========================================
// ESTADO DO JOGO
// ==========================================
const gameState = {
    scoreRed: 0,
    scoreBlue: 0,
    goalPause: 0,
    lastScorer: null,
};

function resetPositions() {
    // P1 (vermelho) — esquerda
    p1.x = VIEW_W / 2 - 60;
    p1.y = VIEW_H / 2;
    p1.vx = 0;
    p1.vy = 0;
    p1.facing.x = 1;
    p1.facing.y = 0;

    // P2 (azul) — direita
    p2.x = VIEW_W / 2 + 60;
    p2.y = VIEW_H / 2;
    p2.vx = 0;
    p2.vy = 0;
    p2.facing.x = -1;
    p2.facing.y = 0;

    // Bola no centro
    ball.x = VIEW_W / 2;
    ball.y = VIEW_H / 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.friction = 1.8;
    ball.owner = null;
}

// ==========================================
// CLASSE BASE: Actor
// ==========================================
class Actor {
    constructor(x, y, team) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.speed = 90;
        this.vx = 0;
        this.vy = 0;
        this.facing = { x: 1, y: 0 };
        this.team = team;

        this.ballOffset = this.radius + 3;
        this.kickCooldown = 0;
        this.color = '#e94b3c';
    }

    get defendingGoal() {
        return this.team === 'red' ? 'left' : 'right';
    }
    get attackingGoal() {
        return this.team === 'red' ? 'right' : 'left';
    }

    applyMovement(dt, dx, dy) {
        const len = Math.hypot(dx, dy);
        if (len > 0) {
            dx /= len;
            dy /= len;
            this.vx = dx * this.speed;
            this.vy = dy * this.speed;
            this.facing.x = dx;
            this.facing.y = dy;
        } else {
            this.vx = 0;
            this.vy = 0;
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        this.x = clamp(this.x, FIELD_MARGIN + this.radius, VIEW_W - FIELD_MARGIN - this.radius);
        this.y = clamp(this.y, FIELD_MARGIN + this.radius, VIEW_H - FIELD_MARGIN - this.radius);
    }

    tryGainPossession(ball) {
        if (ball.owner === this) return;

        if (ball.owner) {
            const d = dist(this, ball);
            const stealRange = this.radius + ball.radius + 1;
            if (d > stealRange) return;

            const ownerDist = dist(ball.owner, ball);
            if (d < ownerDist) {
                ball.owner = this;
                ball.vx = 0;
                ball.vy = 0;
            }
            return;
        }

        const d = dist(this, ball);
        const pickupRange = this.radius + ball.radius + 2;
        if (d < pickupRange) {
            ball.owner = this;
            ball.vx = 0;
            ball.vy = 0;
        }
    }

    updatePossession(ball) {
        if (ball.owner === this) {
            ball.x = this.x + this.facing.x * this.ballOffset;
            ball.y = this.y + this.facing.y * this.ballOffset;
            ball.vx = 0;
            ball.vy = 0;
        } else {
            this.tryGainPossession(ball);
        }
    }

    /**
     * Chuta a bola. `type` define força e comportamento.
     *   'strong' → chutão (mais rápido, mais longo)
     *   'weak'   → toque curto (mais lento, para mais rápido)
     */
    kick(ball, type = 'strong') {
        if (ball.owner !== this) return;

        const KICK_TYPES = {
            strong: { baseSpeed: 420, friction: 1.8, cooldown: 0.20 },
            weak:   { baseSpeed: 180, friction: 3.5, cooldown: 0.12 },
        };

        const cfg = KICK_TYPES[type] || KICK_TYPES.strong;

        const nx = this.facing.x;
        const ny = this.facing.y;

        ball.owner = null;
        ball.x = this.x + nx * this.ballOffset;
        ball.y = this.y + ny * this.ballOffset;
        ball.vx = nx * cfg.baseSpeed;
        ball.vy = ny * cfg.baseSpeed;

        ball.friction = cfg.friction;

        this.kickCooldown = cfg.cooldown;
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(
            this.x,
            this.y + this.radius - 1,
            this.radius,
            this.radius * 0.4,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = this.color;
        ctx.fillRect(
            Math.round(this.x - this.radius),
            Math.round(this.y - this.radius),
            this.radius * 2,
            this.radius * 2
        );

        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            Math.round(this.x - this.radius) + 0.5,
            Math.round(this.y - this.radius) + 0.5,
            this.radius * 2 - 1,
            this.radius * 2 - 1
        );

        ctx.fillStyle = '#fff';
        const fx = this.x + this.facing.x * (this.radius - 1);
        const fy = this.y + this.facing.y * (this.radius - 1);
        ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 2, 2);
    }
}

// ==========================================
// CLASSE: Player
// ==========================================
class Player extends Actor {
    constructor(x, y, team, controls) {
        super(x, y, team);
        this.controls = controls;
        this.color = team === 'red' ? '#e94b3c' : '#3a86ff';
        this.speed = 90;
    }

    update(dt, ball) {
        if (this.kickCooldown > 0) this.kickCooldown -= dt;

        let dx = 0, dy = 0;
        if (keys[this.controls.up])    dy -= 1;
        if (keys[this.controls.down])  dy += 1;
        if (keys[this.controls.left])  dx -= 1;
        if (keys[this.controls.right]) dx += 1;

        this.applyMovement(dt, dx, dy);
        this.updatePossession(ball);

        // Chute fraco primeiro (tem prioridade se ambos pressionados no mesmo frame)
        if (keys[this.controls.kickWeak]) {
            this.kick(ball, 'weak');
            keys[this.controls.kickWeak] = false;
        }

        // Chute forte
        if (keys[this.controls.kickStrong]) {
            this.kick(ball, 'strong');
            keys[this.controls.kickStrong] = false;
        }
    }
}

// ==========================================
// CLASSE: Ball
// ==========================================
class Ball {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 4;
        this.vx = 0;
        this.vy = 0;
        this.friction = 1.8;
        this.owner = null;
    }

    update(dt) {
        if (this.owner) return;

        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 0) {
            const newSpeed = Math.max(0, speed - this.friction * 60 * dt);
            const scale = newSpeed / speed;
            this.vx *= scale;
            this.vy *= scale;

            if (newSpeed < 1) {
                this.vx = 0;
                this.vy = 0;
                this.friction = 1.8; // volta ao atrito padrão quando para
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // Topo e base
        if (this.y - this.radius < FIELD_MARGIN) {
            this.y = FIELD_MARGIN + this.radius;
            this.vy = -this.vy * 0.6;
        }
        if (this.y + this.radius > VIEW_H - FIELD_MARGIN) {
            this.y = VIEW_H - FIELD_MARGIN - this.radius;
            this.vy = -this.vy * 0.6;
        }

        const inGoalY = this.y > GOAL_TOP && this.y < GOAL_BOTTOM;

        // Gol ESQUERDO = defendido pelo VERMELHO (P1) → ponto pro AZUL (P2)
        if (this.x - this.radius < FIELD_MARGIN) {
            if (inGoalY) {
                if (this.x - this.radius < FIELD_MARGIN - GOAL_DEPTH) {
                    this.registerGoal('left');
                    return;
                }
            } else {
                this.x = FIELD_MARGIN + this.radius;
                this.vx = -this.vx * 0.6;
            }
        }

        // Gol DIREITO = defendido pelo AZUL (P2) → ponto pro VERMELHO (P1)
        if (this.x + this.radius > VIEW_W - FIELD_MARGIN) {
            if (inGoalY) {
                if (this.x + this.radius > VIEW_W - FIELD_MARGIN + GOAL_DEPTH) {
                    this.registerGoal('right');
                    return;
                }
            } else {
                this.x = VIEW_W - FIELD_MARGIN - this.radius;
                this.vx = -this.vx * 0.6;
            }
        }
    }

    registerGoal(side) {
        if (side === 'left') {
            gameState.scoreBlue++;
            gameState.lastScorer = 'blue';
        } else {
            gameState.scoreRed++;
            gameState.lastScorer = 'red';
        }

        gameState.goalPause = 1.4;
        this.vx = 0;
        this.vy = 0;
    }

    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.beginPath();
        ctx.ellipse(
            this.x,
            this.y + this.radius - 1,
            this.radius,
            this.radius * 0.4,
            0, 0, Math.PI * 2
        );
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111';
        ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 2, 2);
    }
}

// ==========================================
// CENA
// ==========================================

// P1 (VERMELHO, esquerda) — WASD + Q (forte) + E (fraco)
const P1_CONTROLS = {
    up: 'w',
    down: 's',
    left: 'a',
    right: 'd',
    kickStrong: 'q',
    kickWeak:   'e',
};

// P2 (AZUL, direita) — OKLÇ + P (forte) + I (fraco)
const P2_CONTROLS = {
    up: 'o',
    down: 'l',
    left: 'k',
    right: 'ç',
    kickStrong: 'p',
    kickWeak:   'i',
};

const p1   = new Player(VIEW_W / 2 - 60, VIEW_H / 2, 'red',  P1_CONTROLS);
const p2   = new Player(VIEW_W / 2 + 60, VIEW_H / 2, 'blue', P2_CONTROLS);
const ball = new Ball(VIEW_W / 2, VIEW_H / 2);

// ==========================================
// CAMPO
// ==========================================
function drawField(ctx) {
    ctx.fillStyle = '#3d6b3d';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.fillStyle = '#467a46';
    const stripeH = 16;
    for (let y = 0; y < VIEW_H; y += stripeH * 2) {
        ctx.fillRect(0, y, VIEW_W, stripeH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        FIELD_MARGIN + 0.5,
        FIELD_MARGIN + 0.5,
        VIEW_W - FIELD_MARGIN * 2 - 1,
        VIEW_H - FIELD_MARGIN * 2 - 1
    );

    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + 0.5, FIELD_MARGIN);
    ctx.lineTo(VIEW_W / 2 + 0.5, VIEW_H - FIELD_MARGIN);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(VIEW_W / 2, VIEW_H / 2, 20, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeRect(FIELD_MARGIN + 0.5, AREA_TOP + 0.5, AREA_W, AREA_H - 1);
    ctx.strokeRect(VIEW_W - FIELD_MARGIN - AREA_W + 0.5, AREA_TOP + 0.5, AREA_W, AREA_H - 1);

    // Gol esquerdo (defendido pelo VERMELHO / P1)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(FIELD_MARGIN - GOAL_DEPTH, GOAL_TOP, GOAL_DEPTH, GOAL_HEIGHT);
    ctx.fillStyle = '#e94b3c';
    ctx.fillRect(FIELD_MARGIN - 1, GOAL_TOP - 1, 2, GOAL_HEIGHT + 2);

    // Gol direito (defendido pelo AZUL / P2)
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(VIEW_W - FIELD_MARGIN, GOAL_TOP, GOAL_DEPTH, GOAL_HEIGHT);
    ctx.fillStyle = '#3a86ff';
    ctx.fillRect(VIEW_W - FIELD_MARGIN - 1, GOAL_TOP - 1, 2, GOAL_HEIGHT + 2);
}

// ==========================================
// HUD
// ==========================================
function drawHUD(ctx) {
    // Placar
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(VIEW_W / 2 - 44, 2, 88, 14);

    ctx.fillStyle = '#e94b3c';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${gameState.scoreRed}`, VIEW_W / 2 - 18, 12);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('x', VIEW_W / 2, 12);

    ctx.fillStyle = '#3a86ff';
    ctx.textAlign = 'left';
    ctx.fillText(`${gameState.scoreBlue}`, VIEW_W / 2 + 18, 12);
    ctx.textAlign = 'left';

    // Faixa inferior com instruções
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, VIEW_H - 12, VIEW_W, 12);

    ctx.fillStyle = '#e94b3c';
    ctx.font = '6px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('P1: WASD | Q forte | E fraco', 4, VIEW_H - 4);

    ctx.fillStyle = '#3a86ff';
    ctx.textAlign = 'right';
    ctx.fillText('P2: O K L Ç | P forte | I fraco', VIEW_W - 4, VIEW_H - 4);
    ctx.textAlign = 'left';

    // Mensagem de gol
    if (gameState.goalPause > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(0, VIEW_H / 2 - 12, VIEW_W, 24);

        ctx.fillStyle = '#ffeb3b';
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';

        const txt = gameState.lastScorer === 'red'
            ? 'P1 (VERMELHO) MARCOU!'
            : 'P2 (AZUL) MARCOU!';
        ctx.fillText(txt, VIEW_W / 2, VIEW_H / 2 + 4);
        ctx.textAlign = 'left';
    }
}

// ==========================================
// GAME LOOP
// ==========================================
let lastTime = performance.now();

function loop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (gameState.goalPause > 0) {
        gameState.goalPause -= dt;
        if (gameState.goalPause <= 0) {
            gameState.goalPause = 0;
            gameState.lastScorer = null;
            resetPositions();
        }
    } else {
        p1.update(dt, ball);
        p2.update(dt, ball);
        ball.update(dt);
    }

    ctx.save();
    ctx.scale(PIXEL_SCALE, PIXEL_SCALE);

    drawField(ctx);
    ball.draw(ctx);
    p1.draw(ctx);
    p2.draw(ctx);

    // Indicador de posse
    if (ball.owner === p1) {
        ctx.fillStyle = 'rgba(233,75,60,0.9)';
        ctx.font = '6px monospace';
        ctx.fillText('P1 (VERMELHO) COM A BOLA', 4, 10);
    } else if (ball.owner === p2) {
        ctx.fillStyle = 'rgba(58,134,255,0.9)';
        ctx.font = '6px monospace';
        ctx.fillText('P2 (AZUL) COM A BOLA', 4, 10);
    }

    drawHUD(ctx);
    ctx.restore();

    requestAnimationFrame(loop);
}

// ==========================================
// INÍCIO DO JOGO (chamado após o fade-out da tela inicial)
// ==========================================
function startGame() {
    lastTime = performance.now();
    requestAnimationFrame(loop);
}