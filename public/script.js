let carrinho = [];
let freteSelecionado = null;
let opcoesFrete = [];

const STORAGE_KEY = "minha-loja-dados";

const $ = (seletor) => document.querySelector(seletor);
const camposPersonalizacao = ['corSuporte', 'corTampa', 'corTrava'];
function lerPersonalizacao() {
  return Object.fromEntries(camposPersonalizacao.map(id => [id, document.getElementById(id).value.trim()]));
}

function salvarEstado() {
  const dados = {
    carrinho,
    freteSelecionado,
    opcoesFrete,
    personalizacao: lerPersonalizacao(),
    cliente: {
      nome: $("#nome")?.value || "",
      email: $("#email")?.value || "",
      telefone: $("#telefone")?.value || "",
      cpf: formatarCPF($("#cpf")?.value || ""),
      logradouro: $("#logradouro")?.value || "",
      cidade: $("#cidade")?.value || "",
      estado: $("#estado")?.value || "",
      numero: $("#numero")?.value || "",
      complemento: $("#complemento")?.value || "",
      cep: $("#cep")?.value || ""
    }
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

function carregarEstado() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (!salvo) return;

    const dados = JSON.parse(salvo);
    camposPersonalizacao.forEach(id => {
      const value = dados.personalizacao?.[id];
      if (typeof value === 'string') document.getElementById(id).value = value.slice(0, 1000);
    });

    if (Array.isArray(dados.carrinho)) {
      carrinho = dados.carrinho;
    }

    if (Array.isArray(dados.opcoesFrete)) {
      opcoesFrete = dados.opcoesFrete;
    }

    if (dados.freteSelecionado) {
      freteSelecionado = dados.freteSelecionado;
    }

    const cliente = dados.cliente || {};
    const campos = [
      "nome", "email", "telefone", "cpf", "logradouro",
      "cidade", "estado", "numero", "complemento", "cep"
    ];

    campos.forEach(id => {
      const campo = document.getElementById(id);
      if (campo && cliente[id]) campo.value = id === "cpf" ? formatarCPF(cliente[id]) : cliente[id];
    });
  } catch (erro) {
    console.warn("Não foi possível recuperar os dados salvos.", erro);
    localStorage.removeItem(STORAGE_KEY);
  }
}

function limparEstado() {
  localStorage.removeItem(STORAGE_KEY);
}

function dinheiro(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function produtoPorId(id) {
  return produtos.find(p => p.id === id);
}

function renderProdutos() {
  $("#listaProdutos").innerHTML = produtos.map(p => `
    <article class="produto">
      <div class="imagem-produto" data-produto="${p.id}"><img src="${p.imagem}" alt="${p.nome}"></div>
      <div class="info-produto">
        <h3>${p.nome}</h3>
        <p class="descricao">${p.descricao}</p>
        <div class="preco">${dinheiro(p.preco)}</div>
        <button class="adicionar" onclick="adicionar(${p.id})">Adicionar ao carrinho</button>
      </div>
    </article>
  `).join("");
  document.querySelectorAll('.imagem-produto[data-produto]').forEach(container => {
    const produto = produtoPorId(Number(container.dataset.produto));
    const fotos = [...new Set([produto.imagem, ...(produto.imagens || [])].filter(Boolean))];
    if (fotos.length < 2) return;
    container.classList.add('carrossel-produto');
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', `Fotos de ${produto.nome}`);
    const imagem = container.querySelector('img');
    let transicao = null;
    let indice = 0;
    const contador = document.createElement('span');
    contador.className = 'carrossel-contador';
    contador.setAttribute('aria-live', 'polite');
    contador.setAttribute('aria-atomic', 'true');
    function mostrarFoto(delta) {
      if (transicao) transicao.cancel();
      imagem.onload = null;
      indice = (indice + delta + fotos.length) % fotos.length;
      if (delta && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        imagem.onload = () => {
          imagem.onload = null;
          transicao = imagem.animate(
            [{ opacity: 0.2 }, { opacity: 1 }],
            { duration: 350, easing: 'ease-out' }
          );
        };
      }
      imagem.src = fotos[indice];
      if (imagem.complete && imagem.naturalWidth && imagem.onload) imagem.onload();
      imagem.alt = `${produto.nome} — foto ${indice + 1} de ${fotos.length}`;
      contador.textContent = `${indice + 1} / ${fotos.length}`;
    }
    for (const [delta, direcao, simbolo, rotulo] of [
      [-1, 'anterior', '‹', 'Foto anterior'], [1, 'proxima', '›', 'Próxima foto']
    ]) {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = `carrossel-seta carrossel-${direcao}`;
      botao.textContent = simbolo;
      botao.setAttribute('aria-label', rotulo);
      botao.addEventListener('click', () => mostrarFoto(delta));
      container.append(botao);
    }
    container.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      mostrarFoto(event.key === 'ArrowLeft' ? -1 : 1);
    });
    container.append(contador);
    mostrarFoto(0);
  });
}

function adicionar(id) {
  const existente = carrinho.find(i => i.id === id);
  if (existente) existente.quantidade++;
  else carrinho.push({ id, quantidade: 1 });

  freteSelecionado = null;
  renderCarrinho();
  salvarEstado();
  abrirCarrinho();
  mostrarToast("Produto adicionado ao carrinho.");
}

function alterarQuantidade(id, delta) {
  const item = carrinho.find(i => i.id === id);
  if (!item) return;

  item.quantidade += delta;
  if (item.quantidade <= 0) {
    carrinho = carrinho.filter(i => i.id !== id);
  }

  freteSelecionado = null;
  renderCarrinho();
  salvarEstado();
}

function remover(id) {
  carrinho = carrinho.filter(i => i.id !== id);
  freteSelecionado = null;
  renderCarrinho();
  salvarEstado();
}

function subtotal() {
  return carrinho.reduce((soma, item) => {
    const produto = produtoPorId(item.id);
    return soma + produto.preco * item.quantidade;
  }, 0);
}

function pesoTotal() {
  return carrinho.reduce((soma, item) => {
    const produto = produtoPorId(item.id);
    return soma + produto.peso * item.quantidade;
  }, 0);
}

function renderCarrinho() {
  $("#contador").textContent = carrinho.reduce((s, i) => s + i.quantidade, 0);

  if (!carrinho.length) {
    $("#itensCarrinho").innerHTML = `<div class="vazio">Seu carrinho está vazio.</div>`;
  } else {
    $("#itensCarrinho").innerHTML = carrinho.map(item => {
      const p = produtoPorId(item.id);
      return `
        <div class="item">
          <div class="mini-imagem">${p.id}</div>
          <div>
            <h4>${p.nome}</h4>
            <div>${dinheiro(p.preco)}</div>
            <div class="quantidade">
              <button onclick="alterarQuantidade(${p.id}, -1)">−</button>
              <span>${item.quantidade}</span>
              <button onclick="alterarQuantidade(${p.id}, 1)">+</button>
            </div>
          </div>
          <button class="remover" onclick="remover(${p.id})">Remover</button>
        </div>
      `;
    }).join("");
  }

  $("#subtotal").textContent = dinheiro(subtotal());
  $("#valorFrete").textContent = freteSelecionado ? dinheiro(freteSelecionado.valor) : "A calcular";
  $("#total").textContent = dinheiro(subtotal() + (freteSelecionado?.valor || 0));

  if (!freteSelecionado) {
    $("#resultadoFrete").innerHTML = "";
  }
}

function abrirCarrinho() {
  $("#fundoModal").classList.add("aberto");
}

function fecharCarrinho() {
  $("#fundoModal").classList.remove("aberto");
}

async function calcularFrete() {
  if (!carrinho.length) {
    mostrarToast("Adicione pelo menos um produto.");
    return;
  }

  const cep = $("#cep").value.replace(/\D/g, "");
  if (cep.length !== 8) {
    mostrarToast("Digite um CEP válido.");
    return;
  }

  const botao = $("#calcularFrete");
  botao.disabled = true;
  botao.textContent = "Calculando...";

  try {
    const resposta = await fetch("/api/frete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cep,
        peso: Math.max(pesoTotal(), 0.5),
        largura: Math.max(...carrinho.map(i => produtoPorId(i.id).largura)),
        altura: Math.max(...carrinho.map(i => produtoPorId(i.id).altura)),
        comprimento: Math.max(...carrinho.map(i => produtoPorId(i.id).comprimento)),
        valor: subtotal()
      })
    });

    const dados = await resposta.json();
    if (!resposta.ok) {
      let mensagem = dados.erro || "Erro ao calcular frete.";
      if (Array.isArray(dados.detalhes) && dados.detalhes.length) {
        mensagem += " " + dados.detalhes.map(item =>
          `${item.nome || "Serviço"}: ${item.erro || "indisponível"}`
        ).join(" | ");
      }
      throw new Error(mensagem);
    }

    opcoesFrete = dados.opcoes || [];
    if (!opcoesFrete.length) {
      throw new Error("Nenhuma opção de frete foi encontrada para esse CEP.");
    }

    freteSelecionado = opcoesFrete[0];
    renderOpcoesFrete();
    renderCarrinho();
    salvarEstado();

    if (dados.modo === "demo") {
      mostrarToast("Frete demonstrativo calculado. Configure a API para valores reais.");
    }
  } catch (erro) {
    $("#resultadoFrete").innerHTML = `<p style="color:#b00020">${erro.message}</p>`;
  } finally {
    botao.disabled = false;
    botao.textContent = "Calcular";
  }
}

function renderOpcoesFrete() {
  $("#resultadoFrete").innerHTML = opcoesFrete.map((opcao, index) => `
    <div class="opcao-frete ${index === 0 ? "selecionada" : ""}" onclick="selecionarFrete(${index})">
      <strong>${opcao.nome} — ${dinheiro(opcao.valor)}</strong>
      <small>${opcao.prazo}</small>
    </div>
  `).join("");
}

function selecionarFrete(index) {
  freteSelecionado = opcoesFrete[index];
  document.querySelectorAll(".opcao-frete").forEach((el, i) => {
    el.classList.toggle("selecionada", i === index);
  });
  renderCarrinho();
  salvarEstado();
}

let enviandoPedido = false;
let tentativaPedido = null;
try { tentativaPedido = JSON.parse(sessionStorage.getItem('marco-tentativa')); } catch {}
async function finalizarPedido() {
  if (enviandoPedido) return;
  if (!carrinho.length) {
    mostrarToast("Seu carrinho está vazio.");
    return;
  }

  if (!freteSelecionado) {
    mostrarToast("Calcule e selecione o frete antes de finalizar.");
    return;
  }

  const campos = [
    ["nome", "Informe seu nome."],
    ["email", "Informe seu e-mail."],
    ["telefone", "Informe seu telefone."],
    ["logradouro", "Informe o logradouro."],
    ["cidade", "Informe a cidade."],
    ["estado", "Selecione o estado."],
    ["numero", "Informe o número."]
  ];

  for (const [id, mensagem] of campos) {
    const campo = document.getElementById(id);
    if (!campo.value.trim()) {
      campo.focus();
      mostrarToast(mensagem);
      return;
    }
  }
  const config = window.lojaConfig;
  if (!config) {
    mostrarToast("Não foi possível carregar o WhatsApp da loja. Recarregue a página pelo servidor da loja.");
    return;
  }
  if (!config.whatsappConfigured || !config.whatsappNumber) {
    mostrarToast("Configure WHATSAPP_NUMBER no arquivo .env com DDI e DDD e reinicie o servidor.");
    return;
  }

  const cliente = {};
  for (const id of ['nome', 'email', 'telefone', 'cpf', 'logradouro', 'cidade', 'estado', 'numero', 'complemento', 'cep']) {
    cliente[id] = document.getElementById(id).value.trim();
  }
  const payload = { cliente, itens: carrinho.map(i => ({ id: i.id, quantidade: i.quantidade })), frete: freteSelecionado, personalizacao: lerPersonalizacao() };
  const snapshot = JSON.stringify(payload);
  if (!tentativaPedido || tentativaPedido.snapshot !== snapshot) {
    const random = new Uint8Array(24); crypto.getRandomValues(random);
    tentativaPedido = { snapshot, chave: Array.from(random, n => n.toString(16).padStart(2, '0')).join('') };
    try { sessionStorage.setItem('marco-tentativa', JSON.stringify(tentativaPedido)); } catch {}
  }
  enviandoPedido = true;
  const botao = $('#finalizarPedido'); botao.disabled = true; botao.textContent = 'Salvando pedido…';
  const aviso = $('#pedidoSalvo'); aviso.hidden = true;
  // Open during the click to avoid popup blockers after awaiting the server.
  const aba = window.open('about:blank', '_blank');
  if (aba) aba.opener = null;
  try {
    const resposta = await fetch('/api/pedidos', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Loja-Request': '1', 'Idempotency-Key': tentativaPedido.chave },
      body: snapshot
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível salvar o pedido. Tente novamente.');
    const url = 'https://wa.me/' + config.whatsappNumber + '?text=' + encodeURIComponent(dados.mensagem);
    $('#pedidoSalvoTexto').textContent = 'Pedido #' + String(dados.numero).padStart(5, '0') + ' registrado. Envie a mensagem no WhatsApp para conversar com a loja.';
    $('#abrirWhatsappPedido').href = url; aviso.hidden = false;
    try { salvarEstado(); } catch {}
    if (aba && !aba.closed) aba.location.replace(url);
    else mostrarToast('Pedido salvo! Use o botão Abrir WhatsApp abaixo para enviar.');
  } catch (erro) {
    if (aba && !aba.closed) aba.close();
    $('#pedidoSalvoTexto').textContent = erro.message + ' Seus dados foram mantidos para tentar novamente.';
    $('#abrirWhatsappPedido').removeAttribute('href'); aviso.hidden = false;
    mostrarToast(erro.message);
  } finally { enviandoPedido = false; botao.disabled = false; botao.textContent = 'Finalizar pedido'; }
}

function mostrarToast(texto) {
  const toast = $("#toast");
  toast.textContent = texto;
  toast.classList.add("mostrar");
  setTimeout(() => toast.classList.remove("mostrar"), 3200);
}

$("#abrirCarrinho").addEventListener("click", abrirCarrinho);
$("#fecharCarrinho").addEventListener("click", fecharCarrinho);
$("#fundoModal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) fecharCarrinho();
});
$("#calcularFrete").addEventListener("click", calcularFrete);
$("#finalizarPedido").addEventListener("click", finalizarPedido);

$("#cep").addEventListener("input", (e) => {
  let valor = e.target.value.replace(/\D/g, "").slice(0, 8);
  if (valor.length > 5) valor = valor.slice(0, 5) + "-" + valor.slice(5);
  e.target.value = valor;
  freteSelecionado = null; opcoesFrete = []; renderCarrinho();
});

$("#cpf").addEventListener("input", e => aplicarMascaraCPF(e.target));
$("#cpf").addEventListener("change", e => aplicarMascaraCPF(e.target));

$("#telefone").addEventListener("input", (e) => {
  let valor = e.target.value.replace(/\D/g, "").slice(0, 11);
  if (valor.length <= 10) {
    valor = valor.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
  } else {
    valor = valor.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  }
  e.target.value = valor.replace(/-$/, "");
  salvarEstado();
});

[
  "nome", "email", "telefone", "cpf", "logradouro",
  "cidade", "estado", "numero", "complemento", "cep"
].forEach(id => {
  const campo = document.getElementById(id);
  if (campo) {
    campo.addEventListener("input", salvarEstado);
    campo.addEventListener("change", salvarEstado);
  }
});

camposPersonalizacao.forEach(id => document.getElementById(id).addEventListener('input', salvarEstado));
carregarEstado();
renderProdutos();
renderCarrinho();

if (opcoesFrete.length) {
  renderOpcoesFrete();
}

$('#novoPedido').addEventListener('click', () => {
  if (enviandoPedido) return;
  tentativaPedido = null;
  try { sessionStorage.removeItem('marco-tentativa'); } catch {}
  carrinho = []; freteSelecionado = null; opcoesFrete = [];
  camposPersonalizacao.forEach(id => { document.getElementById(id).value = ''; });
  renderCarrinho(); salvarEstado(); $('#pedidoSalvo').hidden = true;
  mostrarToast('Carrinho pronto para um novo pedido.');
});
