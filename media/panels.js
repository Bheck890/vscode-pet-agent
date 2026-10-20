// @ts-check
// The DOM around the canvas: the corner buttons and their panels (care,
// toy bag with collection and shop, settings). webview.js creates one
// instance and hands it a small API into the renderer, like play.js and
// scene.js; this file owns the panels and what they show.
(function (root) {
  'use strict';

  /**
   * @param {{
   *   post: (msg: object) => void,
   *   main: () => any,
   *   config: () => any,
   *   saved: () => any,
   *   care: () => any,
   *   busy: () => boolean,
   *   persist: () => void,
   *   play: any,
   *   scene: any,
   *   now: () => number,
   *   escapeHtml: (s: string) => string,
   *   debugSnapshot: () => string,
   *   house: any,
   * }} api
   */
  function create(api) {
    const { play, scene, now, persist, escapeHtml } = api;
    const isBusy = api.busy;
    const { STATES } = root.PetStates;
    let noteUntil = 0;

    const careToggle = /** @type {HTMLButtonElement} */ (document.getElementById('care-toggle'));
    const carePanel = /** @type {HTMLDivElement} */ (document.getElementById('care-panel'));
    const careNote = /** @type {HTMLDivElement} */ (document.getElementById('care-note'));
    const careButtons = /** @type {HTMLButtonElement[]} */ (
      Array.from(document.querySelectorAll('[data-care]'))
    );
    const careBars = {
      fullness: /** @type {HTMLDivElement} */ (document.getElementById('bar-fullness')),
      fun: /** @type {HTMLDivElement} */ (document.getElementById('bar-fun')),
      clean: /** @type {HTMLDivElement} */ (document.getElementById('bar-clean')),
    };

    /** Care input is live while the panel is open, or a tool is still in hand after closing it. */
    function careOn() {
      return !carePanel.hidden || !!play.tool();
    }

    const TOOL_ICONS = { feed: '🍖', treat: '🍪', play: '🎾', bath: '🛁' };

    function showNote(text, ms = 2600) {
      careNote.textContent = text;
      noteUntil = now() + ms;
    }

    // -- Bag and settings panels --------------------------------------------------
    const bagToggle = /** @type {HTMLButtonElement} */ (document.getElementById('bag-toggle'));
    const bagPanel = /** @type {HTMLDivElement} */ (document.getElementById('bag-panel'));
    const bagGrid = /** @type {HTMLDivElement} */ (document.getElementById('bag-grid'));
    const bagTitle = /** @type {HTMLSpanElement} */ (document.getElementById('bag-title'));
    const bagStoreAll = /** @type {HTMLButtonElement} */ (document.getElementById('bag-store-all'));
    const bagView = /** @type {HTMLDivElement} */ (document.getElementById('bag-view'));
    const bagTabs = /** @type {HTMLDivElement} */ (document.getElementById('bag-tabs'));
    const collectionView = /** @type {HTMLDivElement} */ (
      document.getElementById('collection-view')
    );
    const shopView = /** @type {HTMLDivElement} */ (document.getElementById('shop-view'));
    const foodPicker = /** @type {HTMLDivElement} */ (document.getElementById('food-picker'));
    const settingsToggle = /** @type {HTMLButtonElement} */ (
      document.getElementById('settings-toggle')
    );
    const settingsPanel = /** @type {HTMLDivElement} */ (document.getElementById('settings-panel'));
    const switches = /** @type {HTMLInputElement[]} */ (
      Array.from(document.querySelectorAll('[data-setting]'))
    );
    const actionList = /** @type {HTMLDivElement} */ (document.getElementById('action-list'));
    const byId = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
    const trophyToggle = byId('trophy-toggle');
    const trophyPanel = byId('trophy-panel');
    const trophyTitle = byId('trophy-title');
    const trophyTabs = byId('trophy-tabs');
    const trophyView = byId('trophy-view');
    const houseToggle = byId('house-toggle');
    const housePanel = byId('house-panel');
    const houseNote = byId('house-note');
    const houseDone = byId('house-done');
    const houseItems = byId('house-items');
    const houseThemes = byId('house-themes');
    /** The latest level and records from the extension, or null before the first. */
    let progress = null;
    let records = null;
    let trophyTab = 'level';
    const gatherLogs = /** @type {HTMLButtonElement} */ (document.getElementById('gather-logs'));

    /** Groups of switchable actions for the settings panel, in display order. */
    const ACTION_GROUPS = [
      ['idle', 'Idle hobbies', root.PetVariants.IDLE],
      ...Object.entries(root.PetVariants.VARIANTS).map(([state, list]) => [
        state,
        STATES[state].label,
        list,
      ]),
    ];

    /** One checkbox per variant and hobby; ticked means it can happen. Unbought ones show locked. */
    function renderActions() {
      const off = new Set(api.config().disabledActions || []);
      const unlocked = api.saved().unlocks || [];
      actionList.innerHTML = ACTION_GROUPS.map(
        ([group, title, list]) =>
          `<div class="group">${escapeHtml(title)}</div>` +
          list
            .map((v) => {
              const id = root.PetVariants.actionId(group, v);
              const name = v.id === 'classic' ? 'classic look' : v.label;
              const only = v.species ? ` (${v.species.join(', ')}s)` : '';
              if (v.shop && !unlocked.includes(id)) {
                return (
                  `<label class="locked" title="Unlock it in the shop (🎒 then 🛒)">` +
                  `<input type="checkbox" disabled /> 🔒 ${escapeHtml(name)}</label>`
                );
              }
              return (
                `<label><input type="checkbox" data-action="${escapeHtml(id)}"` +
                `${off.has(id) ? '' : ' checked'} /> ${escapeHtml(name + only)}</label>`
              );
            })
            .join(''),
      ).join('');
    }
    let bagDrawnAt = 0;
    /** Which page of the bag is showing. */
    let bagTab = 'toys';
    let shopMsg = '';
    const BAG_TABS = [
      ['toys', '🧸 Toys'],
      ['collection', '✨ Collection'],
      ['shop', '🛒 Shop'],
    ];

    /** Opens one corner panel (or closes it if already open) and closes the others. */
    function togglePanel(panel) {
      const open = panel.hidden;
      for (const other of [carePanel, bagPanel, settingsPanel, trophyPanel, housePanel]) {
        other.hidden = other !== panel || !open;
      }
      renderTrophy();
      renderHouse();
      // Closing the care panel keeps the tool in hand; opening another panel puts it away.
      if (carePanel.hidden && panel !== carePanel) {
        play.setTool(null);
      }
      if (!bagPanel.hidden) {
        renderBag();
      }
      updateCareUi(now());
    }

    function renderBag() {
      if (bagPanel.hidden) {
        return;
      }
      bagDrawnAt = now();
      bagTabs.innerHTML = BAG_TABS.map(
        ([id, label]) =>
          `<button data-tab="${id}"${id === bagTab ? ' class="active"' : ''}>${label}</button>`,
      ).join('');
      bagView.hidden = bagTab !== 'toys';
      collectionView.hidden = bagTab !== 'collection';
      shopView.hidden = bagTab !== 'shop';
      bagStoreAll.hidden = bagTab !== 'toys';
      if (bagTab === 'collection') {
        renderCollection();
        return;
      }
      if (bagTab === 'shop') {
        renderShop();
        return;
      }
      bagTitle.textContent = `🎒 Bag - ${scene.foundCount()}/${scene.toyTotal} found`;
      bagGrid.innerHTML = scene
        .bagList()
        .map((toy) =>
          toy.count === 0
            ? '<span class="toy unknown" title="Not found yet">❔</span>'
            : `<button class="toy${toy.out ? ' out' : ''}" data-toy="${escapeHtml(toy.id)}"` +
              ` style="border-bottom-color:${toy.color || 'rgba(127,127,127,0.35)'}"` +
              ` title="${escapeHtml(`${toy.name} (${toy.rarity})${toy.out ? ' - out' : ''}`)}">` +
              `${toy.emoji}${toy.count > 1 ? `<span class="count">x${toy.count}</span>` : ''}</button>`,
        )
        .join('');
    }

    /** Everything for sale: unlockable animations, then foods. */
    function shopItems() {
      const prices = root.PetScene.PRICES;
      return [
        ...root.PetVariants.shopActions().map((a) => ({
          id: a.id,
          icon: a.icon,
          label: a.group === 'idle' ? a.label : `${a.label} (when ${STATES[a.group].label})`,
          prices: prices.animation,
        })),
        ...root.PetPlay.FOODS.filter((f) => f.emoji).map((f) => ({
          id: `food.${f.id}`,
          icon: f.emoji,
          label: f.name,
          prices: prices.food,
        })),
      ];
    }

    function renderShop() {
      const rarity = root.PetScene.RARITY;
      const owned = new Set(api.saved().unlocks || []);
      const spares = ['common', 'rare'].map(
        (r) => `${scene.spares(r)} ${rarity[r].label.toLowerCase()}`,
      );
      const row = (item) =>
        `<div class="shop-item"><span class="what">${item.icon} ${escapeHtml(item.label)}</span>` +
        (owned.has(item.id)
          ? '<span class="owned">✅ Unlocked</span>'
          : item.prices
              .map(
                (p) =>
                  `<button data-buy="${escapeHtml(item.id)}" data-rarity="${p.rarity}" data-n="${p.n}"` +
                  `${scene.spares(p.rarity) < p.n ? ' disabled' : ''}` +
                  ` style="border-bottom-color:${rarity[p.rarity].color || 'rgba(127,127,127,0.5)'}">` +
                  `${p.n} ${rarity[p.rarity].label.toLowerCase()}</button>`,
              )
              .join('')) +
        '</div>';
      const items = shopItems();
      bagTitle.textContent = '🛒 Shop';
      shopView.innerHTML =
        (shopMsg ? `<div class="shop-msg">${escapeHtml(shopMsg)}</div>` : '') +
        `<div class="shop-spares">Spare toys: ${spares.join(' - ')}</div>` +
        '<div class="group">🎭 Animations</div>' +
        items
          .filter((i) => !i.id.startsWith('food.'))
          .map(row)
          .join('') +
        '<div class="group">🍽️ Foods</div>' +
        items
          .filter((i) => i.id.startsWith('food.'))
          .map(row)
          .join('') +
        '<div class="panel-note">Only spares are traded in: you always keep one of each toy.</div>';
    }

    /** What has been bought: pick the food to feed and switch animations on or off. */
    function renderCollection() {
      const owned = new Set(api.saved().unlocks || []);
      const off = new Set((api.config() && api.config().disabledActions) || []);
      const items = shopItems();
      const anims = items.filter((i) => !i.id.startsWith('food.') && owned.has(i.id));
      const foods = root.PetPlay.FOODS.filter((f) => !f.emoji || owned.has(`food.${f.id}`));
      const current = api.saved().food || 'kibble';
      bagTitle.textContent = `✨ Collection - ${items.filter((i) => owned.has(i.id)).length}/${items.length} unlocked`;
      collectionView.innerHTML =
        '<div class="group">🍽️ Food to feed</div>' +
        '<div class="food-choices">' +
        foods
          .map(
            (f) =>
              `<button data-food="${f.id}"${f.id === current ? ' class="active"' : ''}>` +
              `${f.emoji || '🥣'} ${escapeHtml(f.name)}</button>`,
          )
          .join('') +
        '</div>' +
        '<div class="group">🎭 Animations</div>' +
        (anims.length === 0
          ? '<div class="panel-note">None yet. Trade spare toys for some in the 🛒 Shop.</div>'
          : anims
              .map((a) => {
                const on = !off.has(a.id);
                return (
                  `<div class="shop-item"><span class="what">${a.icon} ${escapeHtml(a.label)}</span>` +
                  `<button data-anim="${escapeHtml(a.id)}"${on ? ' class="on"' : ''}` +
                  ` title="Click to switch it ${on ? 'off' : 'on'}">${on ? 'On' : 'Off'}</button></div>`
                );
              })
              .join(''));
    }

    function pickFood(id) {
      api.saved().food = id;
      persist();
      renderFoods();
      renderBag();
    }

    /** Switches an action on or off in pet-agents.disabledActions. */
    function setActionOn(id, on) {
      const off = new Set(api.config().disabledActions || []);
      if (on) {
        off.delete(id);
      } else {
        off.add(id);
      }
      // Shown straight away; the extension echoes the setting back with a reinit.
      api.config().disabledActions = [...off];
      api.post({ command: 'setting', key: 'disabledActions', value: [...off] });
    }

    /** Food choices in the care panel, once there is more than kibble. */
    function renderFoods() {
      const owned = root.PetPlay.FOODS.filter(
        (f) => !f.emoji || (api.saved().unlocks || []).includes(`food.${f.id}`),
      );
      const current = api.saved().food || 'kibble';
      foodPicker.hidden = owned.length < 2;
      foodPicker.innerHTML = owned
        .map(
          (f) =>
            `<button data-food="${f.id}"${f.id === current ? ' class="active"' : ''}` +
            ` title="${escapeHtml(f.name)}">${f.emoji || '🥣'}</button>`,
        )
        .join('');
    }

    function syncSwitches() {
      for (const input of switches) {
        const key = input.dataset.setting || '';
        input.checked =
          key === 'variety' ? api.config().variety !== 'classic' : api.config()[key] !== false;
      }
      renderActions();
    }

    bagToggle.addEventListener('click', () => togglePanel(bagPanel));
    bagTabs.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-tab]');
      const tab = el && /** @type {HTMLElement} */ (el).dataset.tab;
      if (!tab) {
        return;
      }
      bagTab = tab;
      shopMsg = '';
      renderBag();
    });
    collectionView.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const food = target.closest('[data-food]');
      const anim = target.closest('[data-anim]');
      if (food) {
        pickFood(/** @type {HTMLElement} */ (food).dataset.food);
      } else if (anim && api.config()) {
        const id = /** @type {HTMLElement} */ (anim).dataset.anim || '';
        setActionOn(id, (api.config().disabledActions || []).includes(id));
        renderBag();
        renderActions();
      }
    });
    shopView.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-buy]');
      if (!el) {
        return;
      }
      const { buy, rarity, n } = /** @type {HTMLElement} */ (el).dataset;
      const item = shopItems().find((i) => i.id === buy);
      if (!item || !rarity || !scene.spend(rarity, Number(n))) {
        return;
      }
      api.saved().unlocks = [...(api.saved().unlocks || []), item.id];
      if (item.id.startsWith('food.')) {
        api.saved().food = item.id.slice('food.'.length);
      }
      persist();
      shopMsg = `Unlocked ${item.icon} ${item.label}!`;
      renderBag();
      renderFoods();
      if (api.config()) {
        renderActions();
      }
    });
    foodPicker.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-food]');
      const id = el && /** @type {HTMLElement} */ (el).dataset.food;
      if (id) {
        pickFood(id);
      }
    });
    settingsToggle.addEventListener('click', () => togglePanel(settingsPanel));
    trophyToggle.addEventListener('click', () => togglePanel(trophyPanel));
    // The house stays open with its furniture bar hidden; 🏠 again leaves it.
    houseToggle.addEventListener('click', () => {
      if (api.house.isOpen()) {
        leaveHouse();
        return;
      }
      api.house.setOpen(true);
      if (housePanel.hidden) {
        togglePanel(housePanel);
      }
      houseToggle.classList.toggle('holding', api.house.isOpen());
    });
    houseDone.addEventListener('click', () => {
      housePanel.hidden = true;
    });
    trophyTabs.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-tab]');
      const tab = el && /** @type {HTMLElement} */ (el).dataset.tab;
      if (tab) {
        trophyTab = tab;
        renderTrophy();
      }
    });
    houseItems.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-furniture]');
      const id = el && /** @type {HTMLElement} */ (el).dataset.furniture;
      if (id) {
        api.house.toggle(id);
        renderHouse();
      }
    });
    houseThemes.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-theme]');
      const id = el && /** @type {HTMLElement} */ (el).dataset.theme;
      if (id) {
        api.house.setTheme(id);
        renderHouse();
      }
    });
    bagStoreAll.addEventListener('click', () => {
      scene.putAllAway();
      renderBag();
    });
    bagGrid.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-toy]');
      const id = el && /** @type {HTMLElement} */ (el).dataset.toy;
      if (!id) {
        return;
      }
      if (scene.bagList().some((toy) => toy.id === id && toy.out)) {
        scene.putAway(id);
      } else {
        scene.takeOut(id);
      }
      renderBag();
    });
    actionList.addEventListener('change', (e) => {
      const input = /** @type {HTMLInputElement} */ (e.target);
      const id = input.dataset.action;
      if (id) {
        setActionOn(id, input.checked);
      }
    });
    gatherLogs.addEventListener('click', () =>
      api.post({ command: 'gather-logs', snapshot: api.debugSnapshot() }),
    );
    switches.forEach((input) =>
      input.addEventListener('change', () =>
        api.post({
          command: 'setting',
          key: input.dataset.setting,
          value: input.checked,
        }),
      ),
    );

    function updateCareUi(t) {
      const busy = isBusy();
      const held = carePanel.hidden ? play.tool() : null;
      careToggle.textContent = held ? TOOL_ICONS[held] || '🐾' : '🐾';
      careToggle.title = held ? 'Care tool in hand. Esc puts it away' : 'Pet care';
      careToggle.classList.toggle('holding', !!held);
      careButtons.forEach((b) => {
        b.disabled = busy || !api.main();
        b.className = play.tool() === b.dataset.care ? 'active' : '';
      });
      if (t > noteUntil) {
        careNote.textContent =
          busy && api.main()
            ? `🛠️ ${api.main().name} is working. Care unlocks when the task is done.`
            : '';
      }
      const care = api.care();
      if (care) {
        for (const [k, el] of Object.entries(careBars)) {
          const v = care[k];
          el.style.width = Math.round(v) + '%';
          el.style.background = v < 30 ? '#ff5d5d' : v < 60 ? '#ffc94d' : '#5ad17a';
        }
      }
    }

    careToggle.addEventListener('click', () => {
      togglePanel(carePanel);
      if (!carePanel.hidden && api.main() && !isBusy()) {
        showNote(`Pick a tool, or hold and stroke ${api.main().name} 💖`, 4000);
      }
    });

    careButtons.forEach((b) =>
      b.addEventListener('click', () => {
        if (!api.main()) {
          return;
        }
        if (isBusy()) {
          showNote(`🛠️ ${api.main().name} is busy working! Try again when the task is done.`);
          return;
        }
        const tool = b.dataset.care || null;
        play.setTool(play.tool() === tool ? null : tool);
      }),
    );

    /** Which trophy tabs exist: levels and records can each be switched off. */
    function trophyTabsOn() {
      const cfg = api.config() || {};
      return [
        ['level', '⭐ Level', cfg.levels !== false],
        ['records', '🏆 Records', cfg.records !== false],
      ].filter(([, , on]) => on);
    }

    function renderTrophy() {
      if (trophyPanel.hidden) {
        return;
      }
      const tabs = trophyTabsOn();
      if (!tabs.some(([id]) => id === trophyTab) && tabs.length > 0) {
        trophyTab = String(tabs[0][0]);
      }
      trophyTabs.innerHTML = tabs
        .map(
          ([id, label]) =>
            `<button data-tab="${id}"${id === trophyTab ? ' class="active"' : ''}>${label}</button>`,
        )
        .join('');
      trophyTabs.hidden = tabs.length < 2;
      if (trophyTab === 'records') {
        trophyTitle.textContent = '🏆 Prompt records';
        trophyView.innerHTML = recordsHtml();
      } else {
        trophyTitle.textContent = '⭐ Level and challenges';
        trophyView.innerHTML = levelHtml();
      }
    }

    function levelHtml() {
      if (!progress) {
        return '<div class="panel-note">Counting your XP...</div>';
      }
      const span = Math.max(1, progress.next - progress.floor);
      const pct = Math.round(((progress.xp - progress.floor) / span) * 100);
      const next = root.PetHouse.FURNITURE.find((f) => f.level > progress.level);
      const challenges = progress.challenges
        .map(
          (c) =>
            `<div class="challenge${c.done ? ' done' : ''}"><span>${c.emoji}</span>` +
            `<span class="what">${escapeHtml(c.text)}</span>` +
            `<span class="dim">${c.done ? '✅' : `${c.progress}/${c.target}`}</span></div>`,
        )
        .join('');
      return (
        `<div class="level-head"><span>⭐ Level ${progress.level}</span>` +
        `<span class="dim">${progress.xp} / ${progress.next} XP</span></div>` +
        `<div class="xp-track"><div class="xp-fill" style="width:${pct}%"></div></div>` +
        `<div class="dim">+${progress.weekXp} XP this week` +
        (next ? ` - next: ${next.emoji} ${escapeHtml(next.name)} at level ${next.level}` : '') +
        '</div>' +
        `<div class="group">📅 This week's challenges</div>${challenges}` +
        '<div class="panel-note">XP comes from finished prompts, passing tests and builds, ' +
        'helpers, records and care. Every challenge is worth 100.</div>'
      );
    }

    function recordRow(r) {
      const where = r.project ? `<span class="dim">${escapeHtml(r.project)}</span>` : '';
      const said = r.preview ? `<span class="prompt">"${escapeHtml(r.preview)}"</span>` : '';
      return (
        `<div class="record"><span class="value">${escapeHtml(r.value)}</span>` +
        `${r.emoji} <b>${escapeHtml(r.title)}</b><br>${where}${said}</div>`
      );
    }

    function recordsHtml() {
      if (!records) {
        return '<div class="panel-note">Reading your prompts...</div>';
      }
      const t = records.totals;
      return (
        `<div class="dim">${t.prompts} prompts - ${t.actions} actions - ` +
        `${escapeHtml(t.agentTime)} of agent time this week</div>` +
        '<div class="group">📅 This week</div>' +
        (records.records.length > 0
          ? records.records.map(recordRow).join('')
          : '<div class="panel-note">No finished prompts yet this week.</div>') +
        (records.hallOfFame.length > 0
          ? '<div class="group">🏛️ Hall of fame</div>' + records.hallOfFame.map(recordRow).join('')
          : '')
      );
    }

    function renderHouse() {
      if (housePanel.hidden) {
        return;
      }
      const cat = api.house.catalogue();
      houseNote.textContent = cat.levelsOn ? `Level ${cat.level}` : '';
      houseItems.innerHTML = cat.furniture
        .map((f) =>
          f.unlocked
            ? `<button data-furniture="${f.id}"${f.placed ? ' class="active"' : ''}` +
              ` title="${escapeHtml(f.name)} - click to ${f.placed ? 'take it out' : 'put it in'}">` +
              `${f.emoji}</button>`
            : `<button class="locked" disabled` +
              ` title="${escapeHtml(f.name)}: unlocks at level ${f.level}">🔒</button>`,
        )
        .join('');
      houseThemes.innerHTML = cat.themes
        .map((t) =>
          t.unlocked
            ? `<button data-theme="${t.id}"${t.active ? ' class="active"' : ''}>` +
              `${escapeHtml(t.name)}</button>`
            : `<button disabled title="Unlocks at level ${t.level}">🔒 ${escapeHtml(t.name)}</button>`,
        )
        .join('');
    }

    function leaveHouse() {
      api.house.setOpen(false);
      housePanel.hidden = true;
      houseToggle.classList.toggle('holding', false);
    }

    /** Corner buttons right to left; ones for switched-off features hide and the rest close up. */
    function layoutCorners() {
      const cfg = api.config() || {};
      const shown = [
        [careToggle, true],
        [bagToggle, true],
        [settingsToggle, true],
        [trophyToggle, cfg.levels !== false || cfg.records !== false],
        [houseToggle, cfg.house !== false],
      ];
      let i = 0;
      for (const [button, on] of shown) {
        button.hidden = !on;
        if (on) {
          button.style.right = `${8 + 30 * i++}px`;
        }
      }
      if (trophyToggle.hidden && !trophyPanel.hidden) {
        togglePanel(trophyPanel);
      }
      if (houseToggle.hidden && api.house.isOpen()) {
        leaveHouse();
      }
    }

    return {
      /** Per-frame upkeep: the care panel, and the bag while it is open. */
      tick(t) {
        if (t - bagDrawnAt > 500) {
          renderBag();
        }
        updateCareUi(t);
      },
      /** A short message under the care buttons. */
      note: showNote,
      careOn,
      refreshCare: () => updateCareUi(now()),
      refreshBag: renderBag,
      /** Settings changed: tick the switches to match and show the right buttons. */
      syncConfig() {
        syncSwitches();
        layoutCorners();
        renderTrophy();
        renderHouse();
      },
      setProgress(update) {
        progress = update;
        renderTrophy();
        renderHouse();
      },
      setRecords(update) {
        records = update;
        renderTrophy();
      },
      refreshHouse: renderHouse,
      /** Leaves the house (agent work pulls the pet back to its desk). */
      closeHouse: leaveHouse,
      /** Purchases changed (here or in another window). */
      refreshUnlocks() {
        renderFoods();
        renderBag();
        if (api.config()) {
          renderActions();
        }
      },
    };
  }

  root.PetPanels = { create };
})(this);
