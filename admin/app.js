'use strict';
const $ = selector => document.querySelector(selector);
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const personalizacaoLabels = { corSuporte: 'Cor - Suporte da munição', corTampa: 'Cor/Personalização - Tampa da caixa', corTrava: 'Cor - Trava' };
let activeStatus = 'aberto';
let allOrders = [];
const tabLabels = { aberto: 'Pedidos', producao: 'Em produção', finalizado: 'Finalizados', reaberto: 'Reabertos' };
function orderStatus(order) { return ['producao', 'finalizado', 'reaberto'].includes(order.status) ? order.status : 'aberto'; }
function renderTabs() {
  for (const button of document.querySelectorAll('[role="tab"]')) {
    const key = button.dataset.status;
    button.textContent = `${tabLabels[key]} (${allOrders.filter(o => orderStatus(o) === key).length})`;
    button.setAttribute('aria-selected', String(key === activeStatus));
    button.tabIndex = key === activeStatus ? 0 : -1;
  }
  const visible = allOrders.filter(o => orderStatus(o) === activeStatus);
  $('#contagem').textContent = `${visible.length} pedido${visible.length === 1 ? '' : 's'} · ${tabLabels[activeStatus]}`;
  $('#pedidos').setAttribute('aria-labelledby', 'tab-' + activeStatus);
  $('#pedidos').replaceChildren(...(visible.length ? visible.map(renderOrder) : [element('div', 'Nenhum pedido nesta aba.', 'empty')]));
}
for (const button of document.querySelectorAll('[role="tab"]')) {
  button.addEventListener('click', () => { activeStatus = button.dataset.status; renderTabs(); });
  button.addEventListener('keydown', event => {
    const keys = Object.keys(tabLabels); let index = keys.indexOf(activeStatus);
    if (event.key === 'ArrowRight') index = (index + 1) % keys.length;
    else if (event.key === 'ArrowLeft') index = (index + keys.length - 1) % keys.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = keys.length - 1;
    else return;
    event.preventDefault(); activeStatus = keys[index]; renderTabs(); $('#tab-' + activeStatus).focus();
  });
}
function status(message = '', error = false) { $('#status').textContent = message; $('#status').classList.toggle('error', error); }
function loggedOut() { document.getElementById('productsDialog')?.close(); $('#contaDialog').close(); $('#contaForm').reset(); editor.close(); allOrders = []; activeStatus = 'aberto'; $('#painel').hidden = true; $('#pedidos').replaceChildren(); $('#login').hidden = false; }
async function api(url, body) {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...(body ? { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Loja-Request': '1' }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) loggedOut();
    const error = new Error(data.erro || 'Não foi possível concluir a operação.'); error.status = response.status; throw error;
  }
  return data;
}
function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value != null) node.textContent = String(value); // Customer input is always text, never HTML.
  if (className) node.className = className;
  const bootstrapClass = { button: 'btn', input: 'form-control', textarea: 'form-control', select: 'form-select', label: 'form-label', table: 'table' }[tag];
  if (bootstrapClass) node.classList.add(bootstrapClass);
  return node;
}
function renderOrder(order) {
  const article = element('article', null, 'order');
  const head = element('header');
  const time = element('time', new Date(order.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' · Brasília');
  time.dateTime = order.dataHora;
  head.append(element('h2', `Pedido #${String(order.numero).padStart(5, '0')}`), time);
  const details = element('div', null, 'details');
  const customer = element('section'); const address = element('section'); const c = order.cliente;
  customer.append(element('h3', 'Cliente'), element('p', c.nome), element('p', c.email), element('p', c.telefone), element('p', `CPF: ${formatarCPF(c.cpf) || 'Não informado'}`));
  address.append(element('h3', 'Entrega'), element('p', `${c.logradouro}, ${c.numero}`),
    element('p', c.complemento || 'Sem complemento'), element('p', `${c.cidade} / ${c.estado} · CEP ${c.cep}`),
    element('p', `${order.frete.nome} · ${order.frete.prazo || 'Prazo não informado'}`));
  details.append(customer, address);
  const wrapper = element('div', null, 'table-wrap'); const table = element('table');
  const thead = element('thead'); const row = element('tr');
  for (const label of ['Produto', 'Qtd.', 'Unitário', 'Subtotal']) { const th = element('th', label); th.scope = 'col'; row.append(th); }
  thead.append(row); const tbody = element('tbody');
  for (const item of order.itens) { const tr = element('tr'); for (const value of [item.nome, item.quantidade, money(item.preco), money(item.subtotal)]) tr.append(element('td', value)); tbody.append(tr); }
  table.append(thead, tbody); wrapper.append(table);
  const totals = element('div', null, 'totals');
  for (const [label, value] of [['Subtotal', order.subtotal], ['Frete', order.frete.valor], ['Total', order.total]]) {
    const block = element('div', null, label === 'Total' ? 'grand' : ''); block.append(element('span', label), element('strong', money(value))); totals.append(block);
  }
  const badge = element('span', { aberto: 'Pedidos', producao: 'Em produção', finalizado: 'Finalizado', reaberto: 'Reaberto' }[orderStatus(order)], 'badge ' + (order.status === 'producao' ? 'production' : order.status === 'finalizado' ? 'done' : order.status === 'reaberto' ? 'reopened' : ''));
  head.append(badge);
  const notes = element('section', null, 'notes');
  notes.append(element('h3', 'Observações do cliente'));
  for (const [key, label] of Object.entries(personalizacaoLabels)) {
    notes.append(element('p', `${label}: ${order.personalizacao?.[key] || 'Não informado'}`, 'note-text'));
  }
  notes.append(element('h3', 'Observações internas'), element('p', order.observacoes || 'Nenhuma observação adicionada.', 'note-text'));
  if (order.finalizadoEm) notes.append(element('small', 'Finalizado em ' + new Date(order.finalizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })));
  const actions = element('div', null, 'order-actions');
  const edit = element('button', 'Alterar pedido'); edit.addEventListener('click', () => openEditor(order));
  const note = element('button', 'Editar observações', 'secondary'); note.addEventListener('click', () => openEditor(order, true));
  const finish = element('button', order.status === 'finalizado' ? 'Reabrir pedido' : 'Finalizar pedido', 'secondary');
  finish.addEventListener('click', () => changeOrder(order, order.status === 'finalizado' ? 'reabrir' : 'finalizar', finish));
  const remove = element('button', 'Deletar pedido', 'danger');
  remove.addEventListener('click', () => {
    if (confirm(`Deletar o pedido #${String(order.numero).padStart(5, '0')}? Ele será removido da lista e não poderá ser recuperado pelo painel.`)) changeOrder(order, 'excluir', remove);
  });
  actions.append(edit, note);
  if (['aberto', 'reaberto'].includes(orderStatus(order))) {
    const production = element('button', 'Em produção', 'secondary');
    production.addEventListener('click', () => changeOrder(order, 'producao', production));
    actions.append(production);
  }
  actions.append(finish, remove);
  article.append(head, details, wrapper, totals, notes, actions); return article;
}
let mutationBusy = false;
async function changeOrder(order, action, button) {
  if (mutationBusy) return;
  mutationBusy = true; button.disabled = true;
  try {
    await api(`/api/admin/pedidos/${order.numero}/${action}`, { revisao: order.revisao || 1 });
    if (action === 'finalizar') activeStatus = 'finalizado';
    if (action === 'reabrir') activeStatus = 'reaberto';
    if (action === 'producao') activeStatus = 'producao';
    await load();
    if (action !== 'excluir') $('#tab-' + activeStatus).focus();
    status('Pedido ' + ({ producao: 'movido para Em produção', finalizar: 'finalizado', reabrir: 'reaberto', excluir: 'excluído' }[action]) + ' com sucesso.');
  }
  catch (error) { status(error.message, true); }
  finally { mutationBusy = false; button.disabled = false; }
}
async function load(initial = false) {
  $('#atualizar').disabled = true;
  try {
    const { pedidos } = await api('/api/admin/pedidos');
    $('#login').hidden = true; $('#painel').hidden = false;
    allOrders = pedidos;
    renderTabs();
    status('Atualizado às ' + new Date().toLocaleTimeString('pt-BR'));
  } catch (error) {
    if (initial && error.status === 401) status('');
    else status(error.message, true);
  } finally { $('#atualizar').disabled = false; }
}
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); button.disabled = true; status('Entrando…');
  try { await api('/api/admin/login', { usuario: $('#usuario').value, senha: $('#senha').value }); $('#senha').value = ''; await load(); }
  catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
});
$('#atualizar').addEventListener('click', () => load());
$('#sair').addEventListener('click', async () => {
  try { await api('/api/admin/logout', {}); loggedOut(); status('Você saiu da área administrativa.'); $('#usuario').focus(); }
  catch (error) { status(error.message, true); }
});
load(true);
setInterval(() => { if (!$('#painel').hidden && !document.hidden && !editor.open && !mutationBusy) load(); }, 30000);

// Modal keeps unsaved changes isolated from the list's automatic refresh.
const editor = element('dialog', null, 'editor'); document.body.append(editor);
editor.setAttribute('aria-labelledby', 'edit-title');
let savingEdit = false;
editor.addEventListener('cancel', event => {
  if (savingEdit || !confirm('Descartar as alterações não salvas?')) event.preventDefault();
});
function openEditor(order, focusNotes = false) {
  if (mutationBusy) return;
  editor.replaceChildren();
  const form = element('form');
  const title = element('h2', `Alterar pedido #${String(order.numero).padStart(5, '0')}`); title.id = 'edit-title';
  form.append(title, element('p', 'Altere os dados necessários. O número e a data de entrada são mantidos.'));
  let fieldCounter = 0;
  function field(parent, label, value, options = {}) {
    const wrap = element('div', null, 'edit-field');
    const input = element(options.multiline ? 'textarea' : 'input');
    input.id = 'edit-field-' + (++fieldCounter);
    if (!options.multiline) input.type = options.type || 'text';
    input.value = value ?? ''; input.required = options.required !== false;
    input.maxLength = options.max || 200;
    if (options.type === 'number') { input.min = options.min ?? 0; input.max = options.limit ?? 100000; input.step = options.step || '0.01'; }
    const caption = element('label', label); caption.htmlFor = input.id;
    wrap.append(caption, input); parent.append(wrap); return input;
  }
  const customer = element('div', null, 'edit-grid');
  const inputs = {};
  for (const [key, label] of Object.entries({ nome: 'Nome', email: 'E-mail', telefone: 'Telefone', cpf: 'CPF', logradouro: 'Logradouro', numero: 'Número', complemento: 'Complemento', cidade: 'Cidade', estado: 'Estado (UF)', cep: 'CEP' })) {
    inputs[key] = field(customer, label, order.cliente[key], { required: key !== 'complemento' && key !== 'cpf', type: key === 'email' ? 'email' : 'text', max: key === 'logradouro' ? 300 : 200 });
  }
  inputs.cpf.removeAttribute('maxlength');
  inputs.cpf.inputMode = 'numeric';
  inputs.cpf.placeholder = '000.000.000-00';
  inputs.cpf.value = formatarCPF(inputs.cpf.value);
  inputs.cpf.addEventListener('input', e => aplicarMascaraCPF(e.target));
  inputs.cpf.addEventListener('change', e => aplicarMascaraCPF(e.target));
  form.append(element('h3', 'Cliente e endereço'), customer);
  const list = element('div', null, 'edit-items'); const rows = [];
  const summary = element('p', '', 'edit-summary');
  function updateTotals() {
    const cents = rows.reduce((sum, row) => sum + Math.round(Number(row.price.value) * 100) * Number(row.qty.value), 0);
    const shippingCents = Math.round(Number(shippingPrice.value) * 100);
    summary.textContent = `Subtotal: ${money(cents / 100)} · Frete: ${money(shippingCents / 100)} · Total: ${money((cents + shippingCents) / 100)}`;
  }
  function addItem(item = {}) {
    const row = element('div', null, 'edit-item');
    const name = field(row, 'Produto / descrição', item.nome, { max: 300 });
    const qty = field(row, 'Quantidade', item.quantidade ?? 1, { type: 'number', min: 1, limit: 999, step: '1' });
    const price = field(row, 'Preço unitário (R$)', item.preco ?? 0, { type: 'number' });
    const remove = element('button', 'Remover item', 'danger'); remove.type = 'button';
    const record = { row, name, qty, price, id: item.id }; rows.push(record);
    remove.addEventListener('click', () => { rows.splice(rows.indexOf(record), 1); row.remove(); updateTotals(); });
    row.append(remove); list.append(row);
    qty.addEventListener('input', updateTotals); price.addEventListener('input', updateTotals);
  }
  form.append(element('h3', 'Itens do pedido'), list);
  const add = element('button', 'Adicionar item', 'secondary'); add.type = 'button';
  add.addEventListener('click', () => { addItem(); updateTotals(); }); form.append(add);
  const shipping = element('div', null, 'edit-grid');
  const shippingId = field(shipping, 'Identificação do frete', order.frete.id);
  const shippingName = field(shipping, 'Opção de frete', order.frete.nome);
  const shippingTerm = field(shipping, 'Prazo', order.frete.prazo, { required: false });
  const shippingPrice = field(shipping, 'Valor do frete (R$)', order.frete.valor, { type: 'number' });
  shippingPrice.addEventListener('input', updateTotals);
  form.append(element('h3', 'Frete e valores'), shipping, summary);
  form.append(element('h3', 'Observações do cliente'));
  const personalizacaoInputs = {};
  for (const [key, label] of Object.entries(personalizacaoLabels)) {
    personalizacaoInputs[key] = field(form, label, order.personalizacao?.[key] || '', { multiline: true, max: 1000, required: false });
    personalizacaoInputs[key].classList.add('observacoes-input');
  }
  const observation = field(form, 'Observações internas', order.observacoes || '', { multiline: true, max: 5000, required: false });
  observation.classList.add('observacoes-input');
  const feedback = element('p', '', 'edit-error'); feedback.setAttribute('role', 'status');
  const actions = element('div', null, 'edit-actions');
  const save = element('button', 'Salvar alterações'); save.type = 'submit';
  const cancel = element('button', 'Cancelar', 'secondary'); cancel.type = 'button';
  cancel.addEventListener('click', () => { if (!savingEdit && confirm('Descartar as alterações não salvas?')) editor.close(); });
  actions.append(save, cancel); form.append(feedback, actions);
  for (const item of order.itens) addItem(item);
  updateTotals();
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (savingEdit) return;
    if (!rows.length) { feedback.textContent = 'Adicione pelo menos um item.'; return; }
    const body = { revisao: order.revisao || 1,
      personalizacao: Object.fromEntries(Object.entries(personalizacaoInputs).map(([key, input]) => [key, input.value.trim()])),
      cliente: Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value.trim()])),
      itens: rows.map(row => ({ id: row.id, nome: row.name.value, quantidade: Number(row.qty.value), preco: Number(row.price.value) })),
      frete: { id: shippingId.value, nome: shippingName.value, prazo: shippingTerm.value, valor: Number(shippingPrice.value) }, observacoes: observation.value };
    savingEdit = true; save.disabled = true; cancel.disabled = true; feedback.textContent = 'Salvando…';
    try { await api(`/api/admin/pedidos/${order.numero}/alterar`, body); editor.close(); await load(); status('Alterações do pedido #' + String(order.numero).padStart(5, '0') + ' salvas.'); }
    catch (error) { feedback.textContent = error.message; }
    finally { savingEdit = false; save.disabled = false; cancel.disabled = false; }
  });
  editor.append(form); editor.showModal();
  if (focusNotes) observation.focus();
}

let savingAccount = false;
$('#minhaConta').addEventListener('click', async () => {
  try {
    const account = await api('/api/admin/conta');
    $('#contaForm').reset(); $('#contaMensagem').textContent = '';
    $('#contaUsuario').value = account.adminUsuario;
    $('#contaTitulo').textContent = account.role === 'master' ? 'Gerenciar acesso do administrador' : 'Minha conta';
    $('#contaDescricao').textContent = account.role === 'master'
      ? 'Você entrou como mestre. Redefina o acesso do administrador sem precisar da senha dele. Seu acesso mestre permanece o mesmo.'
      : 'Altere seu usuário e sua senha. Após salvar, entre novamente. As outras sessões do administrador serão encerradas.';
    $('#contaAtualLabel').textContent = account.role === 'master' ? 'Sua senha mestre atual' : 'Sua senha atual';
    $('#contaDialog').showModal(); $('#contaUsuario').focus();
  } catch (error) { status(error.message, true); }
});
$('#contaCancelar').addEventListener('click', () => { if (!savingAccount) { $('#contaDialog').close(); $('#contaForm').reset(); } });
$('#contaDialog').addEventListener('cancel', event => { if (savingAccount) event.preventDefault(); else $('#contaForm').reset(); });
$('#contaForm').addEventListener('submit', async event => {
  event.preventDefault(); if (savingAccount) return;
  if ($('#contaNova').value !== $('#contaConfirmacao').value) { $('#contaMensagem').textContent = 'A confirmação da nova senha não confere.'; return; }
  savingAccount = true; $('#contaSalvar').disabled = true; $('#contaCancelar').disabled = true;
  $('#contaMensagem').textContent = 'Salvando…';
  try {
    const result = await api('/api/admin/conta', { usuario: $('#contaUsuario').value.trim(), senhaAtual: $('#contaAtual').value,
      novaSenha: $('#contaNova').value, confirmacao: $('#contaConfirmacao').value });
    $('#contaDialog').close(); $('#contaForm').reset();
    if (result.entrarNovamente) loggedOut();
    status(result.entrarNovamente ? 'Acesso atualizado. Entre com seu novo usuário e senha.' : 'Acesso do administrador redefinido. Seu acesso mestre continua ativo.');
  } catch (error) { $('#contaMensagem').textContent = error.message; status(error.message, true); }
  finally { savingAccount = false; $('#contaSalvar').disabled = false; $('#contaCancelar').disabled = false; }
});
