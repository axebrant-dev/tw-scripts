(() => {
  'use strict';

  const SCRIPT_ID = 'axebrant-wh-balancer-ru';
  const STORAGE_KEY = 'axebrantWHBalancerRUSettings';

  const TEXT = {
    title: 'Балансировщик склада',
    subtitle: 'Русская безопасная локальная версия',
    source: 'Источник',
    target: 'Получатель',
    distance: 'Дистанция',
    time: 'Время',
    wood: 'Дерево',
    stone: 'Глина',
    iron: 'Железо',
    action: 'Действие',
    send: 'Отправить',
    settings: 'Настройки',
    apply: 'Сохранить и пересчитать',
    reset: 'Сбросить',
    report: 'Отчёт',
    result: 'Результат баланса',
    noPlan: 'Подходящих отправок не найдено.',
    yes: 'Да',
    no: 'Нет',
  };

  const DEFAULTS = {
    includeIncoming: true,
    autoSend: true,
    previewBeforeAutoSend: true,
    prioritizeSmallVillages: true,
    maxTravelMinutes: 120,
    minSourcePointsPriority: 6000,
    maxTargetPointsPriority: 3000,
    targetWarehouseFillPriority: 0.9,
    targetWarehouseFillNormal: 0.65,
    builtOutWarehouseKeep: 0.25,
    builtOutHighFarm: 23000,
    builtOutHighPoints: 9000,
    sourceReserveWood: 30000,
    sourceReserveStone: 30000,
    sourceReserveIron: 30000,
    sourceReservePercent: 0.2,
    minBatchPerResource: 3000,
    minMerchantsInSource: 3,
    maxOrdersPerRun: 40,
    maxMerchantsPerRun: 400,
    sendDelayMs: 350,
    allowSourceTargetOverlap: true,
    useWhiteListOnly: false,
    whiteList: '',
    blackList: ''
  };

  const state = {
    settings: loadSettings(),
    villages: [],
    incoming: {},
    plan: [],
    summary: null,
    sentOrders: [],
    aborted: false,
  };

  start();

  async function start() {
    try {
      cleanupUi();
      injectStyles();
      renderShell('Загрузка данных...');

      const urls = getUrls();
      const [incomingHtml, prodHtml] = await Promise.all([
        fetchPage(urls.incomingUrl),
        fetchPage(urls.productionUrl),
      ]);

      state.incoming = state.settings.includeIncoming ? parseIncomingPage(incomingHtml) : {};
      state.villages = parseProductionPage(prodHtml, state.incoming);
      state.plan = buildPlan(state.villages, state.settings);
      state.summary = buildSummary(state.villages, state.plan);

      renderUi();

      if (state.settings.autoSend && state.plan.length > 0) {
        if (state.settings.previewBeforeAutoSend) {
          UI.SuccessMessage('План построен. Проверь список и нажми «Запустить автоотправку».');
        } else {
          await autoSendPlan();
        }
      }
    } catch (error) {
      console.error(`[${SCRIPT_ID}]`, error);
      renderShell(`Ошибка: ${escapeHtml(error.message || String(error))}`);
      UI.ErrorMessage(`Балансировщик: ${error.message || error}`);
    }
  }

  function getUrls() {
    const sitter = Number(game_data?.player?.sitter || 0) > 0;
    const playerId = game_data?.player?.id;
    const incomingUrl = sitter
      ? `game.php?t=${playerId}&screen=overview_villages&mode=trader&type=inc&page=-1`
      : 'game.php?screen=overview_villages&mode=trader&type=inc&page=-1';
    const productionUrl = sitter
      ? `game.php?t=${playerId}&screen=overview_villages&mode=prod&page=-1`
      : 'game.php?screen=overview_villages&mode=prod&page=-1';
    return { incomingUrl, productionUrl };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(next) {
    state.settings = { ...DEFAULTS, ...next };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function cleanupUi() {
    $(`#${SCRIPT_ID}-root`).remove();
    $(`#${SCRIPT_ID}-styles`).remove();
  }

  function injectStyles() {
    const css = `
      <style id="${SCRIPT_ID}-styles">
        #${SCRIPT_ID}-root { margin: 12px 0; color: #f3f6fb; font-family: Arial, sans-serif; }
        #${SCRIPT_ID}-root * { box-sizing: border-box; }
        .ax-card { background: linear-gradient(180deg,#2d3138,#1d2025); border: 1px solid #46505f; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 24px rgba(0,0,0,.18); }
        .ax-head { padding: 14px 16px; background: linear-gradient(180deg,#3a4150,#232831); display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap; }
        .ax-title { font-size: 18px; font-weight: 700; }
        .ax-sub { font-size: 12px; opacity: .8; }
        .ax-grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap:10px; padding:12px; }
        .ax-box { background:#262b33; border:1px solid #394150; border-radius:10px; padding:10px; }
        .ax-box h4 { margin:0 0 8px; font-size:13px; color:#b8c8e7; }
        .ax-kv { display:flex; justify-content:space-between; gap:8px; font-size:12px; padding:3px 0; }
        .ax-actions { display:flex; gap:8px; flex-wrap:wrap; }
        .ax-btn { cursor:pointer; border:none; border-radius:8px; padding:8px 12px; font-weight:700; color:#fff; background:linear-gradient(180deg,#496aab,#28457c); }
        .ax-btn.secondary { background:linear-gradient(180deg,#5b616c,#373c44); }
        .ax-btn.warn { background:linear-gradient(180deg,#8a5a3c,#6f4127); }
        .ax-section { padding: 0 12px 12px; }
        .ax-table-wrap { overflow:auto; border:1px solid #394150; border-radius:10px; }
        .ax-table { width:100%; border-collapse: collapse; font-size:12px; background:#22262d; }
        .ax-table th { position: sticky; top: 0; background:#1a1e24; z-index:1; }
        .ax-table th, .ax-table td { border-bottom:1px solid #353d4a; padding:8px; text-align:center; white-space:nowrap; }
        .ax-table tr:nth-child(even) { background:#272c34; }
        .ax-form { padding:12px; display:grid; grid-template-columns: repeat(auto-fit,minmax(240px,1fr)); gap:10px; }
        .ax-field { background:#262b33; border:1px solid #394150; border-radius:10px; padding:10px; }
        .ax-field label { display:block; font-size:12px; margin-bottom:6px; color:#b8c8e7; }
        .ax-field input[type="number"], .ax-field input[type="text"] { width:100%; border:1px solid #4c5667; border-radius:8px; padding:8px; background:#1d2128; color:#fff; }
        .ax-field input[type="checkbox"] { transform: scale(1.1); }
        .ax-inline { display:flex; align-items:center; gap:8px; }
        .ax-muted { color:#b8c8e7; font-size:12px; }
        .ax-pill { display:inline-block; padding:4px 8px; border-radius:999px; background:#1d2430; border:1px solid #42506a; font-size:12px; }
        .ax-link { color:#8fc3ff; text-decoration:none; }
      </style>`;
    $('body').append(css);
  }

  function renderShell(message) {
    mountRoot(`
      <div id="${SCRIPT_ID}-root">
        <div class="ax-card">
          <div class="ax-head">
            <div>
              <div class="ax-title">${TEXT.title}</div>
              <div class="ax-sub">${TEXT.subtitle}</div>
            </div>
          </div>
          <div class="ax-section" style="padding-top:12px">${message}</div>
        </div>
      </div>`);
  }

  function renderUi() {
    const s = state.settings;
    const sum = state.summary;
    mountRoot(`
      <div id="${SCRIPT_ID}-root">
        <div class="ax-card">
          <div class="ax-head">
            <div>
              <div class="ax-title">${TEXT.title}</div>
              <div class="ax-sub">Русская безопасная локальная версия без внешней загрузки</div>
            </div>
            <div class="ax-actions">
              <button class="ax-btn secondary" id="${SCRIPT_ID}-toggle-settings">${TEXT.settings}</button>
              <button class="ax-btn secondary" id="${SCRIPT_ID}-show-report">${TEXT.report}</button>
              <button class="ax-btn secondary" id="${SCRIPT_ID}-show-result">${TEXT.result}</button>
              <button class="ax-btn" id="${SCRIPT_ID}-run-auto">Запустить автоотправку</button>
            </div>
          </div>
          <div class="ax-grid">
            <div class="ax-box">
              <h4>Сводка</h4>
              <div class="ax-kv"><span>Деревень</span><strong>${sum.totalVillages}</strong></div>
              <div class="ax-kv"><span>План отправок</span><strong>${sum.orders}</strong></div>
              <div class="ax-kv"><span>Торговцев в плане</span><strong>${sum.merchantsUsed}</strong></div>
            </div>
            <div class="ax-box">
              <h4>Приоритеты</h4>
              <div class="ax-kv"><span>Источники приоритетно от</span><strong>${format(s.minSourcePointsPriority)} очк.</strong></div>
              <div class="ax-kv"><span>Получатели приоритетно до</span><strong>${format(s.maxTargetPointsPriority)} очк.</strong></div>
              <div class="ax-kv"><span>Макс. время доставки</span><strong>${s.maxTravelMinutes} мин</strong></div>
            </div>
          </div>
          <div id="${SCRIPT_ID}-settings" style="display:none">${renderSettingsForm(s)}</div>
          <div class="ax-section"><div class="ax-table-wrap">${renderPlanTable()}</div></div>
        </div>
      </div>`);
    bindUi();
  }

  function renderSettingsForm(s) {
    return `
      <form id="${SCRIPT_ID}-form" class="ax-form">
        ${checkboxField('includeIncoming', 'Учитывать входящие ресурсы', s.includeIncoming)}
        ${checkboxField('autoSend', 'Автоотправка после расчёта', s.autoSend)}
        ${checkboxField('previewBeforeAutoSend', 'Сначала показать план', s.previewBeforeAutoSend)}
        ${checkboxField('prioritizeSmallVillages', 'Приоритет маленьким деревням', s.prioritizeSmallVillages)}
        ${numberField('minSourcePointsPriority', 'Приоритет источников от очков', s.minSourcePointsPriority)}
        ${numberField('maxTargetPointsPriority', 'Приоритет получателей до очков', s.maxTargetPointsPriority)}
        ${numberField('maxTravelMinutes', 'Максимальное время доставки, мин', s.maxTravelMinutes)}
        ${numberField('minBatchPerResource', 'Мин. партия по ресурсу', s.minBatchPerResource)}
        ${numberField('maxOrdersPerRun', 'Макс. отправок за цикл', s.maxOrdersPerRun)}
        ${numberField('sendDelayMs', 'Задержка между отправками, мс', s.sendDelayMs)}
        ${textField('whiteList', 'Белый список координат или id через запятую', s.whiteList)}
        ${textField('blackList', 'Чёрный список координат или id через запятую', s.blackList)}
        ${checkboxField('useWhiteListOnly', 'Использовать только белый список', s.useWhiteListOnly)}
        <div class="ax-field" style="grid-column:1/-1">
          <div class="ax-actions">
            <button type="submit" class="ax-btn">${TEXT.apply}</button>
            <button type="button" class="ax-btn warn" id="${SCRIPT_ID}-reset">${TEXT.reset}</button>
          </div>
        </div>
      </form>`;
  }

  function renderPlanTable() {
    if (!state.plan.length) return `<div class="ax-section ax-muted">${TEXT.noPlan}</div>`;
    const rows = state.plan.map((order, index) => {
      const source = state.villages.find(v => v.id === order.sourceId);
      const target = state.villages.find(v => v.id === order.targetId);
      return `<tr>
        <td>${index + 1}</td>
        <td><a class="ax-link" href="${source?.url || '#'}">${escapeHtml(source?.name || order.sourceId)}</a></td>
        <td><a class="ax-link" href="${target?.url || '#'}">${escapeHtml(target?.name || order.targetId)}</a></td>
        <td>${order.distance.toFixed(1)}</td>
        <td>${format(order.travelMinutes)} мин</td>
        <td>${format(order.wood)}</td>
        <td>${format(order.stone)}</td>
        <td>${format(order.iron)}</td>
        <td>${order.merchants}</td>
        <td><button class="ax-btn secondary ${SCRIPT_ID}-send-one" data-index="${index}">${TEXT.send}</button></td>
      </tr>`;
    }).join('');
    return `<table class="ax-table"><thead><tr><th>#</th><th>${TEXT.source}</th><th>${TEXT.target}</th><th>${TEXT.distance}</th><th>${TEXT.time}</th><th>${TEXT.wood}</th><th>${TEXT.stone}</th><th>${TEXT.iron}</th><th>Торг.</th><th>${TEXT.action}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function bindUi() {
    $(`#${SCRIPT_ID}-toggle-settings`).on('click', () => $(`#${SCRIPT_ID}-settings`).toggle());
    $(`#${SCRIPT_ID}-form`).on('submit', event => {
      event.preventDefault();
      saveSettings(formToSettings(event.currentTarget));
      start();
    });
    $(`#${SCRIPT_ID}-reset`).on('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      state.settings = { ...DEFAULTS };
      start();
    });
    $(`#${SCRIPT_ID}-show-report`).on('click', showReportDialog);
    $(`#${SCRIPT_ID}-show-result`).on('click', showBalanceResultDialog);
    $(`#${SCRIPT_ID}-run-auto`).on('click', autoSendPlan);
    $(`.${SCRIPT_ID}-send-one`).on('click', async event => {
      const order = state.plan[Number($(event.currentTarget).data('index'))];
      if (order) await sendSingleOrder(order);
    });
  }

  function formToSettings(form) {
    const data = new FormData(form);
    const result = { ...DEFAULTS };
    Object.keys(DEFAULTS).forEach(key => {
      if (typeof DEFAULTS[key] === 'boolean') result[key] = data.get(key) === 'on';
      else if (typeof DEFAULTS[key] === 'number') result[key] = Number(data.get(key));
      else result[key] = String(data.get(key) || '');
    });
    return result;
  }

  async function fetchPage(url) {
    return new Promise((resolve, reject) => {
      $.get(url).done(resolve).fail((xhr, status, err) => reject(new Error(`Не удалось загрузить ${url}: ${err || status}`)));
    });
  }

  function parseIncomingPage(html) {
    const doc = $(html);
    const map = {};
    doc.find('#trades_table tr').each((_, tr) => {
      const $tr = $(tr);
      const href = $tr.find('a[href*="id="]').last().attr('href') || '';
      const idMatch = href.match(/id=(\d+)/);
      if (!idMatch) return;
      const villageId = idMatch[1];
      const bucket = map[villageId] || { wood: 0, stone: 0, iron: 0 };
      bucket.wood += extractResourceFromRow($tr, 'wood');
      bucket.stone += extractResourceFromRow($tr, 'stone');
      bucket.iron += extractResourceFromRow($tr, 'iron');
      map[villageId] = bucket;
    });
    return map;
  }

  function extractResourceFromRow($row, key) {
    let value = 0;
    $row.find(`.${key}, .m${key}, .icon.${key}, .icon.header.${key}, .icon.mheader.${key}`).each((_, el) => {
      value += parseNumber($(el).parent().text() || $(el).text() || '');
    });
    return value;
  }

  function parseProductionPage(html, incomingMap) {
    const doc = $(html);
    const villages = [];
    doc.find('#production_table tr, #combined_table tr').each((_, tr) => {
      const $tr = $(tr);
      const $nameNode = $tr.find('.quickedit-vn').first();
      if (!$nameNode.length) return;
      const id = String($nameNode.data('id') || '').trim();
      if (!id) return;
      const name = $nameNode.text().trim();
      const coords = extractCoords(name);
      if (!coords) return;
      const wood = parseNumber($tr.find('.wood, .mwood').first().text());
      const stone = parseNumber($tr.find('.stone, .mstone').first().text());
      const iron = parseNumber($tr.find('.iron, .miron').first().text());
      if ([wood, stone, iron].every(v => v === 0)) return;
      const cellsText = $tr.text();
      const merchantMatches = [...cellsText.matchAll(/(\d+[\.,]?\d*)\s*\/\s*(\d+[\.,]?\d*)/g)];
      let availableMerchants = 0, totalMerchants = 0, farmUsed = 0, farmTotal = 0;
      if (merchantMatches.length >= 1) {
        availableMerchants = parseNumber(merchantMatches[0][1]);
        totalMerchants = parseNumber(merchantMatches[0][2]);
      }
      if (merchantMatches.length >= 2) {
        farmUsed = parseNumber(merchantMatches[merchantMatches.length - 1][1]);
        farmTotal = parseNumber(merchantMatches[merchantMatches.length - 1][2]);
      }
      const warehouseCapacity = extractWarehouseCapacity($tr, wood, stone, iron);
      const points = extractPointsFromRow($tr);
      const incoming = incomingMap[id] || { wood: 0, stone: 0, iron: 0 };
      const url = $nameNode.find('a').first().attr('href') || '#';
      villages.push({ id, name, url, x: coords.x, y: coords.y, points, wood, stone, iron, incomingWood: incoming.wood || 0, incomingStone: incoming.stone || 0, incomingIron: incoming.iron || 0, warehouseCapacity, availableMerchants, totalMerchants, farmUsed, farmTotal });
    });
    if (!villages.length) throw new Error('Не удалось разобрать таблицу деревень.');
    return villages;
  }

  function extractWarehouseCapacity($tr, wood, stone, iron) {
    let best = 0;
    $tr.children().each((_, td) => {
      const num = parseNumber($(td).text());
      if (num > Math.max(wood, stone, iron) && num > best) best = num;
    });
    return best || Math.max(wood, stone, iron);
  }

  function extractPointsFromRow($tr) {
    let points = 0;
    $tr.children().each((_, td) => {
      const text = $(td).text().trim();
      if (text.includes('|')) return;
      const num = parseNumber(text);
      if (num > points) points = num;
    });
    return points;
  }

  function buildPlan(villages, settings) {
    const whiteList = parseList(settings.whiteList);
    const blackList = parseList(settings.blackList);
    const candidates = villages.filter(v => passesListFilters(v, whiteList, blackList, settings.useWhiteListOnly));
    const sources = candidates.map(v => analyzeVillageAsSource(v, settings));
    const targets = candidates.map(v => analyzeVillageAsTarget(v, settings));
    const sourceMap = new Map(sources.map(v => [v.id, v]));
    const prioritizedTargets = targets.filter(t => t.needTotal > 0).sort((a, b) => (b.priorityScore - a.priorityScore) || (b.needTotal - a.needTotal));
    const plan = [];
    let totalMerchantsUsed = 0;
    for (const target of prioritizedTargets) {
      const eligibleSources = [...sources]
        .filter(src => src.id !== target.id)
        .filter(src => src.availableMerchants >= settings.minMerchantsInSource)
        .filter(src => src.supplyTotal > 0)
        .map(src => ({ ...src, distance: distance(src.x, src.y, target.x, target.y), travelMinutes: merchantTravelMinutes(src.x, src.y, target.x, target.y) }))
        .filter(src => src.travelMinutes <= settings.maxTravelMinutes)
        .sort((a, b) => (a.travelMinutes - b.travelMinutes) || (b.priorityScore - a.priorityScore) || (b.supplyTotal - a.supplyTotal));
      for (const src of eligibleSources) {
        if (plan.length >= settings.maxOrdersPerRun || totalMerchantsUsed >= settings.maxMerchantsPerRun) break;
        const liveSrc = sourceMap.get(src.id);
        if (!liveSrc || liveSrc.availableMerchants < settings.minMerchantsInSource || liveSrc.supplyTotal <= 0) continue;
        const moved = allocateResources(liveSrc, target, settings);
        if (!moved) continue;
        const merchants = Math.ceil((moved.wood + moved.stone + moved.iron) / 1000);
        if (!merchants) continue;
        if (totalMerchantsUsed + merchants > settings.maxMerchantsPerRun) break;
        plan.push({ sourceId: liveSrc.id, targetId: target.id, wood: moved.wood, stone: moved.stone, iron: moved.iron, merchants, distance: distance(liveSrc.x, liveSrc.y, target.x, target.y), travelMinutes: merchantTravelMinutes(liveSrc.x, liveSrc.y, target.x, target.y) });
        totalMerchantsUsed += merchants;
      }
      if (plan.length >= settings.maxOrdersPerRun || totalMerchantsUsed >= settings.maxMerchantsPerRun) break;
    }
    return mergeOrders(plan);
  }

  function analyzeVillageAsSource(village, settings) {
    const reserveByPercent = Math.floor(village.warehouseCapacity * settings.sourceReservePercent);
    let extraWood = Math.max(0, village.wood - Math.max(settings.sourceReserveWood, reserveByPercent));
    let extraStone = Math.max(0, village.stone - Math.max(settings.sourceReserveStone, reserveByPercent));
    let extraIron = Math.max(0, village.iron - Math.max(settings.sourceReserveIron, reserveByPercent));
    if (village.points >= settings.builtOutHighPoints || village.farmUsed >= settings.builtOutHighFarm) {
      const keep = Math.floor(village.warehouseCapacity * settings.builtOutWarehouseKeep);
      extraWood = Math.max(extraWood, Math.max(0, village.wood - keep));
      extraStone = Math.max(extraStone, Math.max(0, village.stone - keep));
      extraIron = Math.max(extraIron, Math.max(0, village.iron - keep));
    }
    extraWood = roundDownTo1000(extraWood); extraStone = roundDownTo1000(extraStone); extraIron = roundDownTo1000(extraIron);
    return { ...village, extraWood, extraStone, extraIron, supplyTotal: extraWood + extraStone + extraIron, priorityScore: village.points >= settings.minSourcePointsPriority ? 2 : 1 };
  }

  function analyzeVillageAsTarget(village, settings) {
    const incomingWood = settings.includeIncoming ? village.incomingWood : 0;
    const incomingStone = settings.includeIncoming ? village.incomingStone : 0;
    const incomingIron = settings.includeIncoming ? village.incomingIron : 0;
    const isPriority = settings.prioritizeSmallVillages && village.points <= settings.maxTargetPointsPriority;
    const targetFill = isPriority ? settings.targetWarehouseFillPriority : settings.targetWarehouseFillNormal;
    const targetAmount = Math.floor(village.warehouseCapacity * targetFill);
    const needWood = roundDownTo1000(Math.max(0, targetAmount - (village.wood + incomingWood)));
    const needStone = roundDownTo1000(Math.max(0, targetAmount - (village.stone + incomingStone)));
    const needIron = roundDownTo1000(Math.max(0, targetAmount - (village.iron + incomingIron)));
    return { ...village, needWood, needStone, needIron, needTotal: needWood + needStone + needIron, priorityScore: isPriority ? 3 : village.points <= settings.maxTargetPointsPriority ? 2 : 1 };
  }

  function allocateResources(source, target, settings) {
    const wood = transferAmount(source.extraWood, target.needWood, settings.minBatchPerResource);
    const stone = transferAmount(source.extraStone, target.needStone, settings.minBatchPerResource);
    const iron = transferAmount(source.extraIron, target.needIron, settings.minBatchPerResource);
    const total = wood + stone + iron;
    if (total <= 0) return null;
    const merchantsNeeded = Math.ceil(total / 1000);
    if (merchantsNeeded > source.availableMerchants) {
      const ratio = source.availableMerchants / merchantsNeeded;
      const reduced = { wood: roundDownTo1000(Math.floor(wood * ratio)), stone: roundDownTo1000(Math.floor(stone * ratio)), iron: roundDownTo1000(Math.floor(iron * ratio)) };
      if (reduced.wood + reduced.stone + reduced.iron <= 0) return null;
      applyTransfer(source, target, reduced);
      return reduced;
    }
    const moved = { wood, stone, iron };
    applyTransfer(source, target, moved);
    return moved;
  }

  function applyTransfer(source, target, moved) {
    source.extraWood -= moved.wood; source.extraStone -= moved.stone; source.extraIron -= moved.iron; source.supplyTotal -= moved.wood + moved.stone + moved.iron; source.availableMerchants -= Math.ceil((moved.wood + moved.stone + moved.iron) / 1000);
    target.needWood -= moved.wood; target.needStone -= moved.stone; target.needIron -= moved.iron; target.needTotal -= moved.wood + moved.stone + moved.iron;
  }

  function transferAmount(available, needed, minBatch) {
    const amount = Math.min(available, needed);
    if (amount < minBatch) return 0;
    return roundDownTo1000(amount);
  }

  function mergeOrders(plan) {
    const map = new Map();
    for (const order of plan) {
      const key = `${order.sourceId}:${order.targetId}`;
      const prev = map.get(key) || { ...order, wood: 0, stone: 0, iron: 0, merchants: 0 };
      prev.wood += order.wood; prev.stone += order.stone; prev.iron += order.iron; prev.merchants = Math.ceil((prev.wood + prev.stone + prev.iron) / 1000);
      map.set(key, prev);
    }
    return [...map.values()].sort((a, b) => a.travelMinutes - b.travelMinutes);
  }

  async function autoSendPlan() {
    if (!state.plan.length) return UI.ErrorMessage(TEXT.noPlan);
    let sent = 0;
    for (const order of state.plan) {
      await sendSingleOrder(order);
      sent += 1;
      await wait(state.settings.sendDelayMs);
    }
    UI.SuccessMessage(`Автоотправка завершена. Отправлено: ${sent}.`);
  }

  async function sendSingleOrder(order) {
    const payload = { target_id: order.targetId, wood: order.wood, stone: order.stone, iron: order.iron };
    return new Promise(resolve => {
      TribalWars.post('market', { ajaxaction: 'map_send', village: order.sourceId }, payload, response => {
        state.sentOrders.push(order);
        UI.SuccessMessage(response?.message || `Отправлено ${order.merchants} торговцев.`);
        resolve(response);
      }, false);
    });
  }

  function showReportDialog() {
    Dialog.show('content', `<div class="ax-card" style="min-width:700px;max-width:96vw;color:#fff"><div class="ax-head"><div class="ax-title">Отчёт</div></div><div class="ax-section">Построено отправок: ${state.plan.length}</div></div>`);
  }

  function showBalanceResultDialog() {
    Dialog.show('content', `<div class="ax-card" style="min-width:700px;max-width:96vw;color:#fff"><div class="ax-head"><div class="ax-title">Результат баланса</div></div><div class="ax-section">Отправок в плане: ${state.plan.length}</div></div>`);
  }

  function buildSummary(villages, plan) {
    return { totalVillages: villages.length, orders: plan.length, merchantsUsed: plan.reduce((sum, row) => sum + row.merchants, 0) };
  }

  function parseList(value) {
    return new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean));
  }

  function passesListFilters(village, whiteList, blackList, useWhiteListOnly) {
    const keyId = String(village.id), keyCoord = `${village.x}|${village.y}`;
    if (blackList.has(keyId) || blackList.has(keyCoord)) return false;
    if (!useWhiteListOnly) return true;
    return whiteList.has(keyId) || whiteList.has(keyCoord);
  }

  function merchantTravelMinutes(x1, y1, x2, y2) {
    const dist = distance(x1, y1, x2, y2);
    const worldSpeed = Number(game_data?.speed || game_data?.world_speed || 1) || 1;
    const unitSpeed = Number(game_data?.unit_speed || 1) || 1;
    return Math.ceil((dist * 10 / worldSpeed / unitSpeed) * 60) / 60;
  }

  function distance(x1, y1, x2, y2) { return Math.hypot(Number(x1) - Number(x2), Number(y1) - Number(y2)); }
  function extractCoords(name) { const m = String(name).match(/(\d{1,3})\|(\d{1,3})/); return m ? { x: Number(m[1]), y: Number(m[2]) } : null; }
  function parseNumber(value) { const clean = String(value == null ? '' : value).replace(/\./g, '').replace(/,/g, '').replace(/\s+/g, ''); const m = clean.match(/-?\d+/); return m ? Number(m[0]) : 0; }
  function format(value) { return Number(value || 0).toLocaleString('ru-RU'); }
  function roundDownTo1000(value) { return Math.max(0, Math.floor(Number(value || 0) / 1000) * 1000); }
  function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  function mountRoot(html) { const target = $('#content_value').length ? $('#content_value') : $('#contentContainer'); target.prepend(html); }
  function escapeHtml(value) { return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function checkboxField(name, label, checked) { return `<div class="ax-field"><label for="${SCRIPT_ID}-${name}">${label}</label><div class="ax-inline"><input id="${SCRIPT_ID}-${name}" type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="ax-pill">${checked ? TEXT.yes : TEXT.no}</span></div></div>`; }
  function numberField(name, label, value, step = 1) { return `<div class="ax-field"><label for="${SCRIPT_ID}-${name}">${label}</label><input id="${SCRIPT_ID}-${name}" type="number" step="${step}" name="${name}" value="${value}"></div>`; }
  function textField(name, label, value) { return `<div class="ax-field"><label for="${SCRIPT_ID}-${name}">${label}</label><input id="${SCRIPT_ID}-${name}" type="text" name="${name}" value="${escapeHtml(value)}"></div>`; }
})();