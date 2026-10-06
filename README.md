# ⚖️ LicitaAudit

> **Auditoria de conformidade para processos licitatórios com base na Lei nº 14.133/2021.**

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-2fbf71?style=flat-square)
![Lei 14.133/2021](https://img.shields.io/badge/Lei-14.133%2F2021-5b8cff?style=flat-square)
![Sem build](https://img.shields.io/badge/build-not%20required-9aa5c7?style=flat-square)

---

## 📌 Sobre o projeto

**LicitaAudit** é uma aplicação web **100 % front-end** que ajuda servidores, analistas jurídicos, pregoeiros e órgãos de controle a verificar automaticamente a **conformidade de processos licitatórios** com a **Nova Lei de Licitações e Contratos Administrativos (Lei nº 14.133/2021)**.

O usuário carrega documentos do processo (edital, Termo de Referência, ETP, justificativas etc.) e a ferramenta:

- Extrai o texto **localmente no navegador** (nada é enviado a servidores);
- Detecta a **modalidade**, o **objeto** e o **critério de julgamento** predominantes;
- Executa um **checklist normativo** com base nos artigos 5º, 18, 22, 23, 28–33, 40, 55, 74, 75, 100, 150 e 191;
- Emite um **parecer visual** com status geral, divergências e **guia de correção**;
- Permite **exportar** o relatório em PDF (impressão) ou JSON.

---

## ✨ Funcionalidades

### 📥 Upload e extração local
- **Drag-and-drop** e seleção múltipla de arquivos.
- Formatos suportados: **`.pdf`, `.docx`, `.doc`, `.txt`, `.md`**.
- Extração via **[PDF.js](https://mozilla.github.io/pdf.js/)** e **[Mammoth.js](https://github.com/mwilliamson/mammoth.js)** no próprio navegador.
- Arquivos `.doc` (binário legado) exibem aviso para conversão.

### 🧠 Motor de regras — Lei 14.133/2021
| Verificação | Base legal |
|---|---|
| Estudo Técnico Preliminar (ETP) | Art. 18, §1º, I |
| Termo de Referência / Projeto Básico | Art. 6º, XXIII e XXV · Art. 40 |
| Estimativa do valor | Art. 23 |
| Adequação orçamentária | Art. 150 |
| Matriz de Riscos | Art. 22 · Art. 100 |
| Motivação e justificativa | Art. 5º · Art. 18, §1º |
| Compatibilidade objeto × modalidade | Art. 28 a Art. 32 |
| Prazos mínimos de divulgação | Art. 55 |
| Critério de julgamento expresso | Art. 33 |
| Ausência de referências à Lei 8.666/93 | Art. 191 |

### 📊 Relatório visual
- **Card de status** com gauge animado, índice de conformidade (%) e badges coloridos.
- **Identificação do processo**: objeto, modalidade e critério detectados.
- **Tabela comparativa**: *Requisito legal* × *Encontrado no documento* × *Status*.
- **Guia de correção** priorizado por severidade (alta / média).
- **Exportação**: impressão em PDF ou download do relatório em JSON.

### 🎨 Interface
- Tema **dark/light** com persistência em `localStorage`.
- Layout responsivo (grid CSS), microinterações e transições suaves.
- Acessibilidade: navegação por teclado, `aria-labels`, `prefers-reduced-motion`.
- Atalho **`Ctrl/Cmd + Enter`** para iniciar a análise.

---

## 🚀 Como rodar localmente

O projeto **não requer build, npm ou servidor**. Basta abrir o `index.html`.

### Opção 1 — Direto no navegador
```bash
git clone https://github.com/<seu-usuario>/licitaudit.git
cd licitaudit
# Abra o arquivo index.html no navegador de sua preferência
```

### Opção 2 — Servidor local (recomendado para testar o worker do PDF.js)
```bash
# Python 3
python -m http.server 8080

# ou Node.js
npx serve .
```
Acesse: <http://localhost:8080>

### 🌐 Deploy estático
Compatível com **GitHub Pages**, **Vercel**, **Netlify**, **Cloudflare Pages** — basta apontar para a raiz do repositório.

---

## 📁 Estrutura de arquivos

```
licitaudit/
├── index.html     # Estrutura semântica e acessível da aplicação
├── style.css      # Design system, temas e componentes
├── app.js         # Lógica: upload, extração, motor de regras e render
└── README.md      # Esta documentação
```

---

## 🧪 Como usar

1. **Carregue os documentos** do processo (edital, TR, ETP, justificativa etc.).
2. *(Opcional)* Ajuste os **parâmetros** no painel lateral (objeto, modalidade, critério).
3. Clique em **Analisar conformidade** ou pressione `Ctrl/Cmd + Enter`.
4. Consulte o **relatório**: status geral, tabela de verificação e guia de correção.
5. **Exporte** em PDF (imprimir) ou JSON.

---

## 🛡️ Privacidade

- **Nenhum arquivo é enviado a servidores.**
- Toda a extração e análise ocorre **no navegador do usuário**.
- As únicas requisições externas são para os CDNs das bibliotecas **PDF.js** e **Mammoth.js**.

---

## ⚠️ Aviso legal

Esta ferramenta é um **instrumento de apoio à decisão**. Seus resultados **não substituem** parecer jurídico, análise do agente de contratação, nem a manifestação do órgão de controle interno ou externo. A responsabilidade pela conformidade do processo permanece integralmente com a Administração Pública.

---

## 🛠️ Tecnologias

- **HTML5 semântico** — estrutura acessível e responsiva.
- **CSS3 moderno** — Custom Properties, Grid, Flexbox, `color-mix()`, temas.
- **JavaScript Vanilla (ES6+)** — modular, sem frameworks.
- **[PDF.js](https://mozilla.github.io/pdf.js/)** — extração de texto de PDFs.
- **[Mammoth.js](https://github.com/mwilliamson/mammoth.js)** — extração de texto de `.docx`.

---

## 🗺️ Roadmap

- [ ] Detecção de cláusulas específicas por número de artigo.
- [ ] Suporte a `.doc` via `mammoth` + conversão externa.
- [ ] Comparação lado a lado de múltiplos processos.
- [ ] Exportação em `.docx` estruturado.
- [ ] Integração com bases de preços (PNCP, Painel de Preços).
- [ ] Testes automatizados com Vitest + Playwright.

---

## 🤝 Contribuindo

1. Faça um *fork* do projeto.
2. Crie uma branch: `git checkout -b feature/minha-feature`.
3. Commit suas mudanças: `git commit -m 'feat: minha feature'`.
4. Push: `git push origin feature/minha-feature`.
5. Abra um *Pull Request*.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Consulte `LICENSE` para mais informações.

---

<p align="center">
  Feito com ⚖️ e ☕ para a Administração Pública brasileira.
</p>
