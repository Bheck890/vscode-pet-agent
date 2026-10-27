// @ts-check
// The DOM around the canvas: the corner buttons and their panels (care,
// toy bags with collection and shop, settings, trophies, and the house
// strip with its houses, rooms and profiles). webview.js creates one
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
   *   activeBag: () => string,
   *   openBags: () => string[],
   *   bagLevel: (id: string) => number,
   *   switchBag: (id: string) => void,
   *   setStyle: (id: string) => void,
   *   visiting: () => any,
   *   visit: (id: string, guest: boolean) => void,
   *   endVisit: () => void,
   *   invite: () => void,
   *   guests: () => Array<{id: string, name: string}>,
   *   sendHome: (id: string) => void,
   *   spriteUrl: (look: any) => string,
   *   homeName: () => string,
   * }} api
   */
  function create(api) {
    const { play, scene, now, persist, escapeHtml } = api;
    const isBusy = api.busy;
    const { STATES } = root.PetStates;
    const { BAGS } = root.PetScene;
    const { unlockId } = root.PetVariants;
    const bagDef = (id) => BAGS.find((b) => b.id === id) || BAGS[0];
    const owns = (id) => (api.saved().unlocks || []).includes(id);
    const foodOwned = (f) => !f.emoji || owns(unlockId(f.bag, 'food', f.id));
    const SPECIES_EMOJI = { cat: '🐱', dog: '🐶', bird: '🐦', fox: '🦊' };
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
    const housePicker = byId('house-picker');
    const houseRooms = byId('house-rooms');
    const houseProfiles = byId('house-profiles');
    const houseTabs = byId('house-tabs');
    /** The house strip shows one section at a time under its room bar. */
    const HOUSE_TABS = [
      ['furniture', '🛋️ Furniture', houseItems],
      ['themes', '🎨 Theme', houseThemes],
      ['rooms', '🚪 Rooms', housePicker],
      ['profiles', '👤 Profiles', houseProfiles],
    ];
    let houseTab = 'furniture';
    /** When the collection was last checked, and what was last told to the extension. */
    let completionAt = 0;
    let reported = null;
    const houseVisit = byId('house-visit');
    const bagPicker = byId('bag-picker');
    const bagOdds = byId('bag-odds');
    const saveActions = byId('save-actions');
    /** Earlier saves and friends' profiles, from the extension. */
    let profiles = [];
    let showHidden = false;
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

    /**
     * One checkbox per variant and hobby; ticked means it can happen. Ones
     * whose bag isn't open yet, or that aren't bought, show locked.
     */
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
              if (!root.PetVariants.owned(group, v, unlocked, api.openBags())) {
                const bag = bagDef(v.bag || 'starter');
                const why = !api.openBags().includes(bag.id)
                  ? `Comes with the ${bag.emoji} ${bag.name} bag at level ${api.bagLevel(bag.id)}`
                  : `Unlock it in the ${bag.emoji} ${bag.name} bag's shop (🎒 then 🛒)`;
                return (
                  `<label class="locked" title="${escapeHtml(why)}">` +
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

    /** A row of bag buttons; locked ones show 🔒 and the level that opens them. */
    function renderPicker() {
      const open = api.openBags();
      bagPicker.innerHTML = BAGS.map((b) =>
        open.includes(b.id)
          ? `<button data-bag="${b.id}"${b.id === api.activeBag() ? ' class="active"' : ''}` +
            ` title="${escapeHtml(b.name)} bag">${b.emoji}</button>`
          : `<button class="locked" disabled` +
            ` title="${escapeHtml(`${b.emoji} ${b.name} bag: unlocks at level ${api.bagLevel(b.id)}`)}">` +
            `🔒<small>${api.bagLevel(b.id)}</small></button>`,
      ).join('');
    }

    function renderBag() {
      if (bagPanel.hidden) {
        return;
      }
      bagDrawnAt = now();
      renderPicker();
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
      const bag = bagDef(api.activeBag());
      const { found, total } = scene.bagCount(bag.id);
      bagTitle.textContent =
        `${bag.emoji} ${bag.name} - ${found}/${total} found - ` +
        `${api.openBags().length}/${BAGS.length} bags`;
      const odds = scene.odds(bag.id);
      const mood =
        odds.luck > 0.35 ? '🍀 Lucky streak' : odds.luck < -0.35 ? '🌧️ Slow day' : '🎲 Odds';
      bagOdds.textContent =
        `${mood} ${odds.rising ? '📈' : '📉'} ` +
        ['common', 'uncommon', 'rare', 'legendary'].map((r) => `${odds.pct[r]}% ${r}`).join(' - ');
      bagGrid.innerHTML = scene
        .bagList(bag.id)
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

    /** The groups a shop sells, in display order. */
    const SHOP_GROUPS = [
      ['animation', '🎭 Animations'],
      ['food', '🍽️ Foods'],
      ['furniture', '🛋️ Furniture'],
      ['theme', '🎨 Room themes'],
      ['room', '🚪 Rooms'],
      ['style', '🐾 Pet styles'],
    ];

    /** Everything a bag's shop sells: animations, foods, then its house's furniture, themes, rooms and styles. */
    function shopItems(bagId = api.activeBag()) {
      const prices = root.PetScene.PRICES;
      const id = (kind, thing) => unlockId(bagId, kind, thing);
      const house = root.PetHouse.HOUSES.find((h) => h.id === bagId);
      return [
        ...root.PetVariants.shopActions(bagId).map((a) => ({
          id: a.id,
          action: a.action,
          kind: 'animation',
          icon: a.icon,
          label: a.group === 'idle' ? a.label : `${a.label} (when ${STATES[a.group].label})`,
          prices: prices.animation,
        })),
        ...root.PetPlay.FOODS.filter((f) => f.emoji && (f.bag || 'starter') === bagId).map((f) => ({
          id: id('food', f.id),
          food: f.id,
          kind: 'food',
          icon: f.emoji,
          label: f.name,
          prices: prices.food,
        })),
        ...root.PetHouse.FURNITURE.filter((f) => f.bag === bagId && !f.free).map((f) => ({
          id: id('furniture', f.id),
          kind: 'furniture',
          icon: f.emoji,
          label: f.name,
          prices: prices.furniture,
        })),
        ...root.PetHouse.THEMES.filter((t) => t.bag === bagId && !t.free).map((t) => ({
          id: id('theme', t.id),
          kind: 'theme',
          icon: '🎨',
          label: `${t.name} room theme`,
          prices: prices.theme,
        })),
        ...house.rooms.slice(2).map((r) => ({
          id: id('room', r.id),
          kind: 'room',
          icon: '🚪',
          label: `${r.name} for the ${house.name.toLowerCase()}`,
          prices: prices.room,
        })),
        ...bagDef(bagId)
          .styles.slice(1)
          .map((st) => ({
            id: id('style', st.id),
            style: st.id,
            kind: 'style',
            icon: '🐾',
            label: st.name,
            prices: prices.style,
          })),
      ];
    }

    function renderShop() {
      const rarity = root.PetScene.RARITY;
      const owned = new Set(api.saved().unlocks || []);
      const bag = bagDef(api.activeBag());
      const spares = ['common', 'rare'].map(
        (r) => `${scene.spares(r, bag.id)} ${rarity[r].label.toLowerCase()}`,
      );
      const row = (item) =>
        `<div class="shop-item"><span class="what">${item.icon} ${escapeHtml(item.label)}</span>` +
        (owned.has(item.id)
          ? '<span class="owned">✅ Unlocked</span>'
          : item.prices
              .map(
                (p) =>
                  `<button data-buy="${escapeHtml(item.id)}" data-rarity="${p.rarity}" data-n="${p.n}"` +
                  `${scene.spares(p.rarity, bag.id) < p.n ? ' disabled' : ''}` +
                  ` style="border-bottom-color:${rarity[p.rarity].color || 'rgba(127,127,127,0.5)'}">` +
                  `${p.n} ${rarity[p.rarity].label.toLowerCase()}</button>`,
              )
              .join('')) +
        '</div>';
      const items = shopItems(bag.id);
      bagTitle.textContent = `🛒 ${bag.emoji} ${bag.name} shop`;
      shopView.innerHTML =
        (shopMsg ? `<div class="shop-msg">${escapeHtml(shopMsg)}</div>` : '') +
        `<div class="shop-spares">Spare toys: ${spares.join(' - ')}</div>` +
        SHOP_GROUPS.map(([kind, title]) => {
          const list = items.filter((i) => i.kind === kind);
          return list.length > 0
            ? `<div class="group">${title}</div>${list.map(row).join('')}`
            : '';
        }).join('') +
        `<div class="panel-note">Paid with this bag's spares only: you always keep one of each toy.</div>`;
    }

    /** Pet styles you can wear: the first of each open bag's, and the ones bought. */
    function stylesOwned() {
      return BAGS.filter((b) => api.openBags().includes(b.id)).flatMap((b) =>
        b.styles.filter((st, i) => i === 0 || owns(unlockId(b.id, 'style', st.id))),
      );
    }

    /**
     * What this bag has given and sold you: pick the food to feed and the
     * pet's style, and switch the bag's animations on or off.
     */
    function renderCollection() {
      const owned = new Set(api.saved().unlocks || []);
      const off = new Set((api.config() && api.config().disabledActions) || []);
      const bag = bagDef(api.activeBag());
      const items = shopItems(bag.id);
      const anims = [
        ...root.PetVariants.bagActions(bag.id).map((a) => ({
          action: a.action,
          icon: '🎁',
          label: a.label,
        })),
        ...items.filter((i) => i.kind === 'animation' && owned.has(i.id)),
      ];
      const foods = root.PetPlay.FOODS.filter(foodOwned);
      const current = api.saved().food || 'kibble';
      const style = (api.config() && api.config().style) || '';
      const styles = stylesOwned();
      bagTitle.textContent =
        `✨ ${bag.emoji} ${bag.name} collection - ` +
        `${items.filter((i) => owned.has(i.id)).length}/${items.length} unlocked`;
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
        '<div class="group">🐾 Pet style</div>' +
        '<div class="food-choices">' +
        [{ id: '', name: 'none' }, ...styles]
          .map(
            (st) =>
              `<button data-style="${escapeHtml(st.id || 'none')}"${st.id === style ? ' class="active"' : ''}>` +
              `${escapeHtml(st.name)}</button>`,
          )
          .join('') +
        '</div>' +
        '<div class="group">🎭 Animations</div>' +
        (anims.length === 0
          ? '<div class="panel-note">None yet. Trade spare toys for some in the 🛒 Shop.</div>'
          : anims
              .map((a) => {
                const on = !off.has(a.action);
                return (
                  `<div class="shop-item"><span class="what">${a.icon} ${escapeHtml(a.label)}</span>` +
                  `<button data-anim="${escapeHtml(a.action)}"${on ? ' class="on"' : ''}` +
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
      const owned = root.PetPlay.FOODS.filter(foodOwned);
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
    bagPicker.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-bag]');
      const id = el && /** @type {HTMLElement} */ (el).dataset.bag;
      if (id && api.openBags().includes(id)) {
        shopMsg = '';
        api.switchBag(id);
        renderBag();
      }
    });
    collectionView.addEventListener('click', (e) => {
      const target = /** @type {HTMLElement} */ (e.target);
      const food = target.closest('[data-food]');
      const anim = target.closest('[data-anim]');
      const style = target.closest('[data-style]');
      if (style) {
        const id = /** @type {HTMLElement} */ (style).dataset.style || 'none';
        api.setStyle(id === 'none' ? '' : id);
        renderBag();
      } else if (food) {
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
      if (!item || !rarity || !scene.spend(rarity, Number(n), api.activeBag())) {
        return;
      }
      api.saved().unlocks = [...(api.saved().unlocks || []), item.id];
      if (item.food) {
        api.saved().food = item.food;
      }
      persist();
      if (item.style) {
        api.setStyle(item.style);
      }
      shopMsg = `Unlocked ${item.icon} ${item.label}!`;
      renderBag();
      renderFoods();
      renderHouse();
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
      // Visiting an old save, 🏠 brings you home to your own house.
      if (api.visiting()) {
        api.endVisit();
        renderHouse();
        return;
      }
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
    housePicker.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-house], [data-room]');
      const { house, room } = el ? /** @type {HTMLElement} */ (el).dataset : {};
      if (house) {
        api.house.goTo(house);
      } else if (room) {
        api.house.goTo(api.house.catalogue().house.id, room);
      }
      renderHouse();
    });
    houseRooms.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-step], [data-tab]');
      const { step, tab } = el ? /** @type {HTMLElement} */ (el).dataset : {};
      if (step) {
        api.house.step(Number(step));
      } else if (tab) {
        houseTab = tab;
      }
      renderHouse();
    });
    houseTabs.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-tab]');
      const tab = el && /** @type {HTMLElement} */ (el).dataset.tab;
      if (tab) {
        houseTab = tab;
        renderHouse();
      }
    });
    houseProfiles.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-profile], [data-profiles]');
      if (!el) {
        return;
      }
      const { profile, guest, profiles: what } = /** @type {HTMLElement} */ (el).dataset;
      if (what === 'home') {
        api.endVisit();
      } else if (what === 'import') {
        api.post({ command: 'profile-import' });
      } else if (what === 'hidden') {
        showHidden = !showHidden;
      } else if (profile) {
        api.visit(profile, guest === '1');
      }
      renderHouse();
    });
    houseVisit.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-visit]');
      const what = el && /** @type {HTMLElement} */ (el).dataset.visit;
      const v = api.visiting();
      if (what === 'invite') {
        api.invite();
      } else if (what && what.startsWith('home:')) {
        api.sendHome(what.slice('home:'.length));
      } else if (v && what === 'rename') {
        api.post({ command: 'profile-rename', id: v.id, guest: !!v.guest });
      } else if (v && what === 'hide') {
        api.post({ command: 'profile-hide', id: v.id, guest: !!v.guest, hidden: !v.hidden });
        api.endVisit();
      } else if (v && what === 'share') {
        api.post({ command: 'profile-export', id: v.id });
      }
      renderHouse();
    });
    saveActions.addEventListener('click', (e) => {
      const el = /** @type {HTMLElement} */ (e.target).closest('[data-save]');
      const what = el && /** @type {HTMLElement} */ (el).dataset.save;
      const commands = {
        share: { command: 'share-copy', toyTotal: scene.toyTotal },
        export: { command: 'profile-export', id: null },
        new: { command: 'new-save' },
        'move-out': { command: 'move-out' },
        'move-in': { command: 'move-in' },
      };
      if (what && commands[what]) {
        api.post(commands[what]);
      }
    });
    trophyView.addEventListener('click', (e) => {
      if (/** @type {HTMLElement} */ (e.target).closest('[data-finish]')) {
        api.post({ command: 'finish-open' });
      }
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
      const visiting = api.visiting();
      careButtons.forEach((b) => {
        b.disabled = busy || !api.main() || !!visiting;
        b.className = play.tool() === b.dataset.care ? 'active' : '';
      });
      if (t > noteUntil) {
        careNote.textContent = visiting
          ? `${visiting.pet.name} is happy just to see you 💖`
          : busy && api.main()
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
        showNote(
          api.visiting()
            ? `${api.main().name} is happy just to see you 💖`
            : `Pick a tool, or hold and stroke ${api.main().name} 💖`,
          4000,
        );
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
      const next = root.PetHouse.FURNITURE.find((f) => !f.bag && f.level > progress.level);
      const nextBag = BAGS.find((b) => api.bagLevel(b.id) > progress.level);
      const medals = profiles.filter((p) => !p.guest && p.finished).length;
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
        (nextBag
          ? ` - ${nextBag.emoji} ${escapeHtml(nextBag.name)} bag at level ${api.bagLevel(nextBag.id)}`
          : '') +
        '</div>' +
        (progress.finished
          ? '<div class="food-choices"><button data-finish="1">🏁 Finished</button></div>'
          : '') +
        (medals > 0 ? `<div title="Finished saves">${'🏅'.repeat(medals)}</div>` : '') +
        `<div class="group">📅 This week's challenges</div>${challenges}` +
        '<div class="panel-note">XP comes from finished prompts, passing tests and builds, ' +
        'helpers, records and care. Every challenge is worth 100.</div>'
      );
    }

    function recordRow(r) {
      const where = r.project ? `<span class="dim">${escapeHtml(r.project)}</span>` : '';
      const said = r.preview ? `<span class="prompt">"${escapeHtml(r.preview)}"</span>` : '';
      const best = r.allTime ? ' <span title="Also your all-time best">🏛️</span>' : '';
      return (
        `<div class="record"><span class="value">${escapeHtml(r.value)}</span>` +
        `${r.emoji} <b>${escapeHtml(r.title)}</b>${best}<br>${where}${said}</div>`
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

    /** "Aug 2027" */
    function monthYear(ms) {
      return new Date(ms).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }

    /** The Profiles row: this save, then earlier saves newest first, then 👋 friends. */
    /**
     * Progress towards a full collection, for the save being played (or the
     * one being visited): regular toys from the open bags (never holiday
     * toys), then everything their shops sell. 'items' is every toy; 'all'
     * is every toy and every shop item.
     */
    function completion() {
      const sold = api.openBags().flatMap((b) => shopItems(b));
      const owned = (kinds) => {
        const list = sold.filter((i) => kinds.includes(i.kind));
        return [list.filter((i) => owns(i.id)).length, list.length];
      };
      const toys = scene.collected();
      const rows = [
        ['🧸', 'Bag items', toys.found, toys.total],
        ['🍽️', 'Shop food', ...owned(['food'])],
        ['🎭', 'Shop animations', ...owned(['animation'])],
        ['🛋️', 'Room stuff', ...owned(['furniture', 'theme', 'room'])],
        ['🐾', 'Pet styles', ...owned(['style'])],
      ];
      const full = (row) => row[2] >= row[3];
      const complete = !full(rows[0]) ? '' : rows.every(full) ? 'all' : 'items';
      return { rows, complete };
    }

    /** The collection's progress bars, at the top of the Profiles tab. */
    function collectionHtml() {
      const c = completion();
      const v = api.visiting();
      const badge = c.complete === 'all' ? '💯 ' : c.complete === 'items' ? '✅ ' : '';
      return (
        '<div class="collect-bars">' +
        `<div class="group">${badge}${escapeHtml(v ? v.pet.name : api.homeName())}'s collection</div>` +
        c.rows
          .map(([icon, label, got, of]) => {
            const pct = of > 0 ? Math.round((got / of) * 100) : 100;
            return (
              `<div class="collect"><span class="what">${icon} ${label}</span>` +
              `<div class="xp-track"><div class="xp-fill" style="width:${pct}%"></div></div>` +
              `<span class="dim">${got}/${of}</span></div>`
            );
          })
          .join('') +
        '</div>'
      );
    }

    function profilesHtml() {
      const v = api.visiting();
      const list = profiles.filter((p) => showHidden || !p.hidden);
      const button = (p) => {
        const img = api.spriteUrl(p.pet);
        const pic = img ? `<img src="${img}" alt="" />` : SPECIES_EMOJI[p.pet.species] || '🐾';
        const marks =
          (p.finished ? '🏁' : '') +
          (p.complete === 'all' ? '💯' : p.complete === 'items' ? '✅' : '') +
          (p.moved ? '🚚' : '') +
          (p.hidden ? '🙈' : '');
        const on = v && v.id === p.id && !!v.guest === !!p.guest;
        return (
          `<button data-profile="${escapeHtml(p.id)}" data-guest="${p.guest ? '1' : '0'}"` +
          `${on ? ' class="active"' : ''} title="${escapeHtml(`${p.name} - visit ${p.pet.name}`)}">` +
          `${pic} ${escapeHtml(p.pet.name)}${marks}</button>`
        );
      };
      const own = list.filter((p) => !p.guest);
      const friends = list.filter((p) => p.guest);
      return (
        '<span class="group">Profiles:</span>' +
        `<button data-profiles="home"${v ? '' : ' class="active"'}` +
        ` title="The save you are playing">🏠 ${escapeHtml(api.homeName())}</button>` +
        own.map(button).join('') +
        (friends.length > 0
          ? '<span class="group">👋 Friends:</span>' + friends.map(button).join('')
          : '') +
        `<button data-profiles="import" title="Add a friend's profile from a .petprofile.json file">` +
        "➕ Add a friend's profile...</button>" +
        (profiles.some((p) => p.hidden)
          ? `<button data-profiles="hidden">${showHidden ? 'Hide hidden' : 'Show hidden'}</button>`
          : '')
      );
    }

    function renderHouse() {
      if (housePanel.hidden) {
        return;
      }
      const cat = api.house.catalogue();
      const v = api.visiting();
      houseNote.textContent = v
        ? `Visiting ${v.name} (${v.moved ? 'moved' : v.finished ? 'finished' : 'ended'} ` +
          `${monthYear(v.endedAt)}). 🏠 to come home`
        : cat.levelsOn
          ? `Level ${cat.level}`
          : '';
      const guests = api.guests();
      houseVisit.hidden = !v && guests.length === 0;
      houseVisit.innerHTML =
        (v
          ? `<button data-visit="invite" title="${escapeHtml(v.pet.name)} comes to play at your house">` +
            `🎈 Invite over</button>` +
            (v.guest
              ? ''
              : `<button data-visit="share" title="Share this profile with a friend">📤 Share</button>`) +
            `<button data-visit="rename">✏️ Rename</button>` +
            `<button data-visit="hide">${v.hidden ? '👀 Show' : '🙈 Hide'}</button>`
          : '') +
        guests
          .map(
            (g) =>
              `<button data-visit="home:${escapeHtml(g.id)}">👋 Send ${escapeHtml(g.name)} home</button>`,
          )
          .join('');
      const open = cat.rooms.filter((r) => r.unlocked).length;
      // This house's own pieces and themes first, then the starter bag's, then the rest.
      const rank = (thing) => (thing.bag === cat.house.id ? 0 : thing.bag ? 2 : 1);
      const byHouse = (list) =>
        list
          .map((x, i) => [x, i])
          .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
          .map(([x]) => x);
      houseRooms.innerHTML =
        `<button data-step="-1" title="Previous room"${open < 2 ? ' disabled' : ''}>◀</button>` +
        `<button class="where" data-tab="rooms" title="Pick a house or room">` +
        `${cat.house.emoji} ${escapeHtml(cat.room.name)}</button>` +
        `<button data-step="1" title="Next room"${open < 2 ? ' disabled' : ''}>▶</button>`;
      houseTabs.innerHTML = HOUSE_TABS.map(
        ([id, label]) =>
          `<button data-tab="${id}"${id === houseTab ? ' class="active"' : ''}>${label}</button>`,
      ).join('');
      for (const [id, , el] of HOUSE_TABS) {
        el.hidden = id !== houseTab;
      }
      housePicker.innerHTML =
        `<span class="group">${escapeHtml(cat.house.name)}:</span>` +
        cat.rooms
          .map((r) =>
            r.unlocked
              ? `<button data-room="${r.id}"${r.active ? ' class="active"' : ''}>${escapeHtml(r.name)}</button>`
              : `<button class="locked" disabled title="${escapeHtml(`${r.name}: ${r.how}`)}">` +
                `🔒 ${escapeHtml(r.name)}</button>`,
          )
          .join('') +
        '<span class="group">Houses:</span>' +
        cat.houses
          .map((h) =>
            h.open
              ? `<button data-house="${h.id}"${h.active ? ' class="active"' : ''}` +
                ` title="${escapeHtml(h.name)}">${h.emoji}</button>`
              : `<button class="locked" disabled` +
                ` title="${escapeHtml(`${h.name}: comes with the ${bagDef(h.id).emoji} ${bagDef(h.id).name} bag at level ${api.bagLevel(h.id)}`)}">🔒</button>`,
          )
          .join('');
      houseItems.innerHTML = byHouse(cat.furniture)
        .map((f) =>
          f.unlocked
            ? `<button data-furniture="${f.id}"${f.placed ? ' class="active"' : ''}${cat.readOnly ? ' disabled' : ''}` +
              ` title="${escapeHtml(f.name)} - click to ${f.placed ? 'take it out' : 'put it in'}">` +
              `${f.emoji}</button>`
            : `<button class="locked" disabled` +
              ` title="${escapeHtml(`${f.name}: ${f.how}`)}">🔒</button>`,
        )
        .join('');
      houseThemes.innerHTML = byHouse(cat.themes)
        .map((t) =>
          t.unlocked
            ? `<button data-theme="${t.id}"${t.active ? ' class="active"' : ''}${cat.readOnly ? ' disabled' : ''}>` +
              `${escapeHtml(t.name)}</button>`
            : `<button disabled title="${escapeHtml(t.how.charAt(0).toUpperCase() + t.how.slice(1))}">` +
              `🔒 ${escapeHtml(t.name)}</button>`,
        )
        .join('');
      houseProfiles.innerHTML = collectionHtml() + profilesHtml();
    }

    /** Leaves the house, and any old save being visited. */
    function leaveHouse() {
      if (api.visiting()) {
        api.endVisit();
      }
      api.house.setOpen(false);
      housePanel.hidden = true;
      houseToggle.classList.toggle('holding', false);
    }

    /** Corner buttons right to left; ones for switched-off features hide and the rest close up. */
    function layoutCorners() {
      const cfg = api.config() || {};
      const shown = [
        [careToggle, true],
        [bagToggle, !api.visiting()],
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
      if (bagToggle.hidden && !bagPanel.hidden) {
        togglePanel(bagPanel);
      }
    }

    return {
      /** Per-frame upkeep: the care panel, and the bag while it is open. */
      tick(t) {
        if (t - bagDrawnAt > 500) {
          renderBag();
        }
        updateCareUi(t);
        // Tell the extension when the save's collection becomes (or stops being) complete.
        if (t - completionAt > 2000 && api.config() && !api.visiting()) {
          completionAt = t;
          const { complete } = completion();
          if (complete !== reported) {
            reported = complete;
            api.post({ command: 'collection', complete });
          }
        }
      },
      completion,
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
      /** Opens the house strip, e.g. on arriving at an old save. */
      openHouse() {
        api.house.setOpen(true);
        if (housePanel.hidden) {
          togglePanel(housePanel);
        }
        houseToggle.classList.toggle('holding', api.house.isOpen());
      },
      /** A visit started or ended: the buttons and panels change with it. */
      visitChanged() {
        layoutCorners();
        renderHouse();
        updateCareUi(now());
      },
      setProfiles(list) {
        profiles = list;
        renderHouse();
        renderTrophy();
      },
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
