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

  const badgeFor = new WeakMap();
  const JOB_KEYWORDS = [
    /responsibil/i,
    /qualification/i,
    /requirement/i,
    /preferred/i,
    /benefits?/i,
    /job description/i,
    /application deadline/i,
    /what you'll do/i,
    /who you are/i,
    /about the role/i,
    /apply now/i
  ];

  function markCard(card, result) {
    let badge = badgeFor.get(card);
    if (!badge || !badge.isConnected) {
      badge = document.createElement("span");
      badge.className = "htc-badge";
      badgeFor.set(card, badge);

      const heading = card.querySelector(
        'h1, h2, h3, [data-testid*="title" i], [data-qa*="title" i]'
      );
      if (heading) {
        badge.classList.add("htc-badge-inline");
        heading.insertAdjacentElement("afterend", badge);
      } else {
        card.appendChild(badge);
      }
      card.style.scrollMarginTop = "96px";
    }

    badge.textContent = `${result.label} (${result.score})`;
    badge.style.backgroundColor = result.color;
    card.setAttribute("data-htc", result.label);
    card.setAttribute("data-htc-score", String(result.score));
  }

  function extractText(node) {
    // Prefer innerText to include visible text only
    return (node.innerText || node.textContent || "").trim();
  }

  function isLikelyJobNode(node, text) {
    if (!text || text.length < 40) return false;

    if (node.matches('[data-qa*="job" i], [data-testid*="job" i], [data-test*="job" i]')) return true;
    if (node.matches('div[class*="JobCard"], div[class*="job-card"], div[class*="JobDetails"]')) return true;
    if (node.matches('a[href*="/jobs/"]')) return true;
    if (node.getAttribute("role") === "link" && /jobs\//i.test(node.getAttribute("aria-label") || "")) return true;

    const keywordHits = JOB_KEYWORDS.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
    if (keywordHits >= 2) return true;
    if (text.length > 320 && keywordHits >= 1) return true;

    if (node.querySelector('[data-testid*="description" i], [data-qa*="description" i]')) return true;

    return Boolean(node.dataset && (node.dataset.jobId || node.dataset.jobid));
  }

  function candidateNodes() {
    const selectors = [
      '[data-qa*="job" i]',
      '[data-testid*="job" i]',
      '[data-test*="job" i]',
      'div[class*="JobCard"]',
      'div[class*="job-card"]',
      'div[class*="JobDetails"]',
      'article',
      'section',
      'main',
      '[role="listitem"]',
      'a[href*="/jobs/"]',
      'div[role="link"][data-job-id]'
    ];

    const set = new Set();
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(node => {
        if (node instanceof HTMLElement) set.add(node);
      });
    });

    document.querySelectorAll('h1, h2').forEach(heading => {
      if (!/job/i.test(heading.textContent || "")) return;
      const container = heading.closest('article, section, main, div');
      if (container && container instanceof HTMLElement) set.add(container);
    });

    return Array.from(set);
  }

  function scanJobs() {
    candidateNodes().forEach(node => {
      const text = extractText(node);
      if (!isLikelyJobNode(node, text)) return;
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
