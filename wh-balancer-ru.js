(() => {
  'use strict';

  const SCRIPT_ID = 'axebrant-wh-balancer-ru';
  const STYLE_ID = `${SCRIPT_ID}-style`;
  const ROOT_ID = `${SCRIPT_ID}-root`;
  const STORAGE_KEY = 'axebrantWHBalancerRUSettings';

  const TEXT = {
    title: 'Балансировщик склада',
    subtitle: 'Русская локальная версия',
    source: 'Источник',
    target: 'Получатель',
    distance: 'Расст.',
    time: 'Время',
    wood: 'Дерево',
    stone: 'Глина',
    iron: 'Железо',
    merchants: 'Торг.',
    action: 'Действие',
    send: 'Отправить',
    runAuto: 'Запустить автоотправку',
    settings: 'Настройки',
    apply: 'Сохранить и пересчитать',
    reset: 'Сбросить',
    report: 'Отчёт',
    result: 'Результат',
    noPlan: 'Подходящих отправок не найдено.',
    loaded: 'Данные загружены.'
  };

  const DEFAULTS = {
    includeIncoming: true,
    autoSend: false,
    previewBeforeAutoSend: true,
    prioritizeSmallVillages: true,
    minSourcePointsPriority: 6000,
    maxTargetPointsPriority: 3000,
    maxTravelMinutes: 180,
    minBatchPerResource: 1000,
    minMerchantsInSource: 1,
    maxOrdersPerRun: 60,
    maxMerchantsPerRun: 500,
    sendDelayMs: 350,
    targetWarehouseFillPriority: 0.90,
    targetWarehouseFillNormal: 0.65,
    builtOutWarehouseKeep: 0.25,
    builtOutHighFarm: 23000,
    builtOutHighPoints: 9000,
    sourceReserveWood: 30000,
    sourceReserveStone: 30000,
    sourceReserveIron: 30000,
    sourceReservePercent: 0.20,
    useWhiteListOnly: false,
    whiteList: '',
    blackList: ''
  };

  const state = {
    settings: loadSettings(),
    villages: [],
    incoming: {},
    plan: [],
    sentOrders: [],
    summary: null
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
        fetchPage(urls.productionUrl)
      ]);

      state.incoming = state.settings.includeIncoming ? parseIncomingPage(incomingHtml) : {};
      state.villages = parseProductionPage(prodHtml, state.incoming);
      state.plan = buildPlan(state.villages, state.settings);
      state.summary = buildSummary(state.villages, state.plan);

      renderUi();
      console.log(`[${SCRIPT_ID}] villages`, state.villages);
      console.log(`[${SCRIPT_ID}] incoming`, state.incoming);
      console.log(`[${SCRIPT_ID}] plan`, state.plan);

      if (state.settings.autoSend && state.plan.length > 0) {
        if (state.settings.previewBeforeAutoSend) {
          UI.SuccessMessage('План построен. Проверь список и нажми «Запустить автоотправку».');
        } else {
          await autoSendPlan();
        }
      } else {
        UI.SuccessMessage(TEXT.loaded);
      }
    } catch (error) {
      console.error(`[${SCRIPT_ID}]`, error);
      renderShell(`Ошибка: ${escapeHtml(error.message || String(error))}`);
      UI.ErrorMessage(`Балансировщик: ${error.message || error}`);
    }
  }

  function fetchPage(url) {
    return new Promise((resolve, reject) => {
      $.get(url)
        .done(resolve)
        .fail((xhr, status, err) => {
          reject(new Error(`Не удалось загрузить ${url}: ${err || status}`));
        });
    });
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
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{margin:12px 0;color:#f3f6fb;font-family:Arial,sans-serif}
      #${ROOT_ID} *{box-sizing:border-box}
      #${ROOT_ID} .ax-card{background:linear-gradient(180deg,#2d3138,#1d2025);border:1px solid #46505f;border-radius:12px;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.18)}
      #${ROOT_ID} .ax-head{padding:14px 16px;background:linear-gradient(180deg,#3a4150,#232831);display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}
      #${ROOT_ID} .ax-title{font-size:18px;font-weight:700}
      #${ROOT_ID} .ax-sub{font-size:12px;opacity:.8}
      #${ROOT_ID} .ax-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;padding:12px}
      #${ROOT_ID} .ax-box{background:#262b33;border:1px solid #394150;border-radius:10px;padding:10px}
      #${ROOT_ID} .ax-box h4{margin:0 0 8px;font-size:13px;color:#b8c8e7}
      #${ROOT_ID} .ax-kv{display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:3px 0}
      #${ROOT_ID} .ax-actions{display:flex;gap:8px;flex-wrap:wrap}
      #${ROOT_ID} .ax-btn{cursor:pointer;border:none;border-radius:8px;padding:8px 12px;font-weight:700;color:#fff;background:linear-gradient(180deg,#496aab,#28457c)}
      #${ROOT_ID} .ax-btn.secondary{background:linear-gradient(180deg,#5b616c,#373c44)}
      #${ROOT_ID} .ax-btn.warn{background:linear-gradient(180deg,#8a5a3c,#6f4127)}
      #${ROOT_ID} .ax-section{padding:0 12px 12px}
      #${ROOT_ID} .ax-table-wrap{overflow:auto;border:1px solid #394150;border-radius:10px}
      #${ROOT_ID} table.ax-table{width:100%;border-collapse:collapse;font-size:12px;background:#22262d}
      #${ROOT_ID} .ax-table th{position:sticky;top:0;background:#1a1e24;z-index:1}
      #${ROOT_ID} .ax-table th,#${ROOT_ID} .ax-table td{border-bottom:1px solid #353d4a;padding:8px;text-align:center;white-space:nowrap}
      #${ROOT_ID} .ax-table tr:nth-child(even){background:#272c34}
      #${ROOT_ID} .ax-form{padding:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px}
      #${ROOT_ID} .ax-field{background:#262b33;border:1px solid #394150;border-radius:10px;padding:10px}
      #${ROOT_ID} .ax-field label{display:block;font-size:12px;margin-bottom:6px;color:#b8c8e7}
      #${ROOT_ID} .ax-field input[type="number"],#${ROOT_ID} .ax-field input[type="text"]{width:100%;border:1px solid #4c5667;border-radius:8px;padding:8px;background:#1d2128;color:#fff}
      #${ROOT_ID} .ax-inline{display:flex;align-items:center;gap:8px}
      #${ROOT_ID} .ax-muted{color:#b8c8e7;font-size:12px}
      #${ROOT_ID} .ax-pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#1d2430;border:1px solid #42506a;font-size:12px}
      #${ROOT_ID} .ax-link{color:#8fc3ff;text-decoration:none}
    `;
    document.head.appendChild(style);
  }

  function renderShell(message) {
    mountRoot(`
      <div id="${ROOT_ID}">
        <div class="ax-card">
          <div class="ax-head">
            <div>
              <div class="ax-title">${TEXT.title}</div>
              <div class="ax-sub">${TEXT.subtitle}</div>
            </div>
          </div>
          <div class="ax-section" style="padding-top:12px">${message}</div>
        </div>
      </div>
    `);
  }

  function renderUi() {
    const s = state.settings;
    const sum = state.summary;

    mountRoot(`
      <div id="${ROOT_ID}">
        <div class="ax-card">
          <div class="ax-head">
            <div>
              <div class="ax-title">${TEXT.title}</div>
              <div class="ax-sub">Рабочая версия под RU overview_villages → Производство</div>
            </div>
            <div class="ax-actions">
              <button class="ax-btn secondary" id="${SCRIPT_ID}-toggle-settings">${TEXT.settings}</button>
              <button class="ax-btn secondary" id="${SCRIPT_ID}-show-report">${TEXT.report}</button>
              <button class="ax-btn secondary" id="${SCRIPT_ID}-show-result">${TEXT.result}</button>
              <button class="ax-btn" id="${SCRIPT_ID}-run-auto">${TEXT.runAuto}</button>
            </div>
          </div>

          <div class="ax-grid">
            <div class="ax-box">
              <h4>Сводка</h4>
              <div class="ax-kv"><span>Деревень</span><strong>${sum.totalVillages}</strong></div>
              <div class="ax-kv"><span>План отправок</span><strong>${sum.orders}</strong></div>
              <div class="ax-kv"><span>Торговцев в плане</span><strong>${sum.merchantsUsed}</strong></div>
              <div class="ax-kv"><span>Всего дерево</span><strong>${format(sum.totalWood)}</strong></div>
              <div class="ax-kv"><span>Всего глина</span><strong>${format(sum.totalStone)}</strong></div>
              <div class="ax-kv"><span>Всего железо</span><strong>${format(sum.totalIron)}</strong></div>
            </div>
            <div class="ax-box">
              <h4>Приоритеты</h4>
              <div class="ax-kv"><span>Источники от очков</span><strong>${format(s.minSourcePointsPriority)}</strong></div>
              <div class="ax-kv"><span>Получатели до очков</span><strong>${format(s.maxTargetPointsPriority)}</strong></div>
              <div class="ax-kv"><span>Макс. время доставки</span><strong>${s.maxTravelMinutes} мин</strong></div>
              <div class="ax-kv"><span>Мин. партия</span><strong>${format(s.minBatchPerResource)}</strong></div>
            </div>
            <div class="ax-box">
              <h4>Диагностика</h4>
              <div class="ax-kv"><span>С учётом входящих</span><strong>${s.includeIncoming ? 'Да' : 'Нет'}</strong></div>
              <div class="ax-kv"><span>Автоотправка</span><strong>${s.autoSend ? 'Да' : 'Нет'}</strong></div>
              <div class="ax-kv"><span>Предпросмотр</span><strong>${s.previewBeforeAutoSend ? 'Да' : 'Нет'}</strong></div>
              <div class="ax-kv"><span>Малые деревни в приоритете</span><strong>${s.prioritizeSmallVillages ? 'Да' : 'Нет'}</strong></div>
            </div>
          </div>

          <div id="${SCRIPT_ID}-settings" style="display:none">
            ${renderSettingsForm(s)}
          </div>

          <div class="ax-section">
            <div class="ax-table-wrap">
              ${renderPlanTable()}
            </div>
          </div>
        </div>
      </div>
    `);

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
        ${numberField('minMerchantsInSource', 'Мин. торговцев в источнике', s.minMerchantsInSource)}
        ${numberField('maxOrdersPerRun', 'Макс. отправок за цикл', s.maxOrdersPerRun)}
        ${numberField('maxMerchantsPerRun', 'Макс. торговцев за цикл', s.maxMerchantsPerRun)}
        ${numberField('sendDelayMs', 'Задержка между отправками, мс', s.sendDelayMs)}

        ${numberField('targetWarehouseFillPriority', 'Заполнять приоритетные деревни до доли склада', s.targetWarehouseFillPriority, 0.01)}
        ${numberField('targetWarehouseFillNormal', 'Заполнять обычные деревни до доли склада', s.targetWarehouseFillNormal, 0.01)}

        ${numberField('builtOutWarehouseKeep', 'Оставлять в развитых деревнях долю склада', s.builtOutWarehouseKeep, 0.01)}
        ${numberField('builtOutHighFarm', 'Считать развитой по населению от', s.builtOutHighFarm)}
        ${numberField('builtOutHighPoints', 'Считать развитой по очкам от', s.builtOutHighPoints)}

        ${numberField('sourceReserveWood', 'Мин. остаток дерева', s.sourceReserveWood)}
        ${numberField('sourceReserveStone', 'Мин. остаток глины', s.sourceReserveStone)}
        ${numberField('sourceReserveIron', 'Мин. остаток железа', s.sourceReserveIron)}
        ${numberField('sourceReservePercent', 'Мин. доля склада в источнике', s.sourceReservePercent, 0.01)}

        ${textField('whiteList', 'Белый список id/координат через запятую', s.whiteList)}
        ${textField('blackList', 'Чёрный список id/координат через запятую', s.blackList)}
        ${checkboxField('useWhiteListOnly', 'Использовать только белый список', s.useWhiteListOnly)}

        <div class="ax-field" style="grid-column:1/-1">
          <div class="ax-actions">
            <button type="submit" class="ax-btn">${TEXT.apply}</button>
            <button type="button" class="ax-btn warn" id="${SCRIPT_ID}-reset">${TEXT.reset}</button>
          </div>
        </div>
      </form>
    `;
  }

  function renderPlanTable() {
    if (!state.plan.length) {
      return `<div class="ax-section ax-muted">${TEXT.noPlan}</div>`;
    }

    const rows = state.plan.map((order, index) => {
      const source = state.villages.find(v => v.id === order.sourceId);
      const target = state.villages.find(v => v.id === order.targetId);

      return `
        <tr>
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
        </tr>
      `;
    }).join('');

    return `
      <table class="ax-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${TEXT.source}</th>
            <th>${TEXT.target}</th>
            <th>${TEXT.distance}</th>
            <th>${TEXT.time}</th>
            <th>${TEXT.wood}</th>
            <th>${TEXT.stone}</th>
            <th>${TEXT.iron}</th>
            <th>${TEXT.merchants}</th>
            <th>${TEXT.action}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function bindUi() {
    $(`#${SCRIPT_ID}-toggle-settings`).off('click').on('click', () => {
      $(`#${SCRIPT_ID}-settings`).toggle();
    });

    $(`#${SCRIPT_ID}-form`).off('submit').on('submit', event => {
      event.preventDefault();
      saveSettings(formToSettings(event.currentTarget));
      start();
    });

    $(`#${SCRIPT_ID}-reset`).off('click').on('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      state.settings = { ...DEFAULTS };
      start();
    });

    $(`#${SCRIPT_ID}-show-report`).off('click').on('click', showReportDialog);
    $(`#${SCRIPT_ID}-show-result`).off('click').on('click', showBalanceResultDialog);
    $(`#${SCRIPT_ID}-run-auto`).off('click').on('click', autoSendPlan);

    $(`.${SCRIPT_ID}-send-one`).off('click').on('click', async event => {
      const index = Number($(event.currentTarget).data('index'));
      const order = state.plan[index];
      if (order) await sendSingleOrder(order);
    });
  }

  function formToSettings(form) {
    const data = new FormData(form);
    const result = { ...DEFAULTS };

    Object.keys(DEFAULTS).forEach(key => {
      if (typeof DEFAULTS[key] === 'boolean') {
        result[key] = data.get(key) === 'on';
      } else if (typeof DEFAULTS[key] === 'number') {
        result[key] = Number(data.get(key));
      } else {
        result[key] = String(data.get(key) || '');
      }
    });

    result.targetWarehouseFillPriority = clamp(result.targetWarehouseFillPriority, 0.1, 0.99);
    result.targetWarehouseFillNormal = clamp(result.targetWarehouseFillNormal, 0.1, 0.99);
    result.builtOutWarehouseKeep = clamp(result.builtOutWarehouseKeep, 0.05, 0.95);
    result.sourceReservePercent = clamp(result.sourceReservePercent, 0, 0.95);

    return result;
  }

  function parseProductionPage(html, incomingMap) {
    const doc = $(html);
    const villages = [];

    doc.find('#production_table tr').each((_, tr) => {
      const $tr = $(tr);
      const $nameNode = $tr.find('.quickedit-vn').first();
      if (!$nameNode.length) return;

      const cells = $tr.children('td');
      if (cells.length < 7) return;

      const id = String($nameNode.data('id') || '').trim();
      if (!id) return;

      const name = $nameNode.text().replace(/\s+/g, ' ').trim();
      const coords = extractCoords(name);
      if (!coords) return;

      const points = parseNumber($(cells[2]).text());
      const resourceCell = $(cells[3]);

      const wood = parseNumber(resourceCell.find('.res.wood').first().text());
      const stone = parseNumber(resourceCell.find('.res.stone').first().text());
      const iron = parseNumber(resourceCell.find('.res.iron').first().text());

      const warehouseCapacity = parseNumber($(cells[4]).text());

      const merchantsMatch = $(cells[5]).text().match(/(\d+)\s*\/\s*(\d+)/);
      const availableMerchants = merchantsMatch ? Number(merchantsMatch[1]) : 0;
      const totalMerchants = merchantsMatch ? Number(merchantsMatch[2]) : 0;

      const farmMatch = $(cells[6]).text().match(/(\d+)\s*\/\s*(\d+)/);
      const farmUsed = farmMatch ? Number(farmMatch[1]) : 0;
      const farmTotal = farmMatch ? Number(farmMatch[2]) : 0;

      const incoming = incomingMap[id] || { wood: 0, stone: 0, iron: 0 };
      const url = $nameNode.find('a').first().attr('href') || '#';

      villages.push({
        id,
        name,
        url,
        x: coords.x,
        y: coords.y,
        points,
        wood,
        stone,
        iron,
        warehouseCapacity,
        availableMerchants,
        totalMerchants,
        farmUsed,
        farmTotal,
        incomingWood: incoming.wood || 0,
        incomingStone: incoming.stone || 0,
        incomingIron: incoming.iron || 0
      });
    });

    if (!villages.length) {
      throw new Error('Не удалось разобрать таблицу деревень на странице Производство.');
    }

    return villages;
  }

  function parseIncomingPage(html) {
    const doc = $(html);
    const result = {};

    doc.find('#trades_table tr').each((_, tr) => {
      const $tr = $(tr);
      const href = $tr.find('a[href*="id="]').last().attr('href') || '';
      const match = href.match(/id=(\d+)/);
      if (!match) return;

      const villageId = match[1];
      if (!result[villageId]) {
        result[villageId] = { wood: 0, stone: 0, iron: 0 };
      }

      result[villageId].wood += sumResourceInRow($tr, 'wood');
      result[villageId].stone += sumResourceInRow($tr, 'stone');
      result[villageId].iron += sumResourceInRow($tr, 'iron');
    });

    return result;
  }

  function sumResourceInRow($row, cls) {
    let total = 0;
    $row.find(`.res.${cls}, .icon.header.${cls}, .icon.mheader.${cls}, .${cls}, .m${cls}`).each((_, el) => {
      const text = $(el).parent().text() || $(el).text() || '';
      total += parseNumber(text);
    });
    return total;
  }

  function buildPlan(villages, settings) {
    const whiteList = parseList(settings.whiteList);
    const blackList = parseList(settings.blackList);
    const candidates = villages.filter(v => passesListFilters(v, whiteList, blackList, settings.useWhiteListOnly));

    const sources = candidates.map(v => analyzeVillageAsSource(v, settings));
    const targets = candidates.map(v => analyzeVillageAsTarget(v, settings));

    const liveSources = new Map(sources.map(v => [v.id, { ...v }]));
    const prioritizedTargets = targets
      .filter(t => t.needTotal > 0)
      .sort((a, b) => {
        if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
        return b.needTotal - a.needTotal;
      });

    const plan = [];
    let usedMerchants = 0;

    for (const target of prioritizedTargets) {
      const eligibleSources = [...liveSources.values()]
        .filter(src => src.id !== target.id)
        .filter(src => src.availableMerchants >= settings.minMerchantsInSource)
        .filter(src => src.supplyTotal > 0)
        .map(src => ({
          ...src,
          distance: distance(src.x, src.y, target.x, target.y),
          travelMinutes: merchantTravelMinutes(src.x, src.y, target.x, target.y)
        }))
        .filter(src => src.travelMinutes <= settings.maxTravelMinutes)
        .sort((a, b) => {
          if (a.travelMinutes !== b.travelMinutes) return a.travelMinutes - b.travelMinutes;
          if (a.priorityScore !== b.priorityScore) return b.priorityScore - a.priorityScore;
          return b.supplyTotal - a.supplyTotal;
        });

      for (const source of eligibleSources) {
        if (plan.length >= settings.maxOrdersPerRun) break;
        if (usedMerchants >= settings.maxMerchantsPerRun) break;

        const live = liveSources.get(source.id);
        if (!live) continue;
        if (live.availableMerchants < settings.minMerchantsInSource) continue;
        if (live.supplyTotal <= 0) continue;

        const moved = allocateResources(live, target, settings);
        if (!moved) continue;

        const merchants = Math.ceil((moved.wood + moved.stone + moved.iron) / 1000);
        if (!merchants) continue;
        if (usedMerchants + merchants > settings.maxMerchantsPerRun) break;

        plan.push({
          sourceId: live.id,
          targetId: target.id,
          wood: moved.wood,
          stone: moved.stone,
          iron: moved.iron,
          merchants,
          distance: distance(live.x, live.y, target.x, target.y),
          travelMinutes: merchantTravelMinutes(live.x, live.y, target.x, target.y)
        });

        usedMerchants += merchants;
      }

      if (plan.length >= settings.maxOrdersPerRun) break;
      if (usedMerchants >= settings.maxMerchantsPerRun) break;
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

    extraWood = roundDownTo1000(extraWood);
    extraStone = roundDownTo1000(extraStone);
    extraIron = roundDownTo1000(extraIron);

    return {
      ...village,
      extraWood,
      extraStone,
      extraIron,
      supplyTotal: extraWood + extraStone + extraIron,
      priorityScore: village.points >= settings.minSourcePointsPriority ? 2 : 1
    };
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

    return {
      ...village,
      needWood,
      needStone,
      needIron,
      needTotal: needWood + needStone + needIron,
      priorityScore: isPriority ? 3 : village.points <= settings.maxTargetPointsPriority ? 2 : 1
    };
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
      const reduced = {
        wood: roundDownTo1000(Math.floor(wood * ratio)),
        stone: roundDownTo1000(Math.floor(stone * ratio)),
        iron: roundDownTo1000(Math.floor(iron * ratio))
      };
      if (reduced.wood + reduced.stone + reduced.iron <= 0) return null;
      applyTransfer(source, target, reduced);
      return reduced;
    }

    const moved = { wood, stone, iron };
    applyTransfer(source, target, moved);
    return moved;
  }

  function applyTransfer(source, target, moved) {
    source.extraWood -= moved.wood;
    source.extraStone -= moved.stone;
    source.extraIron -= moved.iron;
    source.supplyTotal -= moved.wood + moved.stone + moved.iron;
    source.availableMerchants -= Math.ceil((moved.wood + moved.stone + moved.iron) / 1000);

    target.needWood -= moved.wood;
    target.needStone -= moved.stone;
    target.needIron -= moved.iron;
    target.needTotal -= moved.wood + moved.stone + moved.iron;
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
      prev.wood += order.wood;
      prev.stone += order.stone;
      prev.iron += order.iron;
      prev.merchants = Math.ceil((prev.wood + prev.stone + prev.iron) / 1000);
      map.set(key, prev);
    }

    return [...map.values()].sort((a, b) => a.travelMinutes - b.travelMinutes);
  }

  async function autoSendPlan() {
    if (!state.plan.length) {
      UI.ErrorMessage(TEXT.noPlan);
      return;
    }

    let sent = 0;
    for (const order of state.plan) {
      await sendSingleOrder(order);
      sent += 1;
      await wait(state.settings.sendDelayMs);
    }

    UI.SuccessMessage(`Автоотправка завершена. Отправлено: ${sent}.`);
  }

  function sendSingleOrder(order) {
    const payload = {
      target_id: order.targetId,
      wood: order.wood,
      stone: order.stone,
      iron: order.iron
    };

    return new Promise(resolve => {
      TribalWars.post(
        'market',
        { ajaxaction: 'map_send', village: order.sourceId },
        payload,
        response => {
          state.sentOrders.push(order);
          UI.SuccessMessage(response?.message || `Отправлено ${order.merchants} торговцев.`);
          resolve(response);
        },
        false
      );
    });
  }

  function showReportDialog() {
    const sources = state.villages.map(v => analyzeVillageAsSource(v, state.settings)).filter(v => v.supplyTotal > 0);
    const targets = state.villages.map(v => analyzeVillageAsTarget(v, state.settings)).filter(v => v.needTotal > 0);

    const srcRows = sources.slice(0, 25).map(v => `
      <tr>
        <td>${escapeHtml(v.name)}</td>
        <td>${format(v.extraWood)}</td>
        <td>${format(v.extraStone)}</td>
        <td>${format(v.extraIron)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Нет</td></tr>';

    const trgRows = targets.slice(0, 25).map(v => `
      <tr>
        <td>${escapeHtml(v.name)}</td>
        <td>${format(v.needWood)}</td>
        <td>${format(v.needStone)}</td>
        <td>${format(v.needIron)}</td>
      </tr>
    `).join('') || '<tr><td colspan="4">Нет</td></tr>';

    Dialog.show('content', `
      <div class="ax-card" style="min-width:900px;max-width:96vw;color:#fff">
        <div class="ax-head"><div class="ax-title">Отчёт</div></div>
        <div class="ax-grid">
          <div class="ax-box">
            <h4>Излишки</h4>
            <table class="ax-table">
              <tr><th>Деревня</th><th>Дерево</th><th>Глина</th><th>Железо</th></tr>
              ${srcRows}
            </table>
          </div>
          <div class="ax-box">
            <h4>Дефицит</h4>
            <table class="ax-table">
              <tr><th>Деревня</th><th>Дерево</th><th>Глина</th><th>Железо</th></tr>
              ${trgRows}
            </table>
          </div>
        </div>
      </div>
    `);
  }

  function showBalanceResultDialog() {
    const totals = new Map(state.villages.map(v => [v.id, {
      ...v,
      woodTotal: v.wood + (state.settings.includeIncoming ? v.incomingWood : 0),
      stoneTotal: v.stone + (state.settings.includeIncoming ? v.incomingStone : 0),
      ironTotal: v.iron + (state.settings.includeIncoming ? v.incomingIron : 0),
      merchantsLeft: v.availableMerchants
    }]));

    state.plan.forEach(order => {
      const src = totals.get(order.sourceId);
      const trg = totals.get(order.targetId);
      if (src) {
        src.woodTotal -= order.wood;
        src.stoneTotal -= order.stone;
        src.ironTotal -= order.iron;
        src.merchantsLeft -= order.merchants;
      }
      if (trg) {
        trg.woodTotal += order.wood;
        trg.stoneTotal += order.stone;
        trg.ironTotal += order.iron;
      }
    });

    const rows = [...totals.values()].map(v => `
      <tr>
        <td>${escapeHtml(v.name)}</td>
        <td>${format(v.points)}</td>
        <td>${v.merchantsLeft}/${v.totalMerchants}</td>
        <td>${format(v.woodTotal)}</td>
        <td>${format(v.stoneTotal)}</td>
        <td>${format(v.ironTotal)}</td>
        <td>${format(v.warehouseCapacity)}</td>
      </tr>
    `).join('');

    Dialog.show('content', `
      <div class="ax-card" style="min-width:1000px;max-width:96vw;color:#fff">
        <div class="ax-head"><div class="ax-title">Результат баланса</div></div>
        <div class="ax-section">
          <div class="ax-table-wrap">
            <table class="ax-table">
              <tr>
                <th>Деревня</th>
                <th>Очки</th>
                <th>Торговцы</th>
                <th>Дерево</th>
                <th>Глина</th>
                <th>Железо</th>
                <th>Склад</th>
              </tr>
              ${rows}
            </table>
          </div>
        </div>
      </div>
    `);
  }

  function buildSummary(villages, plan) {
    return {
      totalVillages: villages.length,
      orders: plan.length,
      merchantsUsed: plan.reduce((sum, row) => sum + row.merchants, 0),
      totalWood: villages.reduce((sum, v) => sum + v.wood + (state.settings.includeIncoming ? v.incomingWood : 0), 0),
      totalStone: villages.reduce((sum, v) => sum + v.stone + (state.settings.includeIncoming ? v.incomingStone : 0), 0),
      totalIron: villages.reduce((sum, v) => sum + v.iron + (state.settings.includeIncoming ? v.incomingIron : 0), 0)
    };
  }

  function parseList(value) {
    return new Set(String(value || '').split(',').map(v => v.trim()).filter(Boolean));
  }

  function passesListFilters(village, whiteList, blackList, useWhiteListOnly) {
    const keyId = String(village.id);
    const keyCoord = `${village.x}|${village.y}`;
    if (blackList.has(keyId) || blackList.has(keyCoord)) return false;
    if (!useWhiteListOnly) return true;
    return whiteList.has(keyId) || whiteList.has(keyCoord);
  }

  function merchantTravelMinutes(x1, y1, x2, y2) {
    const dist = distance(x1, y1, x2, y2);
    const worldSpeed = Number(game_data?.speed || game_data?.world_speed || 1) || 1;
    const unitSpeed = Number(game_data?.unit_speed || 1) || 1;
  
    // Торговец: 10 минут на поле на скорости x1
    const minutes = dist * 10 / worldSpeed / unitSpeed;
    return Math.ceil(minutes);
  }

  function distance(x1, y1, x2, y2) {
    return Math.hypot(Number(x1) - Number(x2), Number(y1) - Number(y2));
  }

  function extractCoords(name) {
    const match = String(name).match(/(\d{1,3})\|(\d{1,3})/);
    return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
  }

  function parseNumber(value) {
    const clean = String(value == null ? '' : value)
      .replace(/\./g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '');
    const match = clean.match(/-?\d+/);
    return match ? Number(match[0]) : 0;
  }

  function format(value) {
    return Number(value || 0).toLocaleString('ru-RU');
  }

  function roundDownTo1000(value) {
    return Math.max(0, Math.floor(Number(value || 0) / 1000) * 1000);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function mountRoot(html) {
    const target = document.querySelector('#content_value') || document.querySelector('#contentContainer');
    if (target) target.insertAdjacentHTML('afterbegin', html);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function checkboxField(name, label, checked) {
    return `
      <div class="ax-field">
        <label for="${SCRIPT_ID}-${name}">${label}</label>
        <div class="ax-inline">
          <input id="${SCRIPT_ID}-${name}" type="checkbox" name="${name}" ${checked ? 'checked' : ''}>
          <span class="ax-pill">${checked ? 'Да' : 'Нет'}</span>
        </div>
      </div>
    `;
  }

  function numberField(name, label, value, step = 1) {
    return `
      <div class="ax-field">
        <label for="${SCRIPT_ID}-${name}">${label}</label>
        <input id="${SCRIPT_ID}-${name}" type="number" step="${step}" name="${name}" value="${value}">
      </div>
    `;
  }

  function textField(name, label, value) {
    return `
      <div class="ax-field">
        <label for="${SCRIPT_ID}-${name}">${label}</label>
        <input id="${SCRIPT_ID}-${name}" type="text" name="${name}" value="${escapeHtml(value)}">
      </div>
    `;
  }
})();
