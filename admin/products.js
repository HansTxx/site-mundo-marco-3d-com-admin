'use strict';
const productsDialog = element('dialog', null, 'editor');
productsDialog.id = 'productsDialog';
productsDialog.setAttribute('aria-label', 'Gerenciar produtos');
document.body.append(productsDialog);
let productBusy = false;
productsDialog.addEventListener('cancel', event => { if (productBusy) event.preventDefault(); });
$('#gerenciarProdutos').addEventListener('click', async () => {
  await showProducts();
});
async function showProducts() {
  try {
    const products = await api('/api/admin/produtos');
    productsDialog.replaceChildren(element('h2', 'Produtos do catálogo'), element('p', 'Cadastre e edite produtos. As alterações salvas aparecem na loja. Medidas em centímetros e peso em quilogramas.'));
    const actions = element('div', null, 'edit-actions');
    const create = element('button', 'Novo produto'); create.onclick = () => editProduct();
    const close = element('button', 'Fechar', 'secondary'); close.onclick = () => productsDialog.close();
    actions.append(create, close); productsDialog.append(actions);
    for (const p of products) {
      const row = element('article', null, 'product-admin-row');
      const image = element('img'); image.src = '/' + p.imagem.replace(/^\//, ''); image.alt = p.nome;
      const info = element('div'); info.append(element('h3', p.nome), element('p', `${money(p.preco)} · ${p.largura} × ${p.comprimento} × ${p.altura} cm · ${p.peso} kg`));
      const edit = element('button', 'Editar'); edit.onclick = () => editProduct(p);
      const remove = element('button', 'Excluir', 'danger');
      remove.onclick = async () => {
        if (productBusy || !confirm(`Remover “${p.nome}” do catálogo? Os pedidos existentes serão preservados.`)) return;
        productBusy = true; remove.disabled = true;
        try { await api(`/api/admin/produtos/${p.id}/excluir`, { revisao: p.revisao }); await showProducts(); }
        catch (error) { status(error.message, true); }
        finally { productBusy = false; remove.disabled = false; }
      };
      row.append(image, info, edit, remove); productsDialog.append(row);
    }
    if (!products.length) productsDialog.append(element('p', 'Nenhum produto cadastrado. Clique em Novo produto.'));
    if (!productsDialog.open) productsDialog.showModal();
  } catch (error) { status(error.message, true); }
}
function editProduct(product = {}) {
  productsDialog.replaceChildren();
  const form = element('form');
  form.append(element('h2', product.id ? 'Editar produto' : 'Novo produto'));
  const fields = {};
  const grid = element('div', null, 'edit-grid');
  for (const [key, caption] of Object.entries({ nome: 'Nome do produto', descricao: 'Descrição', preco: 'Preço (R$)', largura: 'Largura (cm)', comprimento: 'Comprimento (cm)', altura: 'Altura (cm)', peso: 'Peso (kg)' })) {
    const wrap = element('div', null, 'edit-field');
    const label = element('label', caption); label.htmlFor = 'produto-' + key;
    const input = element(key === 'descricao' ? 'textarea' : 'input');
    input.id = label.htmlFor; input.required = true; input.value = product[key] ?? '';
    if (!['nome', 'descricao'].includes(key)) {
      input.type = 'number'; input.step = key === 'peso' ? '0.001' : '0.01'; input.min = input.step;
      input.max = key === 'preco' ? '100000' : '1000';
    } else input.maxLength = key === 'nome' ? 300 : 5000;
    fields[key] = input; wrap.append(label, input); grid.append(wrap);
  }
  const variantsWrap = element('section', null, 'product-variants');
  variantsWrap.append(element('h3', 'Modelos / opções do produto'), element('p', 'Adicione até 50 modelos. Cada modelo pode ter largura, comprimento e altura em centímetros e peso em quilogramas próprios. Campos de medidas vazios usam os valores gerais acima. O preço é o mesmo para todos os modelos.'));
  const variantsList = element('div'); const variantRows = []; let nextVariant = 0;
  function addVariant(variant = {}) {
    if (productBusy || variantRows.length >= 50) return;
    if (typeof variant === 'string') variant = { nome: variant };
    const row = element('fieldset', null, 'variant-row');
    row.append(element('legend', 'Modelo'));
    const inputs = {}; const serial = nextVariant++;
    for (const [key, caption] of Object.entries({ nome: 'Nome do modelo', largura: 'Largura (cm)', comprimento: 'Comprimento (cm)', altura: 'Altura (cm)', peso: 'Peso (kg)' })) {
      const wrap = element('div', null, 'edit-field'); const label = element('label', caption);
      const input = element('input'); input.id = `variante-${serial}-${key}`; label.htmlFor = input.id;
      input.value = variant[key] ?? ''; input.required = key === 'nome';
      if (key === 'nome') { input.maxLength = 100; input.placeholder = 'Ex.: modelo pequeno'; }
      else { input.type = 'number'; input.step = key === 'peso' ? '0.001' : '0.01'; input.min = input.step; input.max = '1000'; input.placeholder = 'Usar medida geral'; }
      inputs[key] = input; wrap.append(label, input); row.append(wrap);
    }
    const record = { row, inputs }; variantRows.push(record);
    const remove = element('button', 'Remover modelo', 'secondary'); remove.type = 'button';
    remove.onclick = () => { if (productBusy) return; variantRows.splice(variantRows.indexOf(record), 1); row.remove(); };
    row.append(remove); variantsList.append(row);
  }
  const addVariantButton = element('button', 'Adicionar modelo', 'secondary'); addVariantButton.type = 'button';
  addVariantButton.onclick = () => { addVariant(); variantRows.at(-1)?.inputs.nome.focus(); };
  (product.variantes || []).forEach(addVariant);
  variantsWrap.append(variantsList, addVariantButton); grid.append(variantsWrap);
  form.append(grid, element('h3', 'Imagens'), element('p', 'A primeira imagem será a capa. Envie até 20 fotos (PNG, JPG, WEBP ou GIF), com no máximo 4 MB cada. Use as setas para ordenar.'));
  let images = [...(product.imagens || [])];
  const gallery = element('div', null, 'product-image-list');
  const feedback = element('p', '', 'edit-error'); feedback.setAttribute('role', 'status');
  function renderImages() {
    gallery.replaceChildren();
    images.forEach((src, i) => {
      const row = element('div', null, 'product-image-row');
      const img = element('img'); img.src = '/' + src.replace(/^\//, ''); img.alt = `Foto ${i + 1}`;
      row.append(img, element('span', i === 0 ? '1 · Capa' : String(i + 1)));
      for (const [label, delta] of [['Mover para cima', -1], ['Mover para baixo', 1], ['Remover imagem', 0]]) {
        const button = element('button', label, 'secondary'); button.type = 'button';
        button.disabled = productBusy || (delta === -1 && i === 0) || (delta === 1 && i === images.length - 1);
        button.onclick = () => { if (productBusy) return; if (!delta) images.splice(i, 1); else [images[i], images[i + delta]] = [images[i + delta], images[i]]; renderImages(); };
        row.append(button);
      }
      gallery.append(row);
    });
  }
  const uploadLabel = element('label', 'Adicionar fotos'); uploadLabel.htmlFor = 'produto-fotos';
  const upload = element('input'); upload.type = 'file'; upload.multiple = true; upload.id = uploadLabel.htmlFor; upload.accept = 'image/png,image/jpeg,image/webp,image/gif';
  const actions = element('div', null, 'edit-actions');
  const save = element('button', 'Salvar produto'); save.type = 'submit';
  const cancel = element('button', 'Voltar ao catálogo', 'secondary'); cancel.type = 'button';
  cancel.onclick = () => { if (!productBusy && confirm('Descartar as alterações não salvas?')) showProducts(); };
  function busy(value) { productBusy = value; form.querySelectorAll('input, textarea, select, button').forEach(input => { input.disabled = value; }); save.disabled = value; cancel.disabled = value; upload.disabled = value; renderImages(); }
  upload.onchange = async () => {
    const files = Array.from(upload.files);
    if (files.length + images.length > 20 || files.some(f => f.size > 4 * 1024 * 1024)) { feedback.textContent = 'Limite: 20 imagens, até 4 MB cada.'; upload.value = ''; return; }
    busy(true); feedback.textContent = 'Enviando imagens…';
    try {
      for (const file of files) {
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler a imagem.')); reader.readAsDataURL(file); });
        const result = await api('/api/admin/imagens', { imagem: data }); images.push(result.imagem);
      }
      feedback.textContent = 'Fotos enviadas. Clique em Salvar produto para publicar.';
    } catch (error) { feedback.textContent = error.message; }
    finally { upload.value = ''; busy(false); }
  };
  form.onsubmit = async event => {
    event.preventDefault(); if (productBusy) return;
    if (!images.length) { feedback.textContent = 'Adicione pelo menos uma imagem.'; return; }
    const body = Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, ['nome', 'descricao'].includes(key) ? input.value : Number(input.value)]));
    body.variantes = variantRows.map(({ inputs }) => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, key === 'nome' ? input.value.trim() : (input.value === '' ? Number(fields[key].value) : Number(input.value))])));
    body.imagens = images; body.revisao = product.revisao;
    busy(true); feedback.textContent = 'Salvando…';
    try { await api('/api/admin/produtos' + (product.id ? '/' + product.id : ''), body); await showProducts(); status('Produto salvo e disponível na loja.'); }
    catch (error) { feedback.textContent = error.message; }
    finally { busy(false); }
  };
  actions.append(save, cancel); form.append(gallery, uploadLabel, upload, feedback, actions); productsDialog.append(form); renderImages(); fields.nome.focus();
}
