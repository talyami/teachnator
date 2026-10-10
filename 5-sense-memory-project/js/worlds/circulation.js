/* ============================================================================
   NEUROQUEST - WORLD 3: THE RED RIVER
   Micro-Submarine Bloodstream Action Runner & Arterial Boss
   Teaches: Cardiopulmonary Circulation (Heart Chambers, Lungs, O2 exchange)
============================================================================ */

class CirculationWorld {
  constructor(containerId, onComplete) {
    this.container = typeof containerId === "string" ? document.getElementById(containerId) : containerId;
    this.onComplete = onComplete;
    this.phase = "sub_runner"; // "sub_runner" -> "boss" -> "victory"

    this.canvas = null;
    this.ctx = null;
    this.animFrame = null;

    // Submarine Entity
    this.sub = {
      x: 100,
      y: 180,
      targetY: 180,
      radius: 20,
      oxygenated: false,
      o2Cargo: 0,
      maxCargo: 3
    };

    // Obstacles & Pickups
    this.redCells = [];
    this.oxygenPods = [];
    this.plaques = [];
    this.cargoDelivered = 0;
    this.targetDeliveries = 3;

    // Boss state
    this.bossHp = 300;
    this.bossQuestionIndex = 0;
  }

  start() {
    if (window.soundEngine) window.soundEngine.startBgm("sub");
    this.renderIntro();
  }

  stop() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  renderIntro() {
    this.container.innerHTML = `
      <div class="max-w-3xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900/90 border-2 border-rose-500/40 shadow-2xl text-center space-y-6 backdrop-blur-md animate-fade-in">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono text-xs font-bold uppercase tracking-wider">
          ❤️ Biological Sector: Vascular Highway
        </div>
        <h2 class="text-3xl sm:text-5xl font-extrabold font-brand tracking-wide bg-gradient-to-r from-rose-400 via-red-300 to-amber-300 bg-clip-text text-transparent">
          THE RED RIVER
        </h2>
        <div class="w-24 h-24 mx-auto rounded-3xl bg-rose-950/60 border border-rose-500/50 flex items-center justify-center text-5xl shadow-xl shadow-rose-500/20 animate-bounce-slow">
          🩸
        </div>
        <p class="text-slate-300 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
          The bodily tissues are oxygen-starved! Pilot the <strong class="text-rose-400">Nano-Sub Haemoglobin-1</strong>. 
          Navigate the blood river, pick up Oxygen cells from the lungs, dodge cholesterol plaques, and deliver vital fuel to tissue depots!
        </p>
        <button id="startSubBtn" class="px-8 py-4 rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 font-black font-brand text-lg tracking-wider shadow-lg shadow-rose-500/30 transform active:scale-95 transition flex items-center gap-2 mx-auto">
          <span>PILOT NANO-SUBMARINE</span>
          <span>⚡</span>
        </button>
      </div>
    `;

    document.getElementById("startSubBtn").addEventListener("click", () => {
      if (window.soundEngine) window.soundEngine.playSfx("click");
      this.renderRunnerScreen();
    });
  }

  renderRunnerScreen() {
    this.phase = "sub_runner";
    this.container.innerHTML = `
      <div class="w-full max-w-4xl mx-auto flex flex-col gap-4 animate-fade-in">
        <!-- Status Bar -->
        <div class="flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
          <div class="flex items-center gap-3">
            <span class="text-2xl">❤️</span>
            <div>
              <div class="text-xs font-mono text-slate-400 uppercase">Circulation Mission</div>
              <div class="text-sm font-bold text-rose-300">Deliver 3 Oxygen Shipments to Depots</div>
            </div>
          </div>
          <div class="flex items-center gap-3 font-mono text-sm">
            <span class="text-amber-400 font-bold" id="cargoLabel">📦 0 / 3 Delivered</span>
            <span class="text-cyan-300 font-bold" id="o2FuelLabel">🔵 Deoxygenated</span>
          </div>
        </div>

        <!-- Interactive Bloodstream Canvas -->
        <div class="relative w-full rounded-3xl overflow-hidden border-2 border-rose-500/40 bg-slate-950 shadow-2xl flex flex-col items-center">
          <canvas id="bloodCanvas" class="w-full h-80 sm:h-96 block cursor-pointer"></canvas>

          <!-- Instructions Overlay -->
          <div class="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-rose-300 pointer-events-none">
            🖱️ Move Mouse Up/Down or touch to steer Submarine! Catch glowing 🔴 Oxygen bubbles!
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-center">
            <span class="text-xs font-mono text-rose-300 font-bold block mb-1">Right Heart ➔ Lungs</span>
            <p class="text-[11px] text-slate-400">Blue deoxygenated blood drops off CO₂ and catches fresh O₂.</p>
          </div>
          <div class="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 text-center">
            <span class="text-xs font-mono text-rose-300 font-bold block mb-1">Lungs ➔ Left Heart</span>
            <p class="text-[11px] text-slate-400">Red oxygenated blood enters Left Ventricle to blast into Aorta!</p>
          </div>
          <button id="diveDeliveryBtn" class="p-3 rounded-2xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500 text-rose-200 font-bold font-mono text-xs flex items-center justify-center gap-2 active:scale-95 transition">
            <span>📦 DOCK & DELIVER O₂ TO DEPOT</span>
          </button>
        </div>
      </div>
    `;

    this.initRunnerCanvas();
    this.setupControls();
  }

  initRunnerCanvas() {
    this.canvas = document.getElementById("bloodCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width || 800;
    this.canvas.height = rect.height || 360;

    this.sub.x = 90;
    this.sub.y = this.canvas.height / 2;
    this.sub.targetY = this.canvas.height / 2;

    // Spawn initial entities
    this.redCells = [];
    this.oxygenPods = [];
    this.plaques = [];

    // Track mouse / touch Y
    const updateY = (clientY) => {
      const cRect = this.canvas.getBoundingClientRect();
      const y = clientY - cRect.top;
      this.sub.targetY = Math.max(30, Math.min(this.canvas.height - 30, y));
    };

    this.canvas.addEventListener("mousemove", (e) => updateY(e.clientY));
    this.canvas.addEventListener("touchmove", (e) => {
      if (e.touches[0]) updateY(e.touches[0].clientY);
    });

    const loop = () => {
      this.updatePhysics();
      this.draw();
      this.animFrame = requestAnimationFrame(loop);
    };
    this.animFrame = requestAnimationFrame(loop);
  }

  updatePhysics() {
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Smooth sub movement towards target
    this.sub.y += (this.sub.targetY - this.sub.y) * 0.15;

    // Spawn red blood cells
    if (Math.random() < 0.1) {
      this.redCells.push({
        x: W + 20,
        y: Math.random() * (H - 40) + 20,
        vx: 3 + Math.random() * 2,
        r: 10 + Math.random() * 4
      });
    }

    // Spawn Oxygen Pods
    if (Math.random() < 0.04) {
      this.oxygenPods.push({
        x: W + 20,
        y: Math.random() * (H - 60) + 30,
        vx: 3.5,
        r: 12
      });
    }

    // Spawn Plaque Obstacles
    if (Math.random() < 0.02) {
      this.plaques.push({
        x: W + 40,
        y: Math.random() < 0.5 ? 20 : H - 20,
        vx: 2.5,
        w: 30,
        h: 40
      });
    }

    // Update RBCs
    for (let i = this.redCells.length - 1; i >= 0; i--) {
      const r = this.redCells[i];
      r.x -= r.vx;
      if (r.x < -30) this.redCells.splice(i, 1);
    }

    // Update Oxygen Pods
    for (let i = this.oxygenPods.length - 1; i >= 0; i--) {
      const o = this.oxygenPods[i];
      o.x -= o.vx;

      // Check pickup
      if (Math.hypot(this.sub.x - o.x, this.sub.y - o.y) < this.sub.radius + o.r) {
        this.sub.o2Cargo = Math.min(this.sub.maxCargo, this.sub.o2Cargo + 1);
        this.sub.oxygenated = true;
        if (window.soundEngine) window.soundEngine.playSfx("collect");

        const o2Label = document.getElementById("o2FuelLabel");
        if (o2Label) {
          o2Label.textContent = `🔴 O₂ Loaded (${this.sub.o2Cargo}/${this.sub.maxCargo})`;
          o2Label.className = "text-rose-400 font-bold";
        }
        this.oxygenPods.splice(i, 1);
        continue;
      }

      if (o.x < -30) this.oxygenPods.splice(i, 1);
    }

    // Update Plaques
    for (let i = this.plaques.length - 1; i >= 0; i--) {
      const p = this.plaques[i];
      p.x -= p.vx;
      if (p.x < -50) this.plaques.splice(i, 1);
    }
  }

  draw() {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);

    // Blood Vessel Wall Background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, "#450a0a");
    bgGrad.addColorStop(0.5, "#881337");
    bgGrad.addColorStop(1, "#450a0a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Endothelial Cell Wall Lining
    ctx.fillStyle = "#9f1239";
    for (let x = 0; x < W; x += 30) {
      ctx.beginPath();
      ctx.arc(x, 8, 12, 0, Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, H - 8, 12, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // Draw Red Blood Cells
    this.redCells.forEach(r => {
      ctx.fillStyle = "rgba(225, 29, 72, 0.45)";
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * 1.3, r.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Plaques
    this.plaques.forEach(p => {
      ctx.fillStyle = "#fbbf24";
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(p.x, p.y, p.w, p.h, 10);
      ctx.fill();
      ctx.stroke();
    });

    // Draw Oxygen Pods
    this.oxygenPods.forEach(o => {
      ctx.fillStyle = "#f43f5e";
      ctx.shadowColor = "#f43f5e";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 9px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("O₂", o.x, o.y);
    });

    // Draw Nano-Submarine
    ctx.save();
    ctx.translate(this.sub.x, this.sub.y);

    // Hull Color: Blue if deoxygenated, Vibrant Crimson if oxygenated
    ctx.fillStyle = this.sub.oxygenated ? "#f43f5e" : "#0284c7";
    ctx.strokeStyle = this.sub.oxygenated ? "#fecdd3" : "#38bdf8";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.roundRect(-24, -12, 48, 24, 12);
    ctx.fill();
    ctx.stroke();

    // Propeller & Cockpit
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(6, -2, 6, 0, Math.PI * 2);
    ctx.fill();

    // Headlight Beam
    const lightGrad = ctx.createLinearGradient(24, 0, 100, 0);
    lightGrad.addColorStop(0, "rgba(254, 240, 138, 0.5)");
    lightGrad.addColorStop(1, "rgba(254, 240, 138, 0)");
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.moveTo(24, -4);
    ctx.lineTo(100, -25);
    ctx.lineTo(100, 25);
    ctx.lineTo(24, 4);
    ctx.fill();

    ctx.restore();
  }

  setupControls() {
    const dockBtn = document.getElementById("diveDeliveryBtn");
    dockBtn.addEventListener("click", () => {
      if (this.sub.o2Cargo > 0) {
        this.cargoDelivered++;
        this.sub.o2Cargo = 0;
        this.sub.oxygenated = false;

        if (window.soundEngine) window.soundEngine.playSfx("powerup");
        if (window.confetti) confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });

        const cargoLabel = document.getElementById("cargoLabel");
        const o2Label = document.getElementById("o2FuelLabel");
        if (cargoLabel) cargoLabel.textContent = `📦 ${this.cargoDelivered} / ${this.targetDeliveries} Delivered`;
        if (o2Label) {
          o2Label.textContent = `🔵 Deoxygenated`;
          o2Label.className = "text-cyan-300 font-bold";
        }

        if (this.cargoDelivered >= this.targetDeliveries) {
          this.stop();
          setTimeout(() => this.renderBossIntro(), 800);
        }
      } else {
        if (window.soundEngine) window.soundEngine.playSfx("error");
        alert("Catch red O₂ oxygen bubbles first to fill your cargo tanks!");
      }
    });
  }

  // --- Boss Encounter ---
  renderBossIntro() {
    this.phase = "boss";
    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-rose-500/50 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-24 h-24 mx-auto rounded-3xl bg-rose-950/60 border border-rose-500 flex items-center justify-center text-5xl shadow-xl shadow-rose-500/30 animate-bounce">
          🐲
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-rose-400 font-bold tracking-widest">ARTERIAL ARTERY BLOCKED!</span>
          <h3 class="text-3xl font-extrabold font-brand text-white">THE PLAQUE BEHEMOTH</h3>
          <p class="text-sm text-slate-300">
            A giant blockage has formed at the root of the Aorta! Power your Nano-Sub torpedoes with correct circulatory knowledge to blast through the clot!
          </p>
        </div>
        <button id="fightCardioBossBtn" class="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 text-slate-950 font-brand font-black text-base shadow-xl active:scale-95 transition">
          ⚔️ ENGAGE AORTA BEHEMOTH
        </button>
      </div>
    `;

    document.getElementById("fightCardioBossBtn").addEventListener("click", () => {
      this.renderBossBattleScreen();
    });
  }

  renderBossBattleScreen() {
    this.bossHp = 300;
    this.bossQuestionIndex = 0;

    const questions = [
      {
        prompt: "The Behemoth challenges your engine! Which muscular organ acts as the central double-pump powering your blood around the body?",
        options: [
          { text: "The Heart", correct: true },
          { text: "The Stomach", correct: false },
          { text: "The Liver", correct: false },
          { text: "The Gallbladder", correct: false }
        ]
      },
      {
        prompt: "Where must deoxygenated blood travel to drop off carbon dioxide waste and reload fresh red oxygen?",
        options: [
          { text: "The Lungs", correct: true },
          { text: "The Knees", correct: false },
          { text: "The Intestines", correct: false },
          { text: "The Skull", correct: false }
        ]
      },
      {
        prompt: "Final Torpedo Strike! Which powerful chamber of the heart pumps fresh oxygenated blood out into the great Aorta?",
        options: [
          { text: "The Left Ventricle", correct: true },
          { text: "The Right Ear", correct: false },
          { text: "The Appendix", correct: false },
          { text: "The Spleen", correct: false }
        ]
      }
    ];

    this.renderBossQuestion(questions);
  }

  renderBossQuestion(questions) {
    if (this.bossQuestionIndex >= questions.length) {
      this.renderVictory();
      return;
    }

    const q = questions[this.bossQuestionIndex];

    this.container.innerHTML = `
      <div class="max-w-2xl mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-rose-500/40 shadow-2xl flex flex-col gap-6 animate-fade-in">
        <div class="flex items-center justify-between border-b border-slate-800 pb-4">
          <div class="flex items-center gap-3">
            <div class="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-500 flex items-center justify-center text-3xl">
              🐲
            </div>
            <div>
              <h3 class="text-lg font-bold font-brand text-white">The Plaque Behemoth</h3>
              <div class="text-[10px] font-mono text-rose-400">Arterial Blockage Titan</div>
            </div>
          </div>
          <div class="w-36 flex flex-col gap-1 items-end font-mono">
            <span class="text-xs text-rose-300 font-bold">${this.bossHp} / 300 HP</span>
            <div class="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden">
              <div class="h-full bg-gradient-to-r from-rose-500 to-red-500 transition-all duration-300" style="width: ${(this.bossHp / 300) * 100}%"></div>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <span class="text-[11px] font-mono text-rose-400 font-bold uppercase">⚡ Cardio Laser Torpedo #${this.bossQuestionIndex + 1}</span>
          <p class="text-base sm:text-lg font-bold text-slate-100 leading-snug">
            ${q.prompt}
          </p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="cardioBossGrid">
          ${q.options.map((opt) => `
            <button class="boss-opt-btn p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 hover:border-rose-400 text-sm font-bold text-slate-200 text-left transition flex items-center justify-between active:scale-98" data-correct="${opt.correct}">
              <span>${opt.text}</span>
              <span class="opacity-0 strike-icon text-lg">💥</span>
            </button>
          `).join("")}
        </div>

        <div id="battleFeedback" class="h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs opacity-0 transition-opacity"></div>
      </div>
    `;

    document.querySelectorAll(".boss-opt-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const isCorrect = btn.getAttribute("data-correct") === "true";
        this.handleBossAnswer(btn, isCorrect, questions);
      });
    });
  }

  handleBossAnswer(btn, isCorrect, questions) {
    const fb = document.getElementById("battleFeedback");

    if (isCorrect) {
      if (window.soundEngine) window.soundEngine.playSfx("crit");
      if (window.confetti) confetti({ particleCount: 60, spread: 60, origin: { y: 0.6 } });

      btn.classList.add("border-rose-400", "bg-rose-950/80", "text-rose-300");
      btn.querySelector(".strike-icon").classList.remove("opacity-0");

      this.bossHp = Math.max(0, this.bossHp - 100);

      fb.textContent = "CRITICAL TORPEDO HIT! The Plaque Behemoth is disintegrating!";
      fb.className = "h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs bg-rose-950 text-rose-300 border border-rose-800 opacity-100 transition-opacity";

      setTimeout(() => {
        this.bossQuestionIndex++;
        this.renderBossQuestion(questions);
      }, 1200);

    } else {
      if (window.soundEngine) window.soundEngine.playSfx("error");
      btn.classList.add("border-amber-500", "bg-amber-950/80", "text-amber-300");

      fb.textContent = "Torpedo deflected by plaque armor! Recalibrating... strike again!";
      fb.className = "h-10 rounded-xl flex items-center justify-center px-4 font-mono text-xs bg-amber-950 text-amber-300 border border-amber-800 opacity-100 transition-opacity";

      setTimeout(() => {
        this.bossQuestionIndex++;
        this.renderBossQuestion(questions);
      }, 1200);
    }
  }

  renderVictory() {
    if (window.soundEngine) window.soundEngine.playSfx("victory");
    if (window.playerState) {
      window.playerState.recordWorldVictory("circulation", 1600, 3);
      window.playerState.unlockBadge({
        id: "cardio_captain",
        name: "Cardio Fleet Captain",
        icon: "❤️",
        desc: "Master of cardiopulmonary blood flow and heart mechanics."
      });
    }

    this.container.innerHTML = `
      <div class="max-w-md mx-auto my-auto p-6 sm:p-8 rounded-3xl bg-slate-900 border-2 border-rose-400/60 shadow-2xl text-center space-y-6 animate-fade-in">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-rose-400 to-amber-500 flex items-center justify-center text-4xl shadow-xl shadow-rose-500/20">
          🏆
        </div>
        <div class="space-y-1">
          <span class="text-xs font-mono uppercase text-rose-400 font-bold tracking-widest">AORTA FULLY CLEARED!</span>
          <h3 class="text-2xl font-black font-brand text-white">THE RED RIVER IS SAVED!</h3>
          <p class="text-xs text-slate-400">
            Blood flows smoothly and tissue cells celebrate with fresh oxygen! You now command the human cardiovascular circuit.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3 font-mono text-xs text-left">
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">XP GAINED</span>
            <span class="text-amber-400 font-bold text-base">+120 XP</span>
          </div>
          <div class="p-3 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span class="text-slate-400 block text-[10px]">LOOT FOUND</span>
            <span class="text-rose-300 font-bold text-base">❤️ Cardio Core</span>
          </div>
        </div>

        <button id="returnHubBtn" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-400 to-amber-400 text-slate-950 font-brand font-black text-sm tracking-wider shadow-lg active:scale-95 transition">
          RETURN TO WORLD MAP →
        </button>
      </div>
    `;

    document.getElementById("returnHubBtn").addEventListener("click", () => {
      if (this.onComplete) this.onComplete();
    });
  }
}

window.CirculationWorld = CirculationWorld;
window.WorldCirculation = {
  mount(container, onComplete) {
    const w = new CirculationWorld(container, onComplete);
    w.start();
    window._activeCirculation = w;
    return w;
  },
  destroy() {
    if (window._activeCirculation) {
      window._activeCirculation.stop();
      window._activeCirculation = null;
    }
  }
};
