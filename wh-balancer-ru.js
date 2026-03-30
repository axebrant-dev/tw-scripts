(() => {
'use strict';

const SCRIPT_ID = 'axebrant-wh-balancer-ru';

const state = {
villages: [],
};

start();

async function start() {
try {
cleanupUi();
render('Загрузка...');

```
  const html = await fetchPage('game.php?screen=overview_villages&mode=prod&page=-1');
  state.villages = parseProduction(html);

  render(`Найдено деревень: ${state.villages.length}`);
  console.log('[WH BALANCER]', state.villages);

} catch (e) {
  console.error(e);
  render('Ошибка: ' + e.message);
}
```

}

function fetchPage(url) {
return new Promise((resolve, reject) => {
$.get(url).done(resolve).fail(reject);
});
}

function parseProduction(html) {
const doc = $(html);
const villages = [];

```
doc.find('#production_table tr').each((_, tr) => {
  const $tr = $(tr);

  const nameNode = $tr.find('.quickedit-vn');
  if (!nameNode.length) return;

  const id = nameNode.data('id');
  const name = nameNode.text().trim();

  const coordsMatch = name.match(/(\d+)\|(\d+)/);
  if (!coordsMatch) return;

  const x = Number(coordsMatch[1]);
  const y = Number(coordsMatch[2]);

  // РЕСУРСЫ (ВАЖНО — все в одной ячейке)
  const resCell = $tr.find('td').eq(3);
  if (!resCell.length) return;

  const numbers = resCell.text().match(/\d+/g);
  if (!numbers || numbers.length < 3) return;

  const wood = Number(numbers[0]);
  const stone = Number(numbers[1]);
  const iron = Number(numbers[2]);

  // СКЛАД
  const warehouse = Number($tr.find('td').eq(4).text().replace(/\D/g, ''));

  // ТОРГОВЦЫ
  const merchantsText = $tr.find('td').eq(5).text();
  const merchantsMatch = merchantsText.match(/(\d+)\s*\/\s*(\d+)/);

  let availableMerchants = 0;
  if (merchantsMatch) {
    availableMerchants = Number(merchantsMatch[1]);
  }

  villages.push({
    id,
    name,
    x,
    y,
    wood,
    stone,
    iron,
    warehouse,
    availableMerchants
  });
});

if (!villages.length) {
  throw new Error('Не удалось распарсить таблицу');
}

return villages;
```

}

function render(text) {
$('#content_value').prepend(`       <div id="${SCRIPT_ID}" style="padding:10px;background:#222;color:#fff;margin-bottom:10px;border-radius:8px;">
        ${text}       </div>
    `);
}

function cleanupUi() {
$('#' + SCRIPT_ID).remove();
}

})();
