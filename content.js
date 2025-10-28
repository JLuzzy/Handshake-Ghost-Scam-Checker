/* Handshake Trust Checker content script */
/*
what up




*/

(function() {
  const RED_FLAG_RULES = [
    {
      pattern: /immediate\s*hire/i,
      message: "Mentions immediate hire, which can be a pressure tactic.",
      deduction: 12
    },
    {
      pattern: /no\s*experience\s*required/i,
      message: "Promises no experience required, a common scam lure.",
      deduction: 12
    },
    {
      pattern: /work from home and earn thousands/i,
      message: "Highlights unusually high work-from-home pay.",
      deduction: 12
    },
    {
      pattern: /send\s*payment/i,
      message: "Requests sending payment, which is a major warning sign.",
      deduction: 12
    },
    {
      pattern: /training\s*fee/i,
      message: "Mentions training fees, which legitimate employers rarely require.",
      deduction: 12
    },
    {
      pattern: /quick\s*money/i,
      message: "Promises quick money, often associated with scams.",
      deduction: 12
    },
    {
      pattern: /wire\s*transfer/i,
      message: "References wire transfers, which scammers frequently exploit.",
      deduction: 12
    },
    {
      pattern: /gift\s*cards?/i,
      message: "Talks about gift cards, another scam payment method.",
      deduction: 12
    },
    {
      pattern: /telegram|whatsapp|signal/i,
      message: "Directs you to encrypted messengers (Telegram/WhatsApp/Signal).",
      deduction: 12
    },
    {
      pattern: /crypto(?:currency)?/i,
      message: "Discusses cryptocurrency, which scammers may use to hide funds.",
      deduction: 12
    },
    {
      pattern: /upfront\s*fee/i,
      message: "Asks for an upfront fee, a key scam indicator.",
      deduction: 12
    }
  ];

  function analyzeJob(jobText) {
    let score = 100;
    const text = jobText.toLowerCase();
    const reasons = [];

    // Heuristic deductions
    RED_FLAG_RULES.forEach(rule => {
      if (rule.pattern.test(text)) {
        score -= rule.deduction;
        reasons.push(rule.message);
      }
    });

    if (text.length < 120) {
      score -= 10;
      reasons.push("Description is very short, leaving out important details.");
    }

    if (/\$?\s*\d{1,3},?\d{3,}/.test(text) && /per\s*week|daily|day/.test(text)) {
      score -= 10;
      reasons.push("Advertises very high short-term pay, which can be unrealistic.");
    }

    if (/apply\s+via\s+google\s+form|docs\.google\.com\/forms/i.test(text)) {
      score -= 8;
      reasons.push("Application happens through an informal Google Form.");
    }

    if (/contact\s+via\s+dm|direct\s+message/.test(text)) {
      score -= 6;
      reasons.push("Asks to continue via direct messages instead of official channels.");
    }

    if ((text.match(/[A-Z]{3,}/g) || []).length > 15) {
      score -= 4;
      reasons.push("Uses a lot of all-caps text for emphasis, which is a spam signal.");
    }

    score = Math.max(0, Math.min(100, score));

    const label = score >= 80 ? "High Trust"
                : score >= 50 ? "Medium Trust"
                : "Low Trust";
    const color = score >= 80 ? "#16a34a"
                : score >= 50 ? "#f59e0b"
                : "#dc2626";

    if (label === "High Trust" && reasons.length === 0) {
      reasons.push("No obvious scam signals detected in this description.");
    }

    if (label === "Low Trust") {
      reasons.push("Treat this listing cautiously and verify the employer before proceeding.");
    }

    return { score, label, color, reasons };
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
      badge = document.createElement("div");
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

      const ratingLine = document.createElement("div");
      ratingLine.className = "htc-badge-rating";
      badge.appendChild(ratingLine);

      const summaryList = document.createElement("ul");
      summaryList.className = "htc-badge-summary";
      badge.appendChild(summaryList);
    }

    const ratingLine = badge.querySelector(".htc-badge-rating");
    const summaryList = badge.querySelector(".htc-badge-summary");

    if (ratingLine) {
      ratingLine.textContent = `${result.label} (${result.score})`;
    }

    if (summaryList) {
      summaryList.innerHTML = "";
      result.reasons.forEach(reason => {
        const li = document.createElement("li");
        li.textContent = reason;
        summaryList.appendChild(li);
      });
    }

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

  function elementDepth(node) {
    let depth = 0;
    let current = node;
    while (current && current.parentElement) {
      depth += 1;
      current = current.parentElement;
    }
    return depth;
  }

  function scanJobs() {
    const handled = new Set();
    const nodes = candidateNodes().sort((a, b) => elementDepth(b) - elementDepth(a));

    nodes.forEach(node => {
      let shouldSkip = false;
      handled.forEach(processed => {
        if (!shouldSkip && node.contains(processed)) {
          shouldSkip = true;
        }
      });
      if (shouldSkip) return;

      const text = extractText(node);
      if (!isLikelyJobNode(node, text)) return;
      const result = analyzeJob(text);
      markCard(node, result);
      handled.add(node);
    });
  }

  let spinnerEl = null;
  let currentScanToken = 0;

  function ensureSpinner() {
    if (spinnerEl && spinnerEl.isConnected) return spinnerEl;
    spinnerEl = document.createElement("div");
    spinnerEl.className = "htc-spinner-overlay";
    spinnerEl.setAttribute("role", "status");
    spinnerEl.setAttribute("aria-live", "polite");
    spinnerEl.innerHTML = `
      <div class="htc-spinner-circle" aria-hidden="true"></div>
      <span class="htc-spinner-message">Analyzing job...</span>
    `;
    const parent = document.body || document.documentElement;
    parent.appendChild(spinnerEl);
    return spinnerEl;
  }

  function showSpinner() {
    const el = ensureSpinner();
    if (!el) return;
    requestAnimationFrame(() => el.classList.add("visible"));
  }

  function hideSpinner() {
    if (spinnerEl) spinnerEl.classList.remove("visible");
  }

  function scheduleScanSequence(initialDelay = 250, attempts = 3, spacing = 400) {
    const token = ++currentScanToken;
    showSpinner();

    let runs = 0;
    const attemptScan = () => {
      if (token !== currentScanToken) return;
      scanJobs();
      runs += 1;
      if (runs >= attempts) {
        if (token === currentScanToken) hideSpinner();
      } else {
        setTimeout(attemptScan, spacing);
      }
    };

    setTimeout(attemptScan, initialDelay);
  }

  function wasModifiedClick(event) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  }

  function isExtensionElement(target) {
    return target instanceof Element && Boolean(target.closest(".htc-badge, .htc-spinner-overlay"));
  }

  document.addEventListener("click", event => {
    if (event.button !== 0) return;
    if (wasModifiedClick(event)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (isExtensionElement(target)) return;

    const jobTrigger = target.closest(
      'a[href*="/jobs/"], [data-qa*="job" i], [data-testid*="job" i], [data-test*="job" i], [data-job-id], [data-jobid]'
    );
    if (!jobTrigger) return;

    scheduleScanSequence();
  }, true);

  // Listen for manual trigger from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === "HANDSHAKE_SCAN") {
      scheduleScanSequence(0);
      sendResponse({ ok: true });
    }
  });
})();
