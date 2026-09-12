require("dotenv").config();
const express = require("express");
const path = require("path");

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const SUPERFRETE_API_URL = process.env.SUPERFRETE_API_URL || "https://api.superfrete.com/api/v0/calculator";

const productStore = new (require('./lib/product-store'))(process.env.DATA_DIR || path.join(__dirname, 'data'), require('./public/produtos.json'));
app.use('/api/admin/imagens', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '64kb' }));
require('./lib/admin')(app, productStore);
app.get(['/api/produtos', '/produtos.json'], async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(await productStore.list()); } catch (error) { next(error); }
});
app.use('/media', express.static(path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'imagens'), { dotfiles: 'deny', setHeaders(res) { res.set('X-Content-Type-Options', 'nosniff'); } }));
app.get('/produtos.js', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store');
  res.type('application/javascript').send(`const produtos = ${JSON.stringify(await productStore.list()).replace(/</g, '\\u003c')};`);
  }
  catch (error) { next(error); }
});
app.use(express.static(path.join(__dirname, "public")));

// Expõe somente o contato público da loja, nunca as credenciais da SuperFrete.
app.get("/config.js", (req, res) => {
  const whatsappNumber = String(process.env.WHATSAPP_NUMBER || "").replace(/\D/g, "");
  const config = {
    whatsappNumber,
    whatsappConfigured: /^[1-9]\d{7,14}$/.test(whatsappNumber)
  };
  res.set("Cache-Control", "no-store");
  res.type("application/javascript").send(`window.lojaConfig = ${JSON.stringify(config)};`);
});

function cleanCep(cep) {
  return String(cep || "").replace(/\D/g, "");
}

function validarCep(cep) {
  return /^\d{8}$/.test(cleanCep(cep));
}

// Cotacao demonstrativa para o projeto funcionar antes de configurar a API.
// Depois, coloque DEMO_MODE=false e seu token no .env.
function freteDemo(cepDestino, peso) {
  const prefixo = Number(cepDestino.slice(0, 2));
  let valor;

  if (prefixo >= 80 && prefixo <= 99) valor = 18.90;
  else if (prefixo >= 70 && prefixo <= 79) valor = 24.90;
  else if (prefixo >= 10 && prefixo <= 19) valor = 29.90;
  else if (prefixo >= 20 && prefixo <= 69) valor = 34.90;
  else valor = 39.90;

  valor += Math.max(0, Number(peso || 0.5) - 0.5) * 4;

  return [
    {
      id: "demo-economico",
      nome: "Entrega econômica (demonstração)",
      valor: Number(valor.toFixed(2)),
      prazo: "5 a 9 dias úteis"
    },
    {
      id: "demo-expresso",
      nome: "Entrega expressa (demonstração)",
      valor: Number((valor + 12).toFixed(2)),
      prazo: "2 a 5 dias úteis"
    }
  ];
}


app.get("/api/diagnostico-superfrete", async (req, res) => {
  const demoMode = String(process.env.DEMO_MODE || "").trim().toLowerCase() === "true";
  res.json({
    demoMode,
    tokenConfigurado: Boolean(process.env.SUPERFRETE_TOKEN),
    cepOrigem: process.env.CEP_ORIGEM || null,
    apiUrl: SUPERFRETE_API_URL
  });
});

app.post("/api/frete", async (req, res) => {
  try {
    const cepDestino = cleanCep(req.body.cep);
    const { peso, largura, altura, comprimento, valorDeclarado } = await productStore.parcel(req.body.itens);

    if (!validarCep(cepDestino)) {
      return res.status(400).json({ erro: "Informe um CEP válido com 8 números." });
    }

    const demoMode = String(process.env.DEMO_MODE || "").trim().toLowerCase() === "true";

    if (demoMode) {
      return res.json({
        modo: "demo",
        opcoes: freteDemo(cepDestino, peso)
      });
    }

    if (!process.env.SUPERFRETE_TOKEN) {
      return res.status(500).json({
        erro: "SUPERFRETE_TOKEN não configurado no arquivo .env."
      });
    }

    const origem = cleanCep(process.env.CEP_ORIGEM);

    if (!validarCep(origem)) {
      return res.status(500).json({
        erro: "CEP_ORIGEM inválido ou não configurado no arquivo .env."
      });
    }

    // Endpoint de cotação da API da SuperFrete.
    const resposta = await fetch(SUPERFRETE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${process.env.SUPERFRETE_TOKEN}`,
        "User-Agent": process.env.SUPERFRETE_USER_AGENT || "MinhaLoja/1.0 (contato@exemplo.com)"
      },
      body: JSON.stringify({
        from: { postal_code: origem },
        to: { postal_code: cepDestino },
        services: process.env.SUPERFRETE_SERVICES || "1,2,17",
        options: {
          own_hand: false,
          receipt: false,
          insurance_value: valorDeclarado,
          use_insurance_value: valorDeclarado > 0
        },
        package: {
          weight: peso,
          height: altura,
          width: largura,
          length: comprimento
        }
      })
    });

    const textoResposta = await resposta.text();
    let dados;
    try {
      dados = textoResposta ? JSON.parse(textoResposta) : {};
    } catch {
      dados = { raw: textoResposta };
    }

    console.log("Resposta SuperFrete:", JSON.stringify(dados, null, 2));

    if (!resposta.ok) {
      return res.status(resposta.status).json({
        erro: dados?.message || dados?.error || dados?.errors?.[0]?.message || "A SuperFrete recusou a cotação.",
        detalhes: dados
      });
    }

    // Mantém a resposta da API para o front-end. O formato pode variar conforme
    // os serviços retornados pela conta/API.
    const opcoesBrutas = Array.isArray(dados)
      ? dados
      : (Array.isArray(dados?.data)
          ? dados.data
          : (Array.isArray(dados?.services) ? dados.services : []));

    const errosServicos = opcoesBrutas
      .filter(item => item && item.error)
      .map(item => ({
        id: item.id ?? item.service_id ?? item.service?.id ?? null,
        nome: item.name ?? item.service_name ?? item.service?.name ?? item.company?.name ?? "Serviço",
        erro: typeof item.error === "string"
          ? item.error
          : (item.error?.message || item.message || JSON.stringify(item.error))
      }));

    const opcoes = opcoesBrutas
      .filter(item => item && !item.error)
      .map((item, index) => {
        const valor = Number(
          item.custom_price ??
          item.price ??
          item.cost ??
          item.discount ??
          0
        );

        const prazoNumero =
          item.custom_delivery_time ??
          item.delivery_time ??
          item.delivery_range?.max ??
          null;

        return {
          id: item.id ?? item.service_id ?? item.service?.id ?? index,
          nome:
            item.name ??
            item.service_name ??
            item.service?.name ??
            item.company?.name ??
            "Opção de envio",
          valor,
          prazo: prazoNumero
            ? `${prazoNumero} dias úteis`
            : "Prazo informado pela transportadora"
        };
      })
      .filter(item => Number.isFinite(item.valor) && item.valor > 0);

    if (!opcoes.length) {
      return res.status(422).json({
        erro: errosServicos.length
          ? "A SuperFrete respondeu, mas nenhum dos serviços consultados está disponível para esse envio."
          : "A SuperFrete respondeu sem opções de frete para esse envio.",
        detalhes: errosServicos.length ? errosServicos : dados
      });
    }

    return res.json({
      modo: "superfrete",
      opcoes,
      respostaOriginal: dados
    });
  } catch (erro) {
    if (erro.status) return res.status(erro.status).json({ erro: erro.message });
    console.error("Erro ao consultar a SuperFrete:", erro);

    let mensagem = "Não foi possível calcular o frete agora.";
    if (erro?.cause?.code === "ENOTFOUND" || erro?.code === "ENOTFOUND") {
      mensagem = "Não foi possível localizar o servidor da SuperFrete. Verifique o endereço da API ou sua conexão/DNS.";
    } else if (erro?.cause?.code === "ECONNREFUSED" || erro?.code === "ECONNREFUSED") {
      mensagem = "A conexão com a SuperFrete foi recusada.";
    }

    return res.status(500).json({
      erro: mensagem,
      detalhes: erro.message,
      codigo: erro?.cause?.code || erro?.code || null
    });
  }
});


app.use((error, req, res, next) => {
  res.status(error.status || 500).json({ erro: error.type === 'entity.too.large' ? 'Pedido muito grande.' : 'Requisição inválida.' });
});

if (require.main === module) app.listen(PORT, () => {
  const demoMode = String(process.env.DEMO_MODE || "").trim().toLowerCase() === "true";
  console.log(`Loja rodando em http://localhost:${PORT}`);
  console.log(`Modo de frete: ${demoMode ? "DEMONSTRAÇÃO" : "SUPERFRETE REAL"}`);
  console.log(`Token SuperFrete: ${process.env.SUPERFRETE_TOKEN ? "configurado" : "NÃO configurado"}`);
  console.log(`CEP de origem: ${process.env.CEP_ORIGEM || "NÃO configurado"}`);
  console.log(`API SuperFrete: ${SUPERFRETE_API_URL}`);
});
module.exports = app;
