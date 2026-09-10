const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const OrderStore = require('../lib/order-store');

test('gravações concorrentes, idempotência, reinício e arquivo corrompido', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marco-store-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const store = new OrderStore(dir);
  const saved = await Promise.all(Array.from({ length: 25 }, (_, i) => store.add({ cliente: { nome: 'Cliente ' + i } }, 'key-' + i, 'fp-' + i)));
  assert.deepEqual(saved.map(o => o.numero), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.equal((await new OrderStore(dir).list()).length, 25);
  assert.equal((await store.add({}, 'key-1', 'fp-1')).numero, 2);
  await assert.rejects(store.add({}, 'key-1', 'different'), { status: 409 });
  assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'pedidos.json.bak'), 'utf8')).length, 24);
  await fs.writeFile(path.join(dir, 'pedidos.json'), '{corrupt');
  await assert.rejects(store.add({}, 'another', 'other'));
  assert.equal(await fs.readFile(path.join(dir, 'pedidos.json'), 'utf8'), '{corrupt');
});

test('fluxo HTTP: login, cookies, pedidos protegidos, validação, duplicação e logout', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'marco-http-'));
  process.env.DATA_DIR = dir;
  process.env.ADMIN_USER = 'admin-teste';
  process.env.ADMIN_PASSWORD = 'senha-apenas-para-teste';
  process.env.NODE_ENV = 'development';
  process.env.DEMO_MODE = 'true';
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = (url, body, headers = {}) => fetch(base + url, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
    headers: { 'Content-Type': 'application/json', 'X-Loja-Request': '1', ...headers } });
  assert.equal((await request('/api/admin/pedidos')).status, 401);
  const page = await request('/admin');
  assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal((await request('/data/pedidos.json')).status, 404);
  assert.equal((await request('/.env')).status, 404);
  const wrong = await request('/api/admin/login', { usuario: 'admin-teste', senha: 'errada' });
  assert.equal(wrong.status, 401);
  assert.equal((await request('/api/admin/login', { usuario: 'admin-teste', senha: process.env.ADMIN_PASSWORD }, { Origin: 'https://malicioso.example' })).status, 403);
  const login = await request('/api/admin/login', { usuario: 'admin-teste', senha: process.env.ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\/api\/admin/);
  const auth = { Cookie: cookie.split(';')[0] };
  const payload = { cliente: { nome: '<img src=x onerror=alert(1)>', email: 'teste@example.com', telefone: '(47) 99999-9999', cpf: '12345678901',
    logradouro: 'Rua de teste', numero: '920', complemento: 'Casa 1', cidade: 'Navegantes', estado: 'SC', cep: '88370-603' },
    itens: [{ id: 1, quantidade: 2 }], frete: { id: 'demo', nome: 'Entrega teste', prazo: '5 dias úteis', valor: 18.9 }, subtotal: 0, total: 0 };
  const headers = { 'Idempotency-Key': 'test-unique-order-0001' };
  payload.personalizacao = { corSuporte: 'Preto', corTampa: 'Azul com nome Marco\n<script>texto</script>', corTrava: 'Amarelo' };
  assert.equal((await request('/api/pedidos', { ...payload, personalizacao: { corSuporte: 'a'.repeat(1001) } }, headers)).status, 400);
  assert.equal((await request('/api/pedidos', { ...payload, personalizacao: { corTampa: {} } }, headers)).status, 400);
  assert.equal((await request('/api/pedidos', { ...payload, itens: [{ id: 1, quantidade: -2 }] }, headers)).status, 400);
  assert.equal((await request('/api/pedidos', { ...payload, frete: { ...payload.frete, valor: -10 } }, headers)).status, 400);
  const results = await Promise.all(Array.from({ length: 5 }, () => request('/api/pedidos', payload, headers)));
  for (const result of results) {
    assert.equal(result.status, 201); const data = await result.json(); assert.equal(data.numero, 1); assert.match(data.mensagem, /CPF: 123\.456\.789-01/); assert.match(data.mensagem, /TOTAL:\* R\$\s218,70/);
  }
  const orders = await (await request('/api/admin/pedidos', null, auth)).json();
  assert.deepEqual(orders.pedidos[0].personalizacao, payload.personalizacao);
  assert.deepEqual((await new OrderStore(dir).list())[0].personalizacao, payload.personalizacao);
  const repeated = await (await request('/api/pedidos', payload, headers)).json();
  assert.ok(repeated.mensagem.includes('Cor - Suporte da munição: Preto'));
  assert.ok(repeated.mensagem.includes('Cor/Personalização - Tampa da caixa: Azul com nome Marco'));
  assert.ok(repeated.mensagem.includes('Cor - Trava: Amarelo'));
  assert.equal(orders.pedidos[0].cliente.cpf, '123.456.789-01'); assert.equal((await new OrderStore(dir).list())[0].cliente.cpf, '123.456.789-01'); assert.equal(orders.pedidos.length, 1); assert.equal(orders.pedidos[0].subtotal, 199.8);
  assert.equal(orders.pedidos[0].total, 218.7); assert.equal(orders.pedidos[0].cliente.cep, '88370603');
  assert.equal(orders.pedidos[0].chave, undefined);
  assert.equal((await request('/api/pedidos', { ...payload, itens: [{ id: 1, quantidade: 1 }] }, headers)).status, 409);
  // Management works on legacy records too (revision defaults to 1).
  const management = '/api/admin/pedidos/1/';
  assert.equal((await request(management + 'excluir', { revisao: 1 })).status, 401);
  assert.equal((await request(management + 'finalizar', { revisao: 1 }, { ...auth, Origin: 'https://malicioso.example' })).status, 403);
  const edit = { ...payload, revisao: 1, observacoes: 'Entregar após as 18h\nEmbalagem para presente <script>alert(1)</script>',
    itens: [{ nome: 'Peça personalizada', quantidade: 3, preco: 12.34 }],
    frete: { id: 'retirada', nome: 'Retirada na loja', prazo: '', valor: 0 } };
  assert.equal((await request(management + 'alterar', { ...edit, itens: [{ nome: 'Peça', quantidade: 1, preco: -1 }] }, auth)).status, 400);
  assert.equal((await request(management + 'alterar', edit, auth)).status, 200);
  assert.equal((await request(management + 'alterar', edit, auth)).status, 409);
  let managed = (await (await request('/api/admin/pedidos', null, auth)).json()).pedidos[0];
  assert.deepEqual(managed.personalizacao, payload.personalizacao);
  const privateCheck = await (await request('/api/pedidos', payload, headers)).json();
  assert.ok(!privateCheck.mensagem.includes('Embalagem para presente'));
  assert.equal(managed.cliente.cpf, '123.456.789-01'); assert.equal(managed.total, 37.02); assert.equal(managed.observacoes, edit.observacoes);
  assert.equal(managed.numero, 1); assert.equal(managed.dataHora, orders.pedidos[0].dataHora);
  assert.equal((await request(management + 'finalizar', { revisao: 2 }, auth)).status, 200);
  managed = (await (await request('/api/admin/pedidos', null, auth)).json()).pedidos[0];
  assert.equal(managed.status, 'finalizado'); assert.ok(managed.finalizadoEm);
  assert.equal((await request(management + 'alterar', { ...edit, revisao: 3, observacoes: 'Observação após finalizar' }, auth)).status, 200);
  managed = (await (await request('/api/admin/pedidos', null, auth)).json()).pedidos[0];
  assert.equal(managed.status, 'finalizado'); assert.equal(managed.observacoes, 'Observação após finalizar');
  assert.equal((await request(management + 'reabrir', { revisao: 4 }, auth)).status, 200);
  managed = (await (await request('/api/admin/pedidos', null, auth)).json()).pedidos[0];
  assert.equal(managed.status, 'reaberto'); assert.ok(managed.reabertoEm); assert.equal(managed.finalizadoEm, null);
  assert.equal((await new OrderStore(dir).list())[0].status, 'reaberto');
  assert.equal((await request(management + 'producao', { revisao: 5 })).status, 401);
  assert.equal((await request(management + 'producao', { revisao: 5 }, auth)).status, 200);
  managed = (await (await request('/api/admin/pedidos', null, auth)).json()).pedidos[0];
  assert.equal(managed.status, 'producao'); assert.ok(managed.producaoEm);
  assert.equal((await new OrderStore(dir).list())[0].status, 'producao');
  assert.equal((await request(management + 'alterar', { ...edit, revisao: 6 }, auth)).status, 200);
  managed = (await (await request('/api/admin/pedidos', null, auth)).json()).pedidos[0];
  assert.equal(managed.status, 'producao');
  assert.equal((await request(management + 'finalizar', { revisao: 7 }, auth)).status, 200);
  assert.equal((await request(management + 'producao', { revisao: 8 }, auth)).status, 409);
  assert.equal((await request(management + 'excluir', { revisao: 8 }, auth)).status, 200);
  assert.equal((await (await request('/api/admin/pedidos', null, auth)).json()).pedidos.length, 0);
  assert.equal((await request('/api/pedidos', payload, headers)).status, 409);
  const next = await (await request('/api/pedidos', payload, { 'Idempotency-Key': 'test-unique-order-0002' })).json();
  assert.equal(next.numero, 2);
  const disk = await new OrderStore(dir).list();
  assert.ok(disk[0].excluidoEm); assert.equal(disk[0].cliente, undefined);
  assert.equal(disk[1].numero, 2);
  assert.equal((await request('/api/admin/logout', {}, auth)).status, 200);
  assert.equal((await request('/api/admin/pedidos', null, auth)).status, 401);
  const frete = await request('/api/frete', { cep: '88370603', peso: 0.5 });
  assert.equal(frete.status, 200); assert.equal((await frete.json()).opcoes.length, 2);
  const config = await (await request('/config.js')).text();
  assert.ok(!config.includes(process.env.ADMIN_PASSWORD));
  assert.ok((await (await request('/produtos.js')).text()).startsWith('const produtos ='));
  for (let i = 0; i < 9; i++) await request('/api/admin/login', { usuario: 'no', senha: 'no' });
  assert.equal((await request('/api/admin/login', { usuario: 'no', senha: 'no' })).status, 429);
});

test('produção exige HTTPS e emite cookie Secure atrás do proxy configurado', async t => {
  const express = require('express');
  process.env.NODE_ENV = 'production';
  process.env.ADMIN_USER = 'teste-prod'; process.env.ADMIN_PASSWORD = 'senha-prod-apenas-teste';
  const app = express(); app.set('trust proxy', 1); app.use(express.json());
  require('../lib/admin')(app, require('../public/produtos.json'));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/admin/login';
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Loja-Request': '1' },
    body: JSON.stringify({ usuario: process.env.ADMIN_USER, senha: process.env.ADMIN_PASSWORD }) };
  assert.equal((await fetch(url, options)).status, 400);
  const response = await fetch(url, { ...options, headers: { ...options.headers, 'X-Forwarded-Proto': 'https' } });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie'), /; Secure/);
});
