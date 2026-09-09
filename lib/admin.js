const crypto = require('node:crypto');
const path = require('node:path');
const OrderStore = require('./order-store');
const { formatarCPF } = require('../public/cpf');

module.exports = function installAdmin(app, catalog) {
  const store = new OrderStore(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const sessions = new Map();
  const attempts = new Map();
  const orderAttempts = new Map();
  const lifetime = 8 * 60 * 60 * 1000;
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict', path: '/api/admin', maxAge: lifetime };
  const digest = value => crypto.createHash('sha256').update(String(value || '')).digest();
  const equal = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
  function token(req) { return /(?:^|;\s*)marco_admin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1]; }
  function authorized(req, res, next) {
    const value = token(req);
    const session = value && sessions.get(value);
    if (!session || session.expires <= Date.now()) {
      if (value) sessions.delete(value);
      return res.status(401).json({ erro: 'Entre novamente para acessar os pedidos.' });
    }
    next();
  }
  function sameOrigin(req, res, next) {
    if (!req.is('application/json') || req.get('X-Loja-Request') !== '1') {
      return res.status(403).json({ erro: 'Requisição não autorizada.' });
    }
    const origin = req.get('Origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) {
      return res.status(403).json({ erro: 'Origem não autorizada.' });
    }
    if (req.get('Sec-Fetch-Site') === 'cross-site') return res.sendStatus(403);
    next();
  }
  function limit(map, maximum, windowMs) {
    return (req, res, next) => {
      const key = req.ip;
      let entry = map.get(key);
      if (!entry || entry.until <= Date.now()) {
        if (map.size >= 10000) return res.status(429).json({ erro: 'Tente novamente mais tarde.' });
        entry = { count: 0, until: Date.now() + windowMs }; map.set(key, entry);
      }
      if (++entry.count > maximum) {
        res.set('Retry-After', String(Math.ceil((entry.until - Date.now()) / 1000)));
        return res.status(429).json({ erro: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
      }
      next();
    };
  }
  const cleanup = setInterval(() => {
    for (const [key, s] of sessions) if (s.expires <= Date.now()) sessions.delete(key);
    for (const map of [attempts, orderAttempts]) for (const [key, v] of map) if (v.until <= Date.now()) map.delete(key);
  }, 60000);
  cleanup.unref();
  const securityHeaders = (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    next();
  };
  app.use('/api/admin', securityHeaders);
  app.get(['/admin', '/admin/'], securityHeaders, (req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'index.html')));
  app.get('/admin/app.js', securityHeaders, (req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'app.js')));
  app.get('/admin/style.css', securityHeaders, (req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'style.css')));
  app.post('/api/admin/login', sameOrigin, limit(attempts, 10, 15 * 60000), (req, res) => {
    if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) return res.status(503).json({ erro: 'Configure ADMIN_USER e ADMIN_PASSWORD no servidor e reinicie.' });
    if (secure && !req.secure) return res.status(400).json({ erro: 'O acesso administrativo em produção exige HTTPS.' });
    const userOK = equal(req.body?.usuario, process.env.ADMIN_USER);
    const passwordOK = equal(req.body?.senha, process.env.ADMIN_PASSWORD);
    if (!userOK || !passwordOK) return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
    if (sessions.size >= 1000) return res.status(503).json({ erro: 'Tente novamente mais tarde.' });
    const previous = token(req); if (previous) sessions.delete(previous);
    const value = crypto.randomBytes(32).toString('hex');
    sessions.set(value, { expires: Date.now() + lifetime });
    res.cookie('marco_admin', value, cookieOptions);
    res.json({ ok: true });
  });
  app.post('/api/admin/logout', sameOrigin, (req, res) => {
    sessions.delete(token(req));
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie('marco_admin', clearOptions).json({ ok: true });
  });
  app.get('/api/admin/pedidos', authorized, async (req, res) => {
    try {
      const orders = await store.list();
      res.json({ pedidos: orders.filter(o => !o.excluidoEm).map(({ chave, fingerprint, ...order }) => ({ status: 'aberto', observacoes: '', revisao: 1, ...order })) });
    } catch (error) {
      console.error('Falha ao ler pedidos:', error.message);
      res.status(500).json({ erro: 'Não foi possível ler os pedidos. Verifique o arquivo e o backup no servidor.' });
    }
  });
  function text(value, name, max = 200, required = true) {
    if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new Error(`Campo inválido: ${name}.`);
    return value.trim();
  }
  function validate(body, admin = false) {
    if (!body || typeof body !== 'object') throw new Error('Pedido inválido.');
    const cliente = {};
    for (const key of ['nome', 'email', 'telefone', 'logradouro', 'cidade', 'estado', 'numero', 'complemento', 'cep']) {
      cliente[key] = text(body.cliente?.[key] ?? '', key, key === 'logradouro' ? 300 : 200, key !== 'complemento');
    }
    cliente.cpf = formatarCPF(text(body.cliente?.cpf ?? '', 'cpf', 200, false));
    cliente.cep = cliente.cep.replace(/\D/g, '');
    if (!/^\d{8}$/.test(cliente.cep)) throw new Error('CEP inválido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) throw new Error('E-mail inválido.');
    if (!/^\d{10,15}$/.test(cliente.telefone.replace(/\D/g, ''))) throw new Error('Telefone inválido.');
    if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(cliente.estado)) throw new Error('Estado inválido.');
    if (!Array.isArray(body.itens) || !body.itens.length || body.itens.length > 100) throw new Error('Itens inválidos.');
    const seen = new Set();
    const itens = body.itens.map(item => {
      if (admin) {
        if (!item || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 999 || typeof item.preco !== 'number' || !Number.isFinite(item.preco) || item.preco < 0 || item.preco > 100000) throw new Error('Quantidade ou preço inválido.');
        const preco = Math.round(item.preco * 100) / 100;
        return { id: typeof item.id === 'number' && Number.isSafeInteger(item.id) ? item.id : null,
          nome: text(item.nome, 'nome do produto', 300), quantidade: item.quantidade, preco,
          subtotal: Math.round(preco * 100) * item.quantidade / 100 };
      }
      const p = catalog.find(p => p.id === item?.id);
      if (!p || seen.has(p.id) || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 999) throw new Error('Produto ou quantidade inválida.');
      seen.add(p.id);
      return { id: p.id, nome: p.nome, quantidade: item.quantidade, preco: p.preco,
        subtotal: Math.round(p.preco * 100) * item.quantidade / 100 };
    });
    const frete = { id: text(String(body.frete?.id ?? ''), 'frete', 100),
      nome: text(body.frete?.nome, 'opção de frete'), prazo: text(body.frete?.prazo ?? '', 'prazo', 200, false), valor: body.frete?.valor };
    if (typeof frete.valor !== 'number' || !Number.isFinite(frete.valor) || frete.valor < 0 || frete.valor > 100000) throw new Error('Valor de frete inválido.');
    frete.valor = Math.round(frete.valor * 100) / 100;
    const subtotal = itens.reduce((sum, i) => sum + Math.round(i.subtotal * 100), 0) / 100;
    return { cliente, itens, subtotal, frete, total: Math.round((subtotal + frete.valor) * 100) / 100 };
  }
  app.post('/api/admin/pedidos/:numero/:acao', authorized, sameOrigin, async (req, res) => {
    const numero = Number(req.params.numero);
    const { acao } = req.params;
    if (!Number.isSafeInteger(numero) || numero < 1 || !['alterar', 'finalizar', 'excluir', 'reabrir', 'producao'].includes(acao)) return res.status(400).json({ erro: 'Operação inválida.' });
    let changes;
    try {
      if (!Number.isSafeInteger(req.body?.revisao) || req.body.revisao < 1) throw new Error('Atualize a lista antes de alterar o pedido.');
      if (acao === 'alterar') changes = { ...validate(req.body, true), observacoes: text(req.body.observacoes ?? '', 'observações', 5000, false) };
    } catch (error) { return res.status(400).json({ erro: error.message }); }
    try {
      await store.change(numero, req.body.revisao, current => {
        if (acao === 'excluir') return { numero: current.numero, chave: current.chave, fingerprint: current.fingerprint, excluidoEm: new Date().toISOString() };
        if (acao === 'finalizar') return { ...current, status: 'finalizado', finalizadoEm: new Date().toISOString() };
        if (acao === 'producao') {
          if (!['aberto', 'reaberto'].includes(current.status || 'aberto')) {
            const error = new Error('Somente pedidos em andamento ou reabertos podem entrar em produção.'); error.status = 409; throw error;
          }
          return { ...current, status: 'producao', producaoEm: new Date().toISOString(), finalizadoEm: null };
        }
        if (acao === 'reabrir') return { ...current, status: 'reaberto', finalizadoEm: null, reabertoEm: new Date().toISOString() };
        return { ...current, ...changes };
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('Falha na alteração administrativa:', error.message);
      res.status(error.status || 500).json({ erro: error.status ? error.message : 'Não foi possível salvar. Nenhuma confirmação foi emitida; atualize a lista antes de tentar novamente.' });
    }
  });
  app.post('/api/pedidos', sameOrigin, limit(orderAttempts, 30, 60000), async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let order, key;
    try {
      key = text(req.get('Idempotency-Key'), 'identificação da tentativa', 80);
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(key)) throw new Error('Identificação da tentativa inválida.');
      order = validate(req.body);
    } catch (error) { return res.status(400).json({ erro: error.message }); }
    try {
      const saved = await store.add(order, key, digest(JSON.stringify(order)).toString('hex'));
      const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const c = saved.cliente;
      const mensagem = `*NOVO PEDIDO #${String(saved.numero).padStart(5, '0')}*\nData: ${new Date(saved.dataHora).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n*CLIENTE*\nNome: ${c.nome}\nE-mail: ${c.email}\nTelefone: ${c.telefone}\nCPF: ${c.cpf || 'Não informado'}\n\n*ENDEREÇO DE ENTREGA*\nLogradouro: ${c.logradouro}\nNúmero: ${c.numero}\nComplemento: ${c.complemento || 'Não informado'}\nCidade: ${c.cidade}\nEstado: ${c.estado}\nCEP: ${c.cep}\n\n*PRODUTOS*\n${saved.itens.map(i => `• ${i.nome} x${i.quantidade} — ${money(i.subtotal)}`).join('\n')}\n\n*FRETE:* ${saved.frete.nome}\n*PRAZO:* ${saved.frete.prazo}\n*VALOR DO FRETE:* ${money(saved.frete.valor)}\n\n*SUBTOTAL:* ${money(saved.subtotal)}\n*TOTAL:* ${money(saved.total)}\n\nPedido enviado pelo site.`;
      res.status(201).json({ numero: saved.numero, dataHora: saved.dataHora, mensagem });
    } catch (error) {
      console.error('Falha ao salvar pedido:', error.message);
      res.status(error.status || 500).json({ erro: error.status ? error.message : 'Não foi possível salvar o pedido. Tente novamente; o WhatsApp só abrirá após a confirmação.' });
    }
  });
};
