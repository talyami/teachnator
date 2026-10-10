/* ============================================================================
   NEUROQUEST: RPG PLAYER META-SYSTEM
   Player state, classes, pet companions, inventory, progression, and saves
============================================================================ */

class PlayerState {
  constructor() {
    this.name = "Aether Knight";
    this.heroClass = "knight"; // knight, mage, pilot, alchemist
    this.level = 1;
    this.xp = 10;
    this.gold = 120;
    this.activePet = "fox"; // fox, sprite, bird, owl
    this.unlockedPets = ["fox"];
    this.skillPoints = 2;
    this.equippedWeapon = { id: "blade_1", name: "Starter Broadsword", icon: "🗡️", power: 15 };
    this.equippedRelic = { id: "relic_1", name: "Memory Quartz", icon: "💍", power: 10 };
    this.inventory = [
      { id: "health_potion", name: "Elixir of Focus", icon: "🧪", count: 3, desc: "Restores 50 HP in battle.", type: "potion" },
      { id: "star_shard", name: "Novice Star Shard", icon: "⭐", count: 1, desc: "A gleaming token of first adventure.", type: "relic" },
      { id: "solar_crystal", name: "Sunlight Crystal", icon: "☀️", count: 2, desc: "A condensed shard of photon energy.", type: "catalyst" },
      { id: "iron_core", name: "Dense Iron Ingot", icon: "🧱", count: 1, desc: "Heavy gravity-attracting core material.", type: "material" }
    ];
    this.skills = {
      solar_overcharge: { id: "solar_overcharge", name: "Thermal Boost", desc: "Adds +20% bonus energy to reaction chambers.", unlocked: true, cost: 1 },
      kinetic_pierce: { id: "kinetic_pierce", name: "Kinetic Piercer", desc: "Projectiles pierce through 1 additional obstacle.", unlocked: false, cost: 1 },
      oxygen_rush: { id: "oxygen_rush", name: "Oxygen Overdrive", desc: "Submarine boosts 30% faster along red river currents.", unlocked: false, cost: 1 },
      dopamine_surge: { id: "dopamine_surge", name: "Critical Resonance", desc: "Doubles gold and XP from boss critical strikes.", unlocked: false, cost: 2 }
    };
    this.worldProgress = {
      photosynthesis: { completed: false, stars: 0, highscore: 0, lastPlayed: 0 },
      gravity: { completed: false, stars: 0, highscore: 0, lastPlayed: 0 },
      circulation: { completed: false, stars: 0, highscore: 0, lastPlayed: 0 },
      customQuests: []
    };

    // Invisible mastery model (stealth spaced-repetition)
    this.memoryMastery = {};

    this.load();
  }

  save() {
    try {
      const data = {
        name: this.name,
        heroClass: this.heroClass,
        level: this.level,
        xp: this.xp,
        gold: this.gold,
        activePet: this.activePet,
        unlockedPets: this.unlockedPets,
        skillPoints: this.skillPoints,
        equippedWeapon: this.equippedWeapon,
        equippedRelic: this.equippedRelic,
        inventory: this.inventory,
        skills: this.skills,
        worldProgress: this.worldProgress,
        memoryMastery: this.memoryMastery
      };
      localStorage.setItem("neuroquest_player_save", JSON.stringify(data));
    } catch (e) {
      console.warn("Save failed:", e);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem("neuroquest_player_save");
      if (!raw) return;
      const data = JSON.parse(raw);
      Object.assign(this, data);
    } catch (e) {
      console.warn("Load failed:", e);
    }
  }
}

const GameState = {
  player: new PlayerState(),

  init() {
    this.player.load();
    this.updateHud();
  },

  addXp(amount) {
    this.player.xp += amount;
    const oldLevel = this.player.level;
    const nextLevelReq = this.getXpRequirement(this.player.level);

    if (this.player.xp >= nextLevelReq) {
      this.player.level++;
      this.player.skillPoints++;
      this.player.gold += 50;
      this.showToast(`LEVEL UP! You are now Level ${this.player.level}! +1 SP ⚡`, "amber");
      if (window.GameAudio) window.GameAudio.playLevelUp();
    } else {
      if (window.GameAudio) window.GameAudio.playCoin();
      this.showToast(`+${amount} XP Earned!`, "cyan");
    }

    this.player.save();
    this.updateHud();
  },

  addGold(amount) {
    this.player.gold += amount;
    this.player.save();
    this.updateHud();
    if (window.GameAudio) window.GameAudio.playCoin();
  },

  getXpRequirement(level) {
    return level * 100;
  },

  updateHud() {
    const p = this.player;
    const nameEl = document.getElementById("hudHeroName");
    if (nameEl) nameEl.textContent = p.name;

    const lvlEl = document.getElementById("hudHeroLvl");
    if (lvlEl) lvlEl.textContent = `LVL ${p.level}`;

    const greetingEl = document.getElementById("hubHeroGreeting");
    if (greetingEl) greetingEl.textContent = p.name.toUpperCase();

    const goldEl = document.getElementById("hudGoldCount");
    if (goldEl) goldEl.textContent = p.gold;

    const nextReq = this.getXpRequirement(p.level);
    const xpProg = p.xp % nextReq;
    const xpPct = Math.min(100, Math.round((xpProg / nextReq) * 100));

    const xpBar = document.getElementById("hudXpBar");
    if (xpBar) xpBar.style.width = `${xpPct}%`;

    const xpLabel = document.getElementById("hudXpLabel");
    if (xpLabel) xpLabel.textContent = `${xpProg}/${nextReq}`;

    const weaponName = document.getElementById("equipWeaponName");
    if (weaponName && p.equippedWeapon) weaponName.textContent = p.equippedWeapon.name;

    const relicName = document.getElementById("equipRelicName");
    if (relicName && p.equippedRelic) relicName.textContent = p.equippedRelic.name;
  },

  showToast(message, color = "cyan") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const borderCol = color === "amber" ? "border-amber-400 text-amber-300" :
                     color === "rose" ? "border-rose-500 text-rose-300" :
                     color === "purple" ? "border-purple-400 text-purple-300" :
                     "border-cyan-400 text-cyan-300";

    const toast = document.createElement("div");
    toast.className = `p-3 rounded-2xl bg-questCard border ${borderCol} text-xs font-mono shadow-2xl flex items-center gap-2 pointer-events-auto transition-all transform duration-300 translate-y-3 opacity-0`;
    toast.innerHTML = `<span class="w-2 h-2 rounded-full bg-current animate-ping"></span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.remove("translate-y-3", "opacity-0");
    }, 20);

    setTimeout(() => {
      toast.classList.add("translate-y-3", "opacity-0");
      setTimeout(() => toast.remove(), 350);
    }, 3200);
  },

  renderInventoryModal() {
    const grid = document.getElementById("inventoryItemsGrid");
    if (!grid) return;
    grid.innerHTML = "";

    this.player.inventory.forEach(item => {
      const div = document.createElement("div");
      div.className = "p-3 rounded-2xl bg-questDark border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition";
      div.innerHTML = `
        <div class="flex items-center gap-2.5">
          <span class="text-2xl">${item.icon}</span>
          <div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              <span>${item.name}</span>
              <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-amber-300 font-mono">x${item.count}</span>
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5 line-clamp-1">${item.desc}</p>
          </div>
        </div>
        <button onclick="GameState.useItem('${item.id}')" class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 text-slate-300 text-[11px] font-bold border border-slate-700 transition">
          Use
        </button>
      `;
      grid.appendChild(div);
    });
  },

  useItem(itemId) {
    const item = this.player.inventory.find(i => i.id === itemId);
    if (!item || item.count <= 0) return;

    item.count--;
    if (item.count <= 0) {
      this.player.inventory = this.player.inventory.filter(i => i.id !== itemId);
    }
    this.player.save();
    this.renderInventoryModal();

    if (window.GameAudio) window.GameAudio.playReward();
    this.showToast(`Used ${item.name}! Focus replenished.`, "cyan");
  },

  renderSkillTreeModal() {
    const countEl = document.getElementById("skillPointsCount");
    if (countEl) countEl.textContent = `${this.player.skillPoints} SP`;

    const list = document.getElementById("skillTreeList");
    if (!list) return;
    list.innerHTML = "";

    Object.values(this.player.skills).forEach(skill => {
      const card = document.createElement("div");
      card.className = `p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
        skill.unlocked ? "bg-cyan-950/30 border-cyan-500/40" : "bg-questDark border-slate-800"
      }`;

      card.innerHTML = `
        <div>
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-white text-xs">${skill.name}</h4>
            <span class="text-[9px] font-mono px-1.5 py-0.2 rounded ${
              skill.unlocked ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-slate-800 text-slate-400"
            }">
              ${skill.unlocked ? "ACQUIRED" : `${skill.cost} SP`}
            </span>
          </div>
          <p class="text-[11px] text-slate-400 mt-0.5">${skill.desc}</p>
        </div>
        ${
          skill.unlocked
            ? '<span class="text-emerald-400 font-mono text-xs font-bold">✓ Active</span>'
            : `<button onclick="GameState.unlockSkill('${skill.id}')" class="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold font-mono transition shadow">
                Unlock
              </button>`
        }
      `;
      list.appendChild(card);
    });
  },

  unlockSkill(skillId) {
    const skill = this.player.skills[skillId];
    if (!skill || skill.unlocked) return;

    if (this.player.skillPoints < skill.cost) {
      this.showToast("Not enough Skill Points! Level up to earn more.", "rose");
      if (window.GameAudio) window.GameAudio.playHit();
      return;
    }

    this.player.skillPoints -= skill.cost;
    skill.unlocked = true;
    this.player.save();
    this.renderSkillTreeModal();

    if (window.GameAudio) window.GameAudio.playPowerup();
    this.showToast(`Skill Unlocked: ${skill.name}! ⚡`, "amber");
  }
};

window.playerState = GameState.player;
window.GameState = GameState;
