// ==========================================
// DIRT PITCH - Protótipo de Jogabilidade
// Sistema de Posse de Bola + Campo largo + Gols
// ==========================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Escala pixel-art
const PIXEL_SCALE = 3;
const VIEW_W = 480;  // <<<< aumentado de 320 para 480
const VIEW_H = 180;
canvas.width = VIEW_W * PIXEL_SCALE;
canvas.height = VIEW_H * PIXEL_SCALE;
ctx.imageSmoothingEnabled = false;

// ==========================================
// DIMENSÕES DO CAMPO E GOLS
// ==========================================
// Margem interna do campo (linha branca)
const FIELD_MARGIN = 6;

// Gol: altura (Y) e profundidade (X)
const GOAL_HEIGHT = 50;                          // altura da boca do gol
const GOAL_DEPTH  = 8;                           // profundidade visual
const GOAL_TOP    = (VIEW_H - GOAL_HEIGHT) / 2;  // Y superior da boca
const GOAL_BOTTOM = GOAL_TOP + GOAL_HEIGHT;      // Y inferior da boca

// Área (pequena área) — retângulo branco em volta do gol
const AREA_W = 40;   // largura horizontal da área
const AREA_H = 90;   // altura vertical da área
const AREA_TOP    = (VIEW_H - AREA_H) / 2;
const AREA_BOTTOM = AREA_TOP + AREA_H;

// ==========================================
// INPUT
// ==========================================
const keys = {};
const mouse = { x: VIEW_W / 2, y: VIEW_H / 2 };

window.addEventListener('keydown', e => {
    keys[e.key.toLowerCase()] = true;
    if (['w','a','s','d','q',' '].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) / PIXEL_SCALE;
    mouse.y = (e.clientY - rect.top) / PIXEL_SCALE;
});

// ==========================================
// UTILITÁRIOS
// ==========================================
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ==========================================
// ESTADO DO JOGO (placar e reset)
// ==========================================
const gameState = {
    scoreLeft: 0,   // gols marcados no gol ESQUERDO (jogador ataca pra esquerda)
    scoreRight: 0,  // gols marcados no gol DIREITO
    goalPause: 0,   // tempo de pausa após gol (segundos)
    lastScorer: null, // 'left' ou 'right' para mostrar mensagem
};

function resetPositions() {
    player.x = VIEW_W / 2;
    player.y = VIEW_H / 2;
    player.vx = 0;
    player.vy = 0;
    player.facing.x = 1;
    player.facing.y = 0;

    ball.x = VIEW_W / 2 + 40;
    ball.y = VIEW_H / 2;
    ball.vx = 0;
    ball.vy = 0;
    ball.owner = null;
}

// ==========================================
// CLASSE: Player
// ==========================================
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 6;
        this.speed = 90;
        this.vx = 0;
        this.vy = 0;
        this.facing = { x: 1, y: 0 };

        this.ballOffset = this.radius + 3;
        this.kickCooldown = 0;
    }

    update(dt, ball) {
        if (this.kickCooldown > 0) this.kickCooldown -= dt;

        // --- Movimento WASD ---
        let dx = 0, dy = 0;
        if (keys['w']) dy -= 1;
        if (keys['s']) dy += 1;
        if (keys['a']) dx -= 1;
        if (keys['d']) dx += 1;

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

        // Limita ao CAMPO (dentro da margem), não ao canvas inteiro
        this.x = clamp(this.x, FIELD_MARGIN + this.radius, VIEW_W - FIELD_MARGIN - this.radius);
        this.y = clamp(this.y, FIELD_MARGIN + this.radius, VIEW_H - FIELD_MARGIN - this.radius);

        this.updatePossession(ball);

        if (keys['q']) {
            this.kick(ball);
            keys['q'] = false;
        }
    }

    tryGainPossession(ball) {
        if (ball.owner) return;
        if (this.kickCooldown > 0) return;

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
            const mdx = mouse.x - this.x;
            const mdy = mouse.y - this.y;
            const md = Math.hypot(mdx, mdy);

            let fx, fy;
            if (md > 0.001) {
                fx = mdx / md;
                fy = mdy / md;
            } else {
                fx = this.facing.x;
                fy = this.facing.y;
            }

            ball.x = this.x + fx * this.ballOffset;
            ball.y = this.y + fy * this.ballOffset;
            ball.vx = 0;
            ball.vy = 0;
        } else {
            this.tryGainPossession(ball);
        }
    }

    kick(ball) {
        if (ball.owner !== this) return;

        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const d = Math.hypot(dx, dy);

        const nx = d > 0.001 ? dx / d : this.facing.x;
        const ny = d > 0.001 ? dy / d : this.facing.y;

        const power = clamp(d / 40, 0.5, 3.0) * 140;

        ball.owner = null;

        ball.x = this.x + nx * this.ballOffset;
        ball.y = this.y + ny * this.ballOffset;

        ball.vx = nx * power;
        ball.vy = ny * power;

        this.kickCooldown = 0.15;
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

        ctx.fillStyle = '#e94b3c';
        ctx.fillRect(
            Math.round(this.x - this.radius),
            Math.round(this.y - this.radius),
            this.radius * 2,
            this.radius * 2
        );

        ctx.fillStyle = '#fff';
        const fx = this.x + this.facing.x * (this.radius - 1);
        const fy = this.y + this.facing.y * (this.radius - 1);
        ctx.fillRect(Math.round(fx) - 1, Math.round(fy) - 1, 2, 2);
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

        // --- Atrito ---
        const speed = Math.hypot(this.vx, this.vy);
        if (speed > 0) {
            const newSpeed = Math.max(0, speed - this.friction * 60 * dt);
            const scale = newSpeed / speed;
            this.vx *= scale;
            this.vy *= scale;

            if (newSpeed < 1) {
                this.vx = 0;
                this.vy = 0;
            }
        }

        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // --- Colisão com topo e base do campo (Y) ---
        if (this.y - this.radius < FIELD_MARGIN) {
            this.y = FIELD_MARGIN + this.radius;
            this.vy = -this.vy * 0.6;
        }
        if (this.y + this.radius > VIEW_H - FIELD_MARGIN) {
            this.y = VIEW_H - FIELD_MARGIN - this.radius;
            this.vy = -this.vy * 0.6;
        }

        // --- Colisão com laterais (X) — só quica se NÃO estiver na boca do gol ---
        const inGoalY = this.y > GOAL_TOP && this.y < GOAL_BOTTOM;

        // Lateral esquerda
        if (this.x - this.radius < FIELD_MARGIN) {
            if (inGoalY) {
                // Bola entrou no gol esquerdo? (ultrapassou a linha interna)
                if (this.x - this.radius < FIELD_MARGIN - GOAL_DEPTH) {
                    this.registerGoal('left');
                    return;
                }
                // Dentro do gol mas ainda não passou: deixa rolar (sem quique)
            } else {
                this.x = FIELD_MARGIN + this.radius;
                this.vx = -this.vx * 0.6;
            }
        }

        // Lateral direita
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
        if (side === 'left') gameState.scoreLeft++;
        else gameState.scoreRight++;

        gameState.lastScorer = side;
        gameState.goalPause = 1.2; // pausa para mostrar mensagem

        // Zera movimento; o reset reposiciona tudo após a pausa
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
const player = new Player(VIEW_W / 2, VIEW_H / 2);
const ball = new Ball(VIEW_W / 2 + 40, VIEW_H / 2);

// ==========================================
// CAMPO (visual)
// ==========================================
function drawField(ctx) {
    // Base
    ctx.fillStyle = '#3d6b3d';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Listras horizontais
    ctx.fillStyle = '#467a46';
    const stripeH = 16;
    for (let y = 0; y < VIEW_H; y += stripeH * 2) {
        ctx.fillRect(0, y, VIEW_W, stripeH);
    }

    // Linha externa do campo
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
        FIELD_MARGIN + 0.5,
        FIELD_MARGIN + 0.5,
        VIEW_W - FIELD_MARGIN * 2 - 1,
        VIEW_H - FIELD_MARGIN * 2 - 1
    );

    // Linha central (meio-campo)
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + 0.5, FIELD_MARGIN);
    ctx.lineTo(VIEW_W / 2 + 0.5, VIEW_H - FIELD_MARGIN);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(VIEW_W / 2, VIEW_H / 2, 20, 0, Math.PI * 2);
    ctx.stroke();

    // --- Área esquerda ---
    ctx.strokeRect(
        FIELD_MARGIN + 0.5,
        AREA_TOP + 0.5,
        AREA_W,
        AREA_H - 1
    );

    // --- Área direita ---
    ctx.strokeRect(
        VIEW_W - FIELD_MARGIN - AREA_W + 0.5,
        AREA_TOP + 0.5,
        AREA_W,
        AREA_H - 1
    );

    // --- Gol esquerdo (visual: retângulo branco atrás da linha) ---
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(
        FIELD_MARGIN - GOAL_DEPTH,
        GOAL_TOP,
        GOAL_DEPTH,
        GOAL_HEIGHT
    );
    // Traves (linhas verticais grossas)
    ctx.fillStyle = '#fff';
    ctx.fillRect(FIELD_MARGIN - 1, GOAL_TOP - 1, 2, GOAL_HEIGHT + 2);

    // --- Gol direito ---
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(
        VIEW_W - FIELD_MARGIN,
        GOAL_TOP,
        GOAL_DEPTH,
        GOAL_HEIGHT
    );
    ctx.fillStyle = '#fff';
    ctx.fillRect(VIEW_W - FIELD_MARGIN - 1, GOAL_TOP - 1, 2, GOAL_HEIGHT + 2);
}

// ==========================================
// HUD (placar + mensagem de gol)
// ==========================================
function drawHUD(ctx) {
    // Fundo do placar
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(VIEW_W / 2 - 30, 2, 60, 12);

    ctx.fillStyle = '#fff';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
        `${gameState.scoreLeft}  x  ${gameState.scoreRight}`,
        VIEW_W / 2,
        11
    );
    ctx.textAlign = 'left';

    // Instruções
    ctx.fillStyle = '#fff';
    ctx.font = '6px monospace';
    ctx.fillText('WASD: mover | Q: chutar | Mouse: mirar', 4, VIEW_H - 4);

    // Mensagem de gol
    if (gameState.goalPause > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, VIEW_H / 2 - 10, VIEW_W, 20);

        ctx.fillStyle = '#ffeb3b';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('G O L !', VIEW_W / 2, VIEW_H / 2 + 4);
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

    // --- Update ---
    if (gameState.goalPause > 0) {
        gameState.goalPause -= dt;
        if (gameState.goalPause <= 0) {
            gameState.goalPause = 0;
            gameState.lastScorer = null;
            resetPositions();
        }
    } else {
        player.update(dt, ball);
        ball.update(dt);
    }

    // --- Draw ---
    ctx.save();
    ctx.scale(PIXEL_SCALE, PIXEL_SCALE);

    drawField(ctx);
    ball.draw(ctx);
    player.draw(ctx);

    // Crosshair
    ctx.strokeStyle = 'rgba(255,255,0,0.8)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mouse.x - 4, mouse.y);
    ctx.lineTo(mouse.x + 4, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 4);
    ctx.lineTo(mouse.x, mouse.y + 4);
    ctx.stroke();

    // Indicador de posse
    if (ball.owner === player) {
        ctx.fillStyle = 'rgba(255,255,0,0.9)';
        ctx.font = '6px monospace';
        ctx.fillText('POSSE', 4, 10);
    }

    // HUD (placar + instruções + mensagem)
    drawHUD(ctx);

    ctx.restore();

    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);