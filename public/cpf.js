(function (root) {
  function formatarCPF(valor) {
    return String(valor ?? '').replace(/\D/g, '').slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
  }

  function aplicarMascaraCPF(campo) {
    const valor = campo.value;
    const inicio = campo.selectionStart ?? valor.length;
    const digitosAntes = valor.slice(0, inicio).replace(/\D/g, '').length;
    campo.value = formatarCPF(valor);
    let posicao = 0;
    let digitos = 0;
    while (posicao < campo.value.length && digitos < digitosAntes) {
      if (/\d/.test(campo.value[posicao])) digitos++;
      posicao++;
    }
    campo.setSelectionRange(posicao, posicao);
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { formatarCPF, aplicarMascaraCPF };
  } else {
    root.formatarCPF = formatarCPF;
    root.aplicarMascaraCPF = aplicarMascaraCPF;
  }
})(typeof window === 'undefined' ? globalThis : window);
