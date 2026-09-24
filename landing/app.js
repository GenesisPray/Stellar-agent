// Bear on Stellar — Landing Page
// Scroll reveals, copy-to-clipboard, mobile nav, contract address loading,
// animated protocol stack diagram, interactive SDK snippet viewer

document.addEventListener("DOMContentLoaded", () => {
  // ── Dashboard link base URL ──
  // Reads the configurable base path from the <meta name="marc-dashboard-url">
  // tag so this same markup works whether the dashboard is served from this
  // same origin (default "/app") or deployed separately (override the meta
  // tag's content with an absolute URL).
  const dashboardUrl = document.querySelector('meta[name="marc-dashboard-url"]')?.content?.trim();
  if (dashboardUrl) {
    document.querySelectorAll("[data-dashboard-link]").forEach((link) => {
      link.href = dashboardUrl;
    });
  }

  // ── Scroll reveal observer (fade-in elements) ──
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 },
  );

  // Stagger fade-in items inside grids
  document
    .querySelectorAll(".stack-grid, .steps-grid, .code-grid, .contracts-grid")
    .forEach((group) => {
      const items = group.querySelectorAll(".fade-in");
      items.forEach((el, i) => {
        el.style.transitionDelay = i * 0.1 + "s";
        revealObserver.observe(el);
      });
    });

  // Standalone fade-in elements
  document.querySelectorAll(".fade-in").forEach((el) => {
    if (!el.style.transitionDelay) {
      revealObserver.observe(el);
    }
  });

  // ── Active nav link tracking ──
  const nav = document.getElementById("nav");
  const sections = document.querySelectorAll("section[id]");
  const navLinks = document.querySelectorAll(".nav-link[data-section]");

  window.addEventListener(
    "scroll",
    () => {
      let current = "";
      sections.forEach((section) => {
        const top = section.offsetTop - 100;
        if (window.scrollY >= top) {
          current = section.getAttribute("id");
        }
      });
      navLinks.forEach((link) => {
        link.classList.toggle("active", link.dataset.section === current);
      });
    },
    { passive: true },
  );

  // ── Copy-to-clipboard ──
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = "Copied!";
  document.body.appendChild(toast);

  let toastTimeout;
  function showToast(message) {
    toast.textContent = message || "Copied!";
    toast.classList.add("show");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("show"), 1500);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  document.querySelectorAll(".contract-addr").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const addr = btn.dataset.address;
      if (!addr) return;
      await copyText(addr);
      showToast("Copied!");
    });
  });

  // ── Interactive SDK snippet viewer (issue #600) ──
  // Renders the selected use-case snippet with lightweight syntax
  // highlighting and a one-click copy button with tooltip feedback.
  const SNIPPETS = {
    identity: {
      label: "Identity",
      code: [
        "import { MarcClient } from 'marc-stellar-sdk';\n",
        "\n",
        "const client = new MarcClient({ network: 'testnet' });\n",
        "\n",
        "// Register an agent identity (ERC-8004)\n",
        "const agent = await client.identity.register({\n",
        "  name: 'research-agent',\n",
        "  capabilities: ['search', 'summarize'],\n",
        "  metadataUri: 'ipfs://bafy...',\n",
        "});\n",
        "\n",
        "console.log('Agent registered:', agent.id);\n",
      ].join(""),
    },
    escrow: {
      label: "Escrow Job",
      code: [
        "import { MarcClient } from 'marc-stellar-sdk';\n",
        "\n",
        "const client = new MarcClient({ network: 'testnet' });\n",
        "\n",
        "// Create an escrow-backed job (ERC-8183)\n",
        "const job = await client.jobs.create({\n",
        "  provider: 'G...PROVIDER',\n",
        "  amount: '100',\n",
        "  asset: 'USDC',\n",
        "  deadline: Math.floor(Date.now() / 1000) + 3600,\n",
        "});\n",
        "\n",
        "await job.fund();\n",
        "console.log('Job funded:', job.id);\n",
      ].join(""),
    },
    x402: {
      label: "x402 Paywall",
      code: [
        "import { MarcClient } from 'marc-stellar-sdk';\n",
        "\n",
        "const client = new MarcClient({ network: 'testnet' });\n",
        "\n",
        "// Gate an endpoint behind an x402 paywall\n",
        "const paywall = client.x402.paywall({\n",
        "  price: '0.01',\n",
        "  asset: 'USDC',\n",
        "  payTo: 'G...MERCHANT',\n",
        "});\n",
        "\n",
        "app.get('/premium', paywall, (req, res) => {\n",
        "  res.json({ data: 'paid content' });\n",
        "});\n",
      ].join(""),
    },
    fetch: {
      label: "Fetch with Payment",
      code: [
        "import { MarcClient } from 'marc-stellar-sdk';\n",
        "\n",
        "const client = new MarcClient({ network: 'testnet' });\n",
        "\n",
        "// Automatically settle HTTP 402 challenges\n",
        "const res = await client.x402.fetch('https://api.example.com/premium', {\n",
        "  method: 'GET',\n",
        "  maxAmount: '0.05',\n",
        "});\n",
        "\n",
        "const data = await res.json();\n",
        "console.log('Paid response:', data);\n",
      ].join(""),
    },
  };

  const snippetViewer = document.querySelector("[data-snippet-viewer]");
  if (snippetViewer) {
    const tabs = snippetViewer.querySelectorAll("[data-snippet-tab]");
    const codeEl = snippetViewer.querySelector("[data-snippet-code]");
    const copyBtn = snippetViewer.querySelector("[data-snippet-copy]");
    const tooltip = snippetViewer.querySelector("[data-snippet-tooltip]");
    let activeKey = tabs[0]?.dataset.snippetTab || "identity";

    // Minimal tokenizer: comments, strings, keywords, numbers.
    function highlight(code) {
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return escaped
        .replace(/(\/\/[^\n]*)/g, '<span class="tok-comment">$1</span>')
        .replace(/(&#39;|')([^'\n]*)(&#39;|')/g, '<span class="tok-string">$1$2$3</span>')
        .replace(/\b(import|from|const|await|async|new|return|console)\b/g, '<span class="tok-keyword">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-number">$1</span>');
    }

    function renderSnippet(key) {
      const snippet = SNIPPETS[key];
      if (!snippet || !codeEl) return;
      activeKey = key;
      codeEl.innerHTML = highlight(snippet.code);
      tabs.forEach((tab) => {
        const isActive = tab.dataset.snippetTab === key;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => renderSnippet(tab.dataset.snippetTab));
    });

    let tooltipTimeout;
    copyBtn?.addEventListener("click", async () => {
      const snippet = SNIPPETS[activeKey];
      if (!snippet) return;
      await copyText(snippet.code);
      if (tooltip) {
        tooltip.classList.add("show");
        clearTimeout(tooltipTimeout);
        tooltipTimeout = setTimeout(() => tooltip.classList.remove("show"), 1500);
      }
      showToast("Copied!");
    });

    renderSnippet(activeKey);
  }

  // ── Mobile hamburger toggle ──
  const hamburger = document.getElementById("hamburger");
  const navLinksContainer = document.getElementById("nav-links");
  hamburger?.addEventListener("click", () => {
    const open = navLinksContainer.classList.toggle("nav-open");
    hamburger.setAttribute("aria-expanded", String(open));
  });
  navLinksContainer?.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", () => {
      navLinksContainer.classList.remove("nav-open");
      hamburger?.setAttribute("aria-expanded", "false");
    });
  });

  // ── Live contract addresses (issue #304) ──
  // Fetch from the /api/contract-addresses serverless endpoint and populate
  // the contract cards. Falls back silently to the hardcoded values already
  // in the HTML if the endpoint is unavailable.
  const CONTRACT_KEYS = {
    agent_identity: "CAMPXYFZJTIPEVOPOAZPRG5OHXKNBDPGTPRCOIO4LVPGEM4TONPY65A5",
    agentic_commerce: "CD2KWU7IE74Z2QKVP3FQ67J46XHNMGIDTNKXVWE7ZNVRC7T6UH46GQXE",
  };

  async function loadContractAddresses() {
    try {
      const res = await fetch("/api/contract-addresses");
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.contracts) return;

      const cardMap = {
        agent_identity: document.querySelector('[data-contract="agent_identity"]'),
        agentic_commerce: document.querySelector('[data-contract="agentic_commerce"]'),
      };

      for (const [key, card] of Object.entries(cardMap)) {
        const info = data.contracts[key];
        if (!card || !info?.address) continue;
        const btn = card.querySelector(".contract-addr");
        const code = card.querySelector(".contract-addr code");
        const full = card.querySelector(".contract-addr-full");
        const explorerLink = card.querySelector(".contract-explorer");
        if (btn) btn.dataset.address = info.address;
        if (code) code.textContent = info.address.slice(0, 4) + "..." + info.address.slice(-6);
        if (full) full.textContent = info.address;
        if (explorerLink && info.explorer) explorerLink.href = info.explorer;
      }

      // Mark cards as live-loaded for visibility
      document.querySelectorAll(".contracts-grid [data-contract]").forEach((c) => {
        c.classList.add("contracts-live");
      });
    } catch {
      // Silently fall back to static values
    }
  }

  loadContractAddresses();

  // ── Animated Protocol Stack Diagram (issue #303) ──
  const canvas = document.getElementById("protocol-diagram");
  if (canvas && canvas.getContext) {
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;

    function resizeCanvas() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * DPR;
      canvas.height = 280 * DPR;
      canvas.style.width = rect.width + "px";
      canvas.style.height = "280px";
      ctx.scale(DPR, DPR);
    }
    resizeCanvas();
    window.addEventListener("resize", () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      resizeCanvas();
    });

    const LAYERS = [
      { label: "Agent Identity", sublabel: "ERC-8004 · Register", color: "#F97316", y: 40 },
      {
        label: "Agentic Commerce",
        sublabel: "ERC-8183 · Escrow & Settle",
        color: "#FB923C",
        y: 120,
      },
      { label: "x402 / MPP", sublabel: "HTTP 402 · Micropayments", color: "#FED7AA", y: 200 },
    ];

    const ARROW_COLOR = "#F97316";
    let tick = 0;
    let animationId;
    let diagramVisible = false;

    const diagramObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !diagramVisible) {
            diagramVisible = true;
            tick = 0;
            drawLoop();
          }
        });
      },
      { threshold: 0.2 },
    );
    diagramObserver.observe(canvas);

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function drawLayer(layer, progress, w) {
      const boxH = 60;
      const boxW = Math.min(w - 48, 640);
      const x = (w - boxW) / 2;
      const y = layer.y;
      const alpha = easeOutCubic(Math.min(progress, 1));
      const slideX = (1 - alpha) * -24;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(slideX, 0);

      // Card background
      ctx.beginPath();
      ctx.roundRect(x, y, boxW, boxH, 10);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(249,115,22,0.12)";
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Left accent bar
      ctx.beginPath();
      ctx.roundRect(x, y, 4, boxH, [10, 0, 0, 10]);
      ctx.fillStyle = layer.color;
      ctx.fill();

      // Label
      ctx.fillStyle = "#0A0A0A";
      ctx.font = "600 15px Inter, system-ui, sans-serif";
      ctx.fillText(layer.label, x + 20, y + 26);

      // Sublabel
      ctx.fillStyle = "#6B7280";
      ctx.font = "400 12px Inter, system-ui, sans-serif";
      ctx.fillText(layer.sublabel, x + 20, y + 44);

      ctx.restore();
    }

    function drawArrow(fromY, toY, progress, w) {
      const alpha = easeOutCubic(Math.min(progress, 1));
      if (alpha <= 0) return;
      const cx = w / 2;
      const startY = fromY + 60;
      const endY = toY;
      const currentY = startY + (endY - startY) * alpha;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = ARROW_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, startY);
      ctx.lineTo(cx, currentY);
      ctx.stroke();

      if (alpha > 0.9) {
        ctx.beginPath();
        ctx.moveTo(cx - 5, endY - 8);
        ctx.lineTo(cx, endY);
        ctx.lineTo(cx + 5, endY - 8);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawLoop() {
      const w = canvas.width / DPR;
      ctx.clearRect(0, 0, w, 280);

      const t = tick / 60;
      LAYERS.forEach((layer, i) => {
        const progress = (t - i * 0.35) / 0.6;
        drawLayer(layer, progress, w);
      });

      drawArrow(LAYERS[0].y, LAYERS[1].y, (t - 0.5) / 0.5, w);
      drawArrow(LAYERS[1].y, LAYERS[2].y, (t - 0.9) / 0.5, w);

      tick++;
      if (t < 2.2) {
        animationId = requestAnimationFrame(drawLoop);
      }
    }
  }
});
