const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { formatarCPF, aplicarMascaraCPF } = require('../public/cpf');

test('máscara: digitação progressiva, colagem, remoção, limite e edição no meio', () => {
  const expected = ['', '1', '12', '123', '123.4', '123.45', '123.456', '123.456.7', '123.456.78', '123.456.789', '123.456.789-0', '123.456.789-01'];
  expected.forEach((value, length) => assert.equal(formatarCPF('12345678901'.slice(0, length)), value));
  for (const value of ['12345678901', '123.456.789-01', 'abc123.456.789-01999']) assert.equal(formatarCPF(value), expected[11]);
  assert.equal(formatarCPF('00000000000'), '000.000.000-00');
  const field = { value: '123.456.789-01', selectionStart: 4, setSelectionRange(a, b) { this.cursor = [a, b]; } };
  field.value = '123456.789-01'; field.selectionStart = 3;
  aplicarMascaraCPF(field);
  assert.equal(field.value, expected[11]); assert.deepEqual(field.cursor, [3, 3]);
  field.value = ''; field.selectionStart = 0; aplicarMascaraCPF(field);
  assert.equal(field.value, ''); assert.deepEqual(field.cursor, [0, 0]);
});

test('dados locais preservam CPF, carrinho e dados antigos sem CPF', () => {
  const source = fs.readFileSync(require.resolve('../public/script.js'), 'utf8');
  const fields = Object.fromEntries(['corSuporte', 'corTampa', 'corTrava', 'nome', 'email', 'telefone', 'cpf', 'logradouro', 'cidade', 'estado', 'numero', 'complemento', 'cep'].map(id => [id, { value: '' }]));
  let saved;
  const context = vm.createContext({ formatarCPF, console,
    document: { querySelector: s => fields[s.slice(1)], getElementById: id => fields[id] },
    localStorage: { setItem: (key, value) => { saved = value; }, getItem: () => saved, removeItem: () => { saved = undefined; } }
  });
  vm.runInContext(source.slice(0, source.indexOf('function dinheiro')), context);
  fields.cpf.value = '12345678901'; fields.nome.value = 'Cliente teste';
  fields.corSuporte.value = 'Preto'; fields.corTampa.value = 'Azul\nNome Marco'; fields.corTrava.value = 'Amarelo';
  vm.runInContext('carrinho = [{ id: 1, quantidade: 2 }]; salvarEstado()', context);
  assert.equal(JSON.parse(saved).cliente.cpf, '123.456.789-01');
  assert.deepEqual(JSON.parse(saved).personalizacao, { corSuporte: 'Preto', corTampa: 'Azul\nNome Marco', corTrava: 'Amarelo' });
  fields.corTampa.value = '';
  fields.cpf.value = ''; vm.runInContext('carregarEstado()', context);
  assert.equal(fields.cpf.value, '123.456.789-01');
  assert.equal(fields.corTampa.value, 'Azul\nNome Marco');
  assert.equal(JSON.parse(saved).carrinho[0].quantidade, 2);
  saved = JSON.stringify({ cliente: { nome: 'Antigo' }, carrinho: [] }); fields.cpf.value = '';
  vm.runInContext('carregarEstado()', context);
  assert.equal(fields.nome.value, 'Antigo'); assert.equal(fields.cpf.value, '');
});
