const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { formatarCPF } = require('../public/cpf');

function fixture() {
  const fields = {};
  const get = id => fields[id] ||= { value: '', textContent: '', hidden: false, disabled: false,
    classList: { add() {}, remove() {} }, removeAttribute(name) { delete this[name]; } };
  const local = new Map(); const session = new Map();
  const storage = map => ({ getItem: key => map.get(key), setItem: (key, val) => map.set(key, val), removeItem: key => map.delete(key) });
  let resolve;
  let submitted;
  const context = vm.createContext({ document: { getElementById: get, querySelector: selector => get(selector.slice(1)) },
    localStorage: storage(local), sessionStorage: storage(session), crypto: webcrypto, formatarCPF,
    window: { lojaConfig: { whatsappConfigured: true, whatsappNumber: '5547999999999' }, open: () => null },
    fetch: (url, options) => { submitted = JSON.parse(options.body); return new Promise(r => { resolve = r; }); },
    setTimeout() {}, console });
  const source = fs.readFileSync(require.resolve('../public/script.js'), 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('$("#abrirCarrinho").addEventListener')), context);
  vm.runInContext('renderCarrinho = () => {}; carrinho = [{id:1, quantidade:2}]; freteSelecionado = {id:"demo", nome:"Entrega", valor:18.9}; opcoesFrete = [freteSelecionado];', context);
  const customer = { nome: 'Teste', email: 'teste@example.com', telefone: '47999999999', cpf: '123.456.789-01', logradouro: 'Rua de teste', cidade: 'Navegantes', estado: 'SC', numero: '10', complemento: 'Casa', cep: '88370603' };
  Object.entries(customer).forEach(([key, value]) => { get(key).value = value; });
  for (const key of ['corSuporte', 'corTampa', 'corTrava']) get(key).value = 'Azul';
  vm.runInContext('salvarEstado()', context);
  return { context, fields, local, session, customer, source, submitted: () => submitted,
    respond: ok => resolve({ ok, json: async () => ok ? { numero: 1, mensagem: 'Pedido azul' } : { erro: 'Falha ao salvar' } }) };
}

test('sucesso limpa itens, frete e cores; preserva cliente e link do WhatsApp', async () => {
  const f = fixture();
  const done = vm.runInContext('finalizarPedido()', f.context);
  assert.equal(vm.runInContext('carrinho.length', f.context), 1); // Still waiting for confirmation.
  assert.equal(f.submitted().personalizacao.corTampa, 'Azul');
  f.respond(true); await done;
  const saved = JSON.parse(f.local.get('minha-loja-dados'));
  assert.deepEqual(saved.cliente, f.customer);
  assert.deepEqual(saved.carrinho, []); assert.deepEqual(saved.opcoesFrete, []); assert.equal(saved.freteSelecionado, null);
  assert.deepEqual(saved.personalizacao, { corSuporte: '', corTampa: '', corTrava: '' });
  assert.equal(f.session.has('marco-tentativa'), false);
  assert.match(f.fields.abrirWhatsappPedido.href, /wa.me/);
  assert.equal(f.fields.pedidoSalvo.hidden, false);
  assert.equal(f.fields.corTampa.value, '');
  const fresh = fixture();
  fresh.local.set('minha-loja-dados', JSON.stringify(saved));
  vm.runInContext('carregarEstado()', fresh.context);
  assert.equal(vm.runInContext('carrinho.length', fresh.context), 0);
  assert.equal(fresh.fields.corTampa.value, '');
  assert.equal(fresh.fields.nome.value, f.customer.nome);
});

test('falha preserva pedido, observações e chave para tentar novamente', async () => {
  const f = fixture(); const before = f.local.get('minha-loja-dados');
  const done = vm.runInContext('finalizarPedido()', f.context);
  f.respond(false); await done;
  assert.equal(vm.runInContext('carrinho.length', f.context), 1);
  assert.equal(f.fields.corTampa.value, 'Azul');
  assert.equal(f.local.get('minha-loja-dados'), before);
  assert.ok(f.session.has('marco-tentativa'));
  assert.equal(f.fields.abrirWhatsappPedido.href, undefined);
});

test('carrinho separa modelos, mantém quantidades e envia a escolha no pedido', async () => {
  const f = fixture();
  f.fields['modelo-2'] = {value:'Pequeno',focus(){}};
  f.fields['qtd-2'] = {value:'2'};
  vm.runInContext(`const produtos = [{id:2,nome:'Caixa',preco:10,peso:1,variantes:[{nome:'Pequeno',peso:0.2},{nome:'Grande',peso:0.8}]}]; carrinho=[]; abrirCarrinho=()=>{}; mostrarToast=()=>{};`, f.context);
  vm.runInContext('adicionar(2)', f.context);
  f.fields['modelo-2'].value='Grande'; f.fields['qtd-2'].value='3';
  vm.runInContext('adicionar(2)', f.context);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(carrinho)', f.context)), [{id:2,variante:'Pequeno',quantidade:2},{id:2,variante:'Grande',quantidade:3}]);
  vm.runInContext('alterarQuantidade(0, 1)', f.context);
  assert.equal(vm.runInContext('carrinho[0].quantidade', f.context),3);
  assert.ok(Math.abs(vm.runInContext('pesoTotal()', f.context)-3)<1e-9);
  vm.runInContext('remover(0)', f.context);
  assert.equal(vm.runInContext('carrinho[0].variante', f.context),'Grande');
  f.fields['qtd-2'].value='0'; vm.runInContext('adicionar(2)',f.context);
  assert.equal(vm.runInContext('carrinho[0].quantidade',f.context),3);
  f.fields['qtd-2'].value='2';f.fields['modelo-2'].value=''; vm.runInContext('adicionar(2)',f.context);
  assert.equal(vm.runInContext('carrinho.length',f.context),1);
  vm.runInContext('salvarEstado(); carrinho=[]; carregarEstado(); freteSelecionado={id:"demo",nome:"Teste",valor:18.9};',f.context);
  const done=vm.runInContext('finalizarPedido()',f.context);
  assert.equal(f.submitted().itens[0].variante,'Grande');
  f.respond(true);await done;
});
