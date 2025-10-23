/* Handshake Trust Checker content script */
/*
what up




*/

(function() {
  const RED_FLAGS = [
    /immediate\s*hire/i,
    /no\s*experience\s*required/i,
    /work from home and earn thousands/i,
    /send\s*payment/i,
    /training\s*fee/i,
    /quick\s*money/i,
    /wire\s*transfer/i,
    /gift\s*cards?/i,
    /telegram|whatsapp|signal/i,
    /crypto(?:currency)?/i,
    /upfront\s*fee/i
  ];

  function analyzeJob(jobText) {
    let score = 100;
    const text = jobText.toLowerCase();

    // Heuristic deductions
    RED_FLAGS.forEach(re => { if (re.test(text)) score -= 12; });
    if (text.length < 120) score -= 10;                     // very short description
    if (/\$?\s*\d{1,3},?\d{3,}/.test(text) && /per\s*week|daily|day/.test(text)) score -= 10; // big weekly pay
    if (/apply\s+via\s+google\s+form|docs\.google\.com\/forms/i.test(text)) score -= 8;
    if (/contact\s+via\s+dm|direct\s+message/.test(text)) score -= 6;
    if ((text.match(/[A-Z]{3,}/g) || []).length > 15) score -= 4; // shouty caps

    const label = score >= 80 ? "High Trust"
                : score >= 50 ? "Medium Trust"
                : "Low Trust";
    const color = score >= 80 ? "#16a34a"
                : score >= 50 ? "#f59e0b"
                : "#dc2626";
    return { score: Math.max(0, Math.min(100, score)), label, color };
  }

  function markCard(card, result) {
    if (card.querySelector(".htc-badge")) return;
    const badge = document.createElement("div");
    badge.className = "htc-badge";
    badge.textContent = `${result.label} (${result.score})`;
    badge.style.backgroundColor = result.color;
    card.appendChild(badge);
    card.setAttribute("data-htc", result.label);
    card.style.scrollMarginTop = "96px";
  }

  function extractText(node) {
    // Prefer innerText to include visible text only
    return (node.innerText || node.textContent || "").trim();
  }

  function candidateNodes() {
    // Try a few likely containers, Handshake uses a dynamic React app so we stay flexible
    const qs = [
      'div[class*="job-card"]',
      'div[class*="JobCard"]',
      'article',
      '[role="listitem"]',
      'a[href*="/jobs/"]'
    ];
    const set = new Set();
    qs.forEach(sel => document.querySelectorAll(sel).forEach(n => set.add(n)));
    return Array.from(set);
  }

  function scanJobs() {
    const nodes = candidateNodes();
    nodes.forEach(node => {
      const text = extractText(node);
      if (!text || text.length < 40) return;
      const result = analyzeJob(text);
      markCard(node, result);
    });
  }

  // Observe SPA updates
  const observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        scanJobs();
        break;
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // Listen for manual trigger from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "HANDSHAKE_SCAN") {
      scanJobs();
      sendResponse({ ok: true });
    }
  });

  // Initial scan after load
  setTimeout(scanJobs, 600);
})();
