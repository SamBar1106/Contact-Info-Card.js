(function(){
  const WIN_NAME = 'NSSchedulerInspectorAppWindow';

  /* Retrieve saved window geometry from localStorage with safe screen fallbacks */
  let savedGeom = null;
  try {
    savedGeom = JSON.parse(localStorage.getItem('ns_inspector_geom') || 'null');
  } catch (e) {}

  const defaultWidth = 490;
  const defaultHeight = Math.min(window.screen.availHeight - 60, 940);
  const defaultLeft = Math.max(20, window.screen.availWidth - defaultWidth - 25);
  const defaultTop = 30;

  const winWidth = (savedGeom && savedGeom.width >= 350) ? savedGeom.width : defaultWidth;
  const winHeight = (savedGeom && savedGeom.height >= 400) ? savedGeom.height : defaultHeight;
  
  const leftPos = (savedGeom && typeof savedGeom.left === 'number')
    ? Math.max(10, Math.min(savedGeom.left, window.screen.availWidth - 120))
    : defaultLeft;
  const topPos = (savedGeom && typeof savedGeom.top === 'number')
    ? Math.max(10, Math.min(savedGeom.top, window.screen.availHeight - 120))
    : defaultTop;

  const winFeatures = 'popup=1,width=' + winWidth + ',height=' + winHeight + ',left=' + leftPos + ',top=' + topPos + ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no';

  let popup = window.open('', WIN_NAME, winFeatures);
  if (!popup) {
    alert('Pop-up Blocked by Chrome!\n\n1. Click the lock/tune icon in the address bar.\n2. Set "Pop-ups and redirects" to Allow.\n3. Click this bookmark again.');
    return;
  }

  try { popup.opener = window; } catch(e) {}
  popup.focus();

  if (popup.document && popup.document.getElementById('ns-main-app-container')) {
    if (typeof popup.__nsRehookOpener === 'function') popup.__nsRehookOpener(window);
    return;
  }

  const doc = popup.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>NetSuite Inspector</title></head><body style="margin:0;padding:0;background:rgb(18,18,20);overflow:hidden;width:100vw;height:100vh;user-select:text;-webkit-user-select:text;"></body></html>');
  doc.close();

  function runInspectorApp() {
    const UI_ID = 'ns-main-app-container';
    const cache = {
      contacts: new Map(),
      clients: new Map(),
      clientContacts: new Map(),
      eventAttendance: new Map(),
      weekHeaders: new WeakMap()
    };

    let activeClientInternalId = null;
    let activeClientName = '';
    let activeContactId = null;
    let activeContactName = '';
    let activePdfUrl = '';
    let activeAttendeeId = null;
    let seminarPipWin = null;
    let pdfPipWin = null;
    let cachedMatchingSeminars = null;

    /* Absolute URL Resolver for Cross-Window & PiP Navigation */
    function getNsOrigin() {
      try {
        if (window.opener && window.opener.location && window.opener.location.origin && window.opener.location.origin !== 'null') {
          return window.opener.location.origin;
        }
      } catch (e) {}
      try {
        if (window.location && window.location.origin && window.location.origin !== 'null') {
          return window.location.origin;
        }
      } catch (e) {}
      return 'https://3940793.app.netsuite.com';
    }

    function toAbsoluteNsUrl(url) {
      if (!url) return '';
      if (/^https?:\/\//i.test(url)) return url;
      const origin = getNsOrigin();
      const path = url.startsWith('/') ? url : ('/' + url);
      return origin ? (origin + path) : path;
    }

    /* Geometry Memory: Track and save window position and size */
    let lastSavedGeom = '';
    function saveWindowGeometry() {
      try {
        const w = window.outerWidth || window.innerWidth;
        const h = window.outerHeight || window.innerHeight;
        const x = window.screenX !== undefined ? window.screenX : window.screenLeft;
        const y = window.screenY !== undefined ? window.screenY : window.screenTop;

        if (w >= 350 && h >= 400 && typeof x === 'number' && typeof y === 'number') {
          const geomKey = `${w}_${h}_${x}_${y}`;
          if (geomKey !== lastSavedGeom) {
            lastSavedGeom = geomKey;
            localStorage.setItem('ns_inspector_geom', JSON.stringify({ width: w, height: h, left: x, top: y }));
          }
        }
      } catch (e) {}
    }

    window.addEventListener('resize', saveWindowGeometry);
    window.addEventListener('beforeunload', saveWindowGeometry);
    window.addEventListener('pagehide', saveWindowGeometry);
    setInterval(saveWindowGeometry, 1500);

    /* Text-Only Highlighter Styles (Zero Container Disruption) */
    function ensureBoardStyles(doc) {
      if (!doc) return;
      let s = doc.getElementById('ns-inspector-board-styles');
      if (!s) {
        s = doc.createElement('style');
        s.id = 'ns-inspector-board-styles';
        (doc.head || doc.body).appendChild(s);
      }
      s.textContent = `
        .ns-inspector-active-highlight {
          background-color: #fef08a !important;
          color: #000000 !important;
          padding: 1px 4px !important;
          border-radius: 3px !important;
          display: inline-block !important;
          box-decoration-break: clone !important;
          -webkit-box-decoration-break: clone !important;
          box-shadow: none !important;
          outline: none !important;
          transform: none !important;
        }
        .ns-inspector-active-highlight a,
        .ns-inspector-active-highlight span,
        .ns-inspector-active-highlight div {
          color: #000000 !important;
          background: transparent !important;
          text-shadow: none !important;
        }
      `;
    }

    /* Name-Only Highlighter */
    function highlightBoardElement(el) {
      try {
        if (!el) return;
        const targetDoc = el.ownerDocument || window.opener?.document || document;
        ensureBoardStyles(targetDoc);

        targetDoc.querySelectorAll('.ns-inspector-active-highlight').forEach(node => {
          node.classList.remove('ns-inspector-active-highlight');
          node.style.removeProperty('background-color');
          node.style.removeProperty('color');
          node.style.removeProperty('padding');
          node.style.removeProperty('border-radius');
          node.style.removeProperty('display');
          node.style.removeProperty('box-decoration-break');
          node.style.removeProperty('-webkit-box-decoration-break');
          node.style.removeProperty('box-shadow');
          node.style.removeProperty('outline');
          node.style.removeProperty('outline-offset');
          node.style.removeProperty('transform');
        });

        let target = el.querySelector('.attendeeName') || 
                     el.closest('.attendeeName') || 
                     el.querySelector('a[href*="contact.nl"]') || 
                     el.closest('a[href*="contact.nl"]') ||
                     el.querySelector('.attendeeNameWrap') ||
                     el.closest('.attendeeNameWrap');

        if (!target && (el.getAttribute('data-courseattendeeid') || el.closest('[data-courseattendeeid]'))) {
          const block = el.closest('[data-courseattendeeid]') || el;
          target = block.querySelector('.attendeeName, a, span') || block;
        }

        if (!target && (el.tagName === 'TD' || el.tagName === 'TH')) {
          target = el.querySelector('a, span, b, strong') || el;
        }

        if (!target) target = el;

        target.classList.add('ns-inspector-active-highlight');
        target.style.setProperty('background-color', '#fef08a', 'important');
        target.style.setProperty('color', '#000000', 'important');
        target.style.setProperty('padding', '1px 4px', 'important');
        target.style.setProperty('border-radius', '3px', 'important');
        target.style.setProperty('display', 'inline-block', 'important');
        target.style.setProperty('box-decoration-break', 'clone', 'important');
        target.style.setProperty('-webkit-box-decoration-break', 'clone', 'important');

        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      } catch (err) {
        console.warn('Failed to highlight name on board:', err);
      }
    }

    window.addEventListener('pagehide', () => {
      try {
        const oWin = window.opener;
        if (oWin && !oWin.closed) {
          if (oWin.__nsInspectorActiveHandler === onBoardClick) {
            oWin.__nsInspectorActiveHandler = null;
          }
          const oDoc = oWin.document;
          if (oDoc) {
            oDoc.querySelectorAll('.ns-inspector-active-highlight').forEach(node => {
              node.classList.remove('ns-inspector-active-highlight');
              node.style.removeProperty('background-color');
              node.style.removeProperty('color');
              node.style.removeProperty('padding');
              node.style.removeProperty('border-radius');
              node.style.removeProperty('display');
              node.style.removeProperty('box-decoration-break');
              node.style.removeProperty('-webkit-box-decoration-break');
              node.style.removeProperty('box-shadow');
              node.style.removeProperty('outline');
              node.style.removeProperty('outline-offset');
              node.style.removeProperty('transform');
            });
          }
        }
      } catch (e) {}
    });

    /* PDF.js Dynamic Loader */
    function ensurePdfJsLoaded() {
      return new Promise((resolve, reject) => {
        if (window.pdfjsLib) return resolve(window.pdfjsLib);

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 
            'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'));
        document.head.appendChild(script);
      });
    }

    /* PDF Text Layer Extractor */
    async function extractLinesFromPdf(pdfUrl) {
      if (!pdfUrl) return [];
      const pdfjs = await ensurePdfJsLoaded();
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const arrayBuffer = await res.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const allLines = [];

      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const textContent = await page.getTextContent();
        
        const lineBuckets = new Map();
        textContent.items.forEach(item => {
          const text = (item.str || '').trim();
          if (!text) return;
          const y = Math.round(item.transform[5]);
          let bucketY = null;
          for (const key of lineBuckets.keys()) {
            if (Math.abs(key - y) <= 4) { bucketY = key; break; }
          }
          if (bucketY === null) {
            bucketY = y;
            lineBuckets.set(bucketY, []);
          }
          lineBuckets.get(bucketY).push({ x: item.transform[4], str: item.str });
        });

        const sortedY = Array.from(lineBuckets.keys()).sort((a, b) => b - a);
        sortedY.forEach(yKey => {
          const lineItems = lineBuckets.get(yKey).sort((a, b) => a.x - b.x);
          const combined = lineItems.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
          if (combined) allLines.push(combined);
        });
      }

      return allLines;
    }

    /* Universal Date Normalizer (Handles ranges, yearless dates, and rolling years) */
    function normalizeDate(dStr) {
      if (!dStr) return '';
      const s = String(dStr).replace(/\u00a0/g, ' ').trim();
      const now = new Date();
      const refYear = now.getFullYear();
      const refMonth = now.getMonth() + 1;

      // 1. Date Range: e.g. 10/15 - 10/17 or 10/15/2026 - 10/17/2026 or 10/15 - 10/17/2026
      const rangeMatch = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*(?:-|to|–)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
      if (rangeMatch) {
        const m1 = parseInt(rangeMatch[1], 10);
        const d1 = parseInt(rangeMatch[2], 10);
        const y1 = rangeMatch[3];
        const y2 = rangeMatch[6];

        let yr = refYear;
        if (y1) yr = y1.length === 2 ? parseInt('20' + y1, 10) : parseInt(y1, 10);
        else if (y2) yr = y2.length === 2 ? parseInt('20' + y2, 10) : parseInt(y2, 10);
        else yr = (m1 >= refMonth - 1) ? refYear : (refYear + 1);

        return `${yr}-${String(m1).padStart(2, '0')}-${String(d1).padStart(2, '0')}`;
      }

      // 2. ISO format: YYYY-MM-DD
      const isoM = s.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
      if (isoM) {
        return `${isoM[1]}-${String(isoM[2]).padStart(2, '0')}-${String(isoM[3]).padStart(2, '0')}`;
      }

      // 3. DD-Mon-YYYY or DD-Mon-YY
      const monthsMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
      const ddmmyyyy = s.match(/\b(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-(\d{2,4})\b/i);
      if (ddmmyyyy) {
        let yr = ddmmyyyy[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${monthsMap[ddmmyyyy[2].toLowerCase()] || '01'}-${String(ddmmyyyy[1]).padStart(2, '0')}`;
      }

      // 4. Month DD, YYYY or Month DD
      const monthNameM = s.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{2,4}))?\b/i);
      if (monthNameM) {
        const mPrefix = monthNameM[1].substring(0, 3).toLowerCase();
        const mNum = parseInt(monthsMap[mPrefix] || '1', 10);
        const dNum = parseInt(monthNameM[2], 10);
        let yr = refYear;
        if (monthNameM[3]) {
          const yStr = monthNameM[3];
          yr = yStr.length === 2 ? parseInt('20' + yStr, 10) : parseInt(yStr, 10);
        } else {
          yr = (mNum >= refMonth - 1) ? refYear : (refYear + 1);
        }
        return `${yr}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
      }

      // 5. Slash with year: MM/DD/YYYY or MM/DD/YY
      const slashWithYear = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
      if (slashWithYear) {
        const m = parseInt(slashWithYear[1], 10);
        const d = parseInt(slashWithYear[2], 10);
        let yr = slashWithYear[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }

      // 6. Slash without year: MM/DD
      const slashNoYear = s.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (slashNoYear) {
        const m = parseInt(slashNoYear[1], 10);
        const d = parseInt(slashNoYear[2], 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          const yr = (m >= refMonth - 1) ? refYear : (refYear + 1);
          return `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        }
      }

      return '';
    }

    /* Extract Date Substring and ISO from Line */
    function extractDateFromLine(line) {
      if (!line) return null;

      // 1. Range: 10/15 - 10/17 or 10/15/2026 - 10/17/2026
      const rangeM = line.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:-|to|–)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/i);
      if (rangeM) {
        const iso = normalizeDate(rangeM[0]);
        if (iso) return { rawDate: rangeM[0], iso };
      }

      // 2. ISO: YYYY-MM-DD
      const isoM = line.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/);
      if (isoM) {
        const iso = normalizeDate(isoM[0]);
        if (iso) return { rawDate: isoM[0], iso };
      }

      // 3. DD-Mon-YYYY: 24-Sep-2026
      const ddmonM = line.match(/\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-\d{2,4}\b/i);
      if (ddmonM) {
        const iso = normalizeDate(ddmonM[0]);
        if (iso) return { rawDate: ddmonM[0], iso };
      }

      // 4. Month DD, YYYY: October 15, 2026 or Oct 15
      const monNameM = line.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{2,4})?\b/i);
      if (monNameM) {
        const iso = normalizeDate(monNameM[0]);
        if (iso) return { rawDate: monNameM[0], iso };
      }

      // 5. Single slash with year: 10/15/2026
      const slashYrM = line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
      if (slashYrM) {
        const iso = normalizeDate(slashYrM[0]);
        if (iso) return { rawDate: slashYrM[0], iso };
      }

      // 6. Single slash without year: 10/15
      const slashNoYrM = line.match(/\b\d{1,2}\/\d{1,2}\b/);
      if (slashNoYrM) {
        const iso = normalizeDate(slashNoYrM[0]);
        if (iso) return { rawDate: slashNoYrM[0], iso };
      }

      return null;
    }

    /* Relationships Subtab Full Contact Discovery with Pagination */
    async function getAllClientContacts(clientId) {
      if (cache.clientContacts.has(clientId)) {
        return cache.clientContacts.get(clientId);
      }

      const initialUrl = `/app/common/entity/custjob.nl?id=${clientId}&selectedtab=s_relation`;
      const res = await fetch(initialUrl);
      const html = await res.text();
      const mainDoc = new DOMParser().parseFromString(html, 'text/html');
      const allDocs = [mainDoc];

      let machineName = 'contact';
      let rangeParam = 'contactrange';
      let pageIndices = [];

      const rangeEls = Array.from(mainDoc.querySelectorAll('[data-options*="range"], select[name*="range"]'));
      const contactRangeEl = rangeEls.find(el => {
        const str = (el.getAttribute('name') || el.id || el.getAttribute('data-options') || '').toLowerCase();
        return str.includes('contact');
      }) || rangeEls.find(el => {
        const str = (el.getAttribute('name') || el.id || '').toLowerCase();
        return !str.includes('mge_event');
      });

      if (contactRangeEl) {
        const nameAttr = contactRangeEl.getAttribute('name') || contactRangeEl.id || '';
        if (nameAttr) {
          rangeParam = nameAttr;
          machineName = nameAttr.replace(/range$/i, '');
        }
        try {
          const rawOpts = (contactRangeEl.getAttribute('data-options') || '').replace(/&quot;/g, '"');
          const opts = JSON.parse(rawOpts);
          pageIndices = opts.map(o => String(o.value)).filter(v => v !== '0' && v !== '');
        } catch (e) {
          contactRangeEl.querySelectorAll('option').forEach(opt => {
            const v = opt.value;
            if (v && v !== '0' && !pageIndices.includes(v)) pageIndices.push(v);
          });
        }
      }

      if (!pageIndices.length) {
        const textMatch = html.match(/\b1\s+to\s+(\d+)\s+of\s+(\d+)\b/i);
        if (textMatch) {
          const perPage = parseInt(textMatch[1], 10);
          const total = parseInt(textMatch[2], 10);
          if (perPage > 0 && total > perPage) {
            const totalPages = Math.ceil(total / perPage);
            for (let p = 1; p < totalPages; p++) pageIndices.push(String(p));
          }
        }
      }

      if (pageIndices.length > 0) {
        const urls = pageIndices.map(si => 
          `/app/common/entity/custjob.nl?id=${clientId}&selectedtab=s_relation&q=${rangeParam}&si=${si}&f=T&machine=${machineName}`
        );
        const responses = await Promise.allSettled(urls.map(u => fetch(u).then(r => r.text())));
        responses.forEach(r => {
          if (r.status === 'fulfilled' && r.value) {
            allDocs.push(new DOMParser().parseFromString(r.value, 'text/html'));
          }
        });
      }

      const contactMap = new Map();

      allDocs.forEach(d => {
        d.querySelectorAll('a[href*="contact.nl?id="], a[href*="/entity/contact.nl?id="]').forEach(a => {
          const href = a.getAttribute('href') || '';
          const m = href.match(/[?&]id=(\d+)/);
          if (!m) return;
          const id = m[1];
          const name = (a.innerText || a.textContent || '').trim();

          if (!name || /^(edit|view)$/i.test(name)) return;

          if (!contactMap.has(id)) {
            const row = a.closest('tr');
            let position = '';
            if (row) {
              const cells = Array.from(row.querySelectorAll('td'));
              const tbl = row.closest('table');
              const headerRow = tbl ? tbl.querySelector('tr.uir-list-header-tr, tr:has(th)') : null;
              let posColIdx = -1;
              if (headerRow) {
                Array.from(headerRow.children).forEach((th, idx) => {
                  const hTxt = (th.innerText || th.textContent || '').trim().toLowerCase();
                  if (hTxt.includes('title') || hTxt.includes('job') || hTxt.includes('role') || hTxt.includes('position')) {
                    posColIdx = idx;
                  }
                });
              }
              if (posColIdx !== -1 && cells[posColIdx]) {
                position = (cells[posColIdx].innerText || cells[posColIdx].textContent || '').trim();
              } else {
                const nameTd = a.closest('td');
                const nextTd = nameTd?.nextElementSibling;
                if (nextTd) {
                  const t = (nextTd.innerText || nextTd.textContent || '').trim();
                  if (t && !t.includes('@') && !/\d{3}/.test(t)) position = t;
                }
              }
            }

            contactMap.set(id, { id, name, position });
          }
        });
      });

      const list = Array.from(contactMap.values());
      cache.clientContacts.set(clientId, list);
      return list;
    }

    const appContainer = document.getElementById(UI_ID);
    const seminarPill = document.getElementById('ns-seminar-pip-pill');
    const modal60d = document.getElementById('ns-modal-60d');
    const modalCloseBtn = document.getElementById('ns-modal-60d-close');
    const btnScan60d = document.getElementById('ns-insp-btn-scan-60d');

    modalCloseBtn.onclick = () => { modal60d.style.display = 'none'; };

    /* 60-Day Office Outlook Batch Scanner */
    btnScan60d.onclick = async () => {
      if (!activeClientInternalId) {
        alert('Please click on an attendee or client on the board first.');
        return;
      }

      modal60d.style.display = 'flex';
      document.getElementById('ns-modal-60d-client').textContent = 'Client: ' + (activeClientName || 'Selected Client');
      const progressBox = document.getElementById('ns-modal-60d-progress');
      const progressText = document.getElementById('ns-modal-60d-progress-text');
      const tbody = document.getElementById('ns-modal-60d-tbody');

      progressBox.style.display = 'block';
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:rgb(161,161,170); padding:20px;">Discovering office contacts (Relationships subtab)...</td></tr>';

      try {
        const contacts = await getAllClientContacts(activeClientInternalId);

        // Guarantee currently active contact is in the list
        if (activeContactId && !contacts.some(c => c.id === activeContactId)) {
          contacts.push({ id: activeContactId, name: activeContactName || 'Selected Attendee', position: '' });
        }

        if (!contacts.length) {
          progressBox.style.display = 'none';
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:rgb(248,113,113); padding:20px;">No registered contacts found under Relationships tab.</td></tr>';
          return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const sixtyDaysOut = new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000));

        const upcomingEvents = [];
        let processedCount = 0;
        progressText.textContent = `0 / ${contacts.length}`;

        const chunkSize = 2;
        for (let i = 0; i < contacts.length; i += chunkSize) {
          const chunk = contacts.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async (contact) => {
            const pdfUrl = `/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=${contact.id}`;
            try {
              const lines = await extractLinesFromPdf(pdfUrl);
              for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx];
                const dateInfo = extractDateFromLine(line);

                if (dateInfo && dateInfo.iso) {
                  const p = dateInfo.iso.split('-').map(Number);
                  const dt = new Date(p[0], p[1] - 1, p[2]);

                  if (!isNaN(dt.getTime()) && dt >= now && dt <= sixtyDaysOut) {
                    const diffDays = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
                    let cleanTitle = line.replace(dateInfo.rawDate, '')
                                         .replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled|schedule\s*change|the|on|dates?)\b/gi, '')
                                         .replace(/[^a-zA-Z0-9\s&/'"-]/g, ' ')
                                         .replace(/\s+/g, ' ')
                                         .trim();

                    // If title is too short, bind to adjacent line
                    if (cleanTitle.length < 4) {
                      const prevLine = lineIdx > 0 ? lines[lineIdx - 1] : '';
                      const nextLine = lineIdx + 1 < lines.length ? lines[lineIdx + 1] : '';

                      if (prevLine && !extractDateFromLine(prevLine)) {
                        cleanTitle = prevLine.replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled)\b/gi, '').trim();
                      } else if (nextLine && !extractDateFromLine(nextLine)) {
                        cleanTitle = nextLine.replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled)\b/gi, '').trim();
                      } else {
                        cleanTitle = 'Scheduled Seminar';
                      }
                    }

                    const k = `${contact.id}_${cleanTitle}_${dateInfo.iso}`;
                    if (!upcomingEvents.some(x => x.key === k)) {
                      upcomingEvents.push({
                        key: k,
                        contactName: contact.name,
                        contactId: contact.id,
                        position: contact.position || 'Contact',
                        title: cleanTitle,
                        dateStr: dateInfo.rawDate,
                        iso: dateInfo.iso,
                        timestamp: dt.getTime(),
                        diffDays,
                        pdfUrl
                      });
                    }
                  }
                }
              }
            } catch (err) {}
            processedCount++;
            progressText.textContent = `${processedCount} / ${contacts.length}`;
          }));
        }

        progressBox.style.display = 'none';

        if (!upcomingEvents.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:rgb(161,161,170); padding:20px;">No upcoming sessions scheduled in the next 60 days for this office.</td></tr>';
          return;
        }

        upcomingEvents.sort((a, b) => a.timestamp - b.timestamp);

        tbody.innerHTML = upcomingEvents.map(ev => {
          let badge = `<span class="pill" style="background:rgba(56,189,248,0.2); color:#38bdf8; border-color:rgba(56,189,248,0.4);">In ${ev.diffDays} day(s)</span>`;
          if (ev.diffDays === 0) badge = `<span class="pill" style="background:rgba(34,197,94,0.25); color:#4ade80; border-color:rgba(34,197,94,0.6);">Today</span>`;
          else if (ev.diffDays === 1) badge = `<span class="pill" style="background:rgba(251,191,36,0.2); color:#fbbf24; border-color:rgba(251,191,36,0.4);">Tomorrow</span>`;

          const fullPdfUrl = toAbsoluteNsUrl(ev.pdfUrl);
          const fullContactUrl = toAbsoluteNsUrl('/app/common/entity/contact.nl?id=' + ev.contactId);

          return `
            <tr>
              <td>
                <a href="${fullContactUrl}" target="_blank" style="font-weight:700; color:white; text-decoration:none;">${ev.contactName}</a>
                <div style="font-size:10px; color:rgb(161,161,170);">${ev.position}</div>
              </td>
              <td style="font-weight:600; color:#fbbf24;">${ev.title}</td>
              <td style="white-space:nowrap;">${ev.dateStr}</td>
              <td style="white-space:nowrap;">${badge}</td>
              <td style="white-space:nowrap;">
                <div style="display:flex; gap:4px;">
                  <button class="pill" style="cursor:pointer; background:rgba(192,132,252,0.2); color:rgb(192,132,252); border-color:rgba(192,132,252,0.4);" data-action-pdf="${fullPdfUrl}" data-action-name="${ev.contactName}">📄 PDF</button>
                  <a href="${fullContactUrl}" target="_blank" class="pill" style="cursor:pointer; background:rgba(255,255,255,0.08); color:white; text-decoration:none;">Open ↗</a>
                </div>
              </td>
            </tr>
          `;
        }).join('');

        tbody.querySelectorAll('[data-action-pdf]').forEach(btn => {
          btn.onclick = () => {
            activePdfUrl = btn.getAttribute('data-action-pdf');
            activeContactName = btn.getAttribute('data-action-name');
            openPdfPiP();
          };
        });

      } catch (err) {
        progressBox.style.display = 'none';
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:rgb(248,113,113); padding:20px;">Scan failed: ${err.message}</td></tr>`;
      }
    };

    function setPdfPiPLoading(name) {
      if (!pdfPipWin || pdfPipWin.closed) return;
      try {
        const pDoc = pdfPipWin.document;
        pDoc.title = `Schedule PDF • Loading...`;
        const nameEl = pDoc.getElementById('pip-pdf-name');
        if (nameEl) nameEl.textContent = `• ${name || 'Attendee'} (Loading PDF...)`;
      } catch (e) {}
    }

    function updatePdfPiPIfOpen(url, name) {
      if (!pdfPipWin || pdfPipWin.closed) return;
      try {
        const pDoc = pdfPipWin.document;
        pDoc.title = `Schedule PDF • ${name || 'Attendee'}`;
        const nameEl = pDoc.getElementById('pip-pdf-name');
        if (nameEl) nameEl.textContent = `• ${name || 'Attendee'}`;
        const tabBtn = pDoc.getElementById('pip-pdf-tab');
        if (tabBtn) tabBtn.href = url || 'about:blank';
        const fr = pDoc.getElementById('pip-pdf-frame');
        if (fr && url && fr.src !== url) {
          fr.src = url;
        }
      } catch (e) {
        console.warn('Failed to update open PDF PiP window:', e);
      }
    }

    async function openPdfPiP() {
      if (!activePdfUrl) return;

      if (pdfPipWin && !pdfPipWin.closed) {
        updatePdfPiPIfOpen(activePdfUrl, activeContactName);
        pdfPipWin.focus();
        return;
      }

      const pipApi = window.opener?.documentPictureInPicture || window.documentPictureInPicture;
      if (pipApi) {
        try {
          pdfPipWin = await pipApi.requestWindow({ width: 720, height: 860 });
          const pDoc = pdfPipWin.document;
          pDoc.title = `Schedule PDF • ${activeContactName || 'Attendee'}`;

          const s = pDoc.createElement('style');
          s.textContent = `
            * { box-sizing: border-box; }
            html, body {
              margin: 0; padding: 0; width: 100%; height: 100%;
              overflow: hidden; background: rgb(18, 18, 20);
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
              display: flex; flex-direction: column;
              user-select: text; -webkit-user-select: text;
            }
            .pip-pdf-nav {
              display: flex; justify-content: space-between; align-items: center;
              padding: 8px 12px; background: rgba(24, 24, 27, 0.98);
              border-bottom: 1px solid rgba(255, 255, 255, 0.12); flex-shrink: 0;
              user-select: none; -webkit-user-select: none;
            }
            .pip-pdf-title {
              display: flex; align-items: center; gap: 8px; font-weight: 700;
              color: rgb(192, 132, 252); font-size: 12px;
            }
            .btn {
              padding: 4px 10px; border-radius: 6px; cursor: pointer; font-weight: 600;
              font-size: 11px; text-decoration: none; border: 1px solid rgba(255, 255, 255, 0.18);
              background: rgba(255, 255, 255, 0.08); color: rgb(250, 250, 250); transition: all 0.2s ease;
              user-select: none; -webkit-user-select: none;
            }
            .btn:hover { background: rgba(255, 255, 255, 0.14); }
            iframe { width: 100%; height: 100%; border: none; background: white; }
          `;
          pDoc.head.appendChild(s);

          pDoc.body.innerHTML = `
            <div class="pip-pdf-nav">
              <div class="pip-pdf-title">
                <span>📄 Schedule PDF Preview</span>
                <span id="pip-pdf-name" style="font-size:11px; color:rgb(161, 161, 170);">• ${activeContactName || 'Attendee'}</span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <a id="pip-pdf-tab" href="${activePdfUrl}" target="_blank" class="btn">Open in Tab ↗</a>
                <button class="btn" id="pip-pdf-btn-close" style="padding:4px 8px;">✕</button>
              </div>
            </div>
            <div style="flex:1; position:relative; background:rgb(24, 24, 27);">
              <iframe id="pip-pdf-frame" src="${activePdfUrl}"></iframe>
            </div>
          `;

          pDoc.getElementById('pip-pdf-btn-close').onclick = () => { if (pdfPipWin) pdfPipWin.close(); };
          pdfPipWin.addEventListener('pagehide', () => { pdfPipWin = null; });
          return;
        } catch (e) {
          console.warn('Document PiP window creation for PDF failed, opening popup fallback:', e);
        }
      }

      window.open(activePdfUrl, 'NSSchedulePDFWindow_' + Date.now(), 'popup=1,width=750,height=880,menubar=no,toolbar=no,location=no,status=no,resizable=yes');
    }

    function getCanonicalKey(rawStr, rawDate = '') {
      if (!rawStr) return { isoDate: '', coreName: '' };
      let s = String(rawStr).replace(/\u00a0/g, ' ').toLowerCase();
      let isoDate = '';
      const foundDate = extractDateFromLine(s);
      if (foundDate && foundDate.iso) isoDate = foundDate.iso;
      else if (rawDate) isoDate = normalizeDate(rawDate);
      s = s.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:-|to|–)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/gi, ' ');
      s = s.replace(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}-[a-z]{3}-\d{2,4}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}\/\d{1,2}\b/gi, ' ');
      s = s.replace(/\b(edit\s*\|\s*view|edit|view|livestream|virtual|online|in person|seminar|workshop|webinar|course)\b/gi, ' ');
      s = s.replace(/[^a-z0-9\s]/g, ' ');
      const coreName = s.split(/\s+/).filter(w => w && w !== 'the' && w !== 'and').join('');
      return { isoDate, coreName };
    }

    function isSeminarHeader(el) {
      if (!el || el.classList.contains('clientRecord') || el.hasAttribute('data-clientid') || el.querySelector('.attendeeName')) return false;
      if (el.classList.contains('eventRecord')) return true;
      const txt = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!txt || txt.length > 160) return false;
      return Boolean(extractDateFromLine(txt));
    }

    function parseEventCell(el) {
      if (!el) return null;
      const rawText = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      const allDates = [];
      const dInfo = extractDateFromLine(rawText);
      if (dInfo && dInfo.iso) allDates.push(dInfo.iso);
      const sig = getCanonicalKey(rawText, dInfo ? dInfo.rawDate : '');
      return { element: el, rawText, dateStr: dInfo ? dInfo.rawDate : '', allNormDates: allDates, coreName: sig.coreName };
    }

    function findBoardEvent(targetEl) {
      const cell = targetEl.closest('td, th');
      const tr = cell ? cell.closest('tr') : null;
      if (!cell || !tr) return null;
      if (isSeminarHeader(cell)) return parseEventCell(cell);
      let cur = tr.previousElementSibling;
      while (cur) {
        for (const c of cur.children) if (isSeminarHeader(c)) return parseEventCell(c);
        cur = cur.previousElementSibling;
      }
      const table = tr.closest('table');
      if (table) {
        const thead = table.querySelector('thead');
        if (thead) {
          for (const hr of thead.querySelectorAll('tr')) {
            for (const c of hr.children) if (isSeminarHeader(c)) return parseEventCell(c);
          }
        }
      }
      const oDoc = window.opener?.document || document;
      const candidates = Array.from(oDoc.querySelectorAll('.eventRecord, td[colspan], th[colspan]')).filter(isSeminarHeader);
      const prec = candidates.filter(ev => Boolean(cell.compareDocumentPosition(ev) & Node.DOCUMENT_POSITION_PRECEDING));
      return prec.length > 0 ? parseEventCell(prec[prec.length - 1]) : null;
    }

    function getOpenBoardDateInfo() {
      const oDoc = window.opener?.document || document;
      const exactDates = new Set();
      const boardEvents = [];

      oDoc.querySelectorAll('th.dayTh, th[class*="day_"], [id*="_day_"], [id*="day_"], thead th, .wkTbl th, .wkTd th').forEach(th => {
        const txt = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim();
        const dInfo = extractDateFromLine(txt);
        if (dInfo && dInfo.iso) exactDates.add(dInfo.iso);
      });

      oDoc.querySelectorAll('.eventRecord, td[colspan], th[colspan]').forEach(el => {
        if (isSeminarHeader(el)) {
          const p = parseEventCell(el);
          if (p) {
            boardEvents.push(p);
            if (p.allNormDates) p.allNormDates.forEach(d => exactDates.add(d));
          }
        }
      });

      const weekRanges = [];
      exactDates.forEach(dStr => {
        const parts = dStr.split('-').map(Number);
        if (parts.length === 3) {
          const dt = new Date(parts[0], parts[1] - 1, parts[2]);
          if (!isNaN(dt.getTime())) {
            const day = dt.getDay();
            const diffToMon = day === 0 ? -6 : 1 - day;
            const mon = new Date(dt);
            mon.setDate(dt.getDate() + diffToMon);
            const sun = new Date(mon);
            sun.setDate(mon.getDate() + 6);
            const toIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            weekRanges.push({ start: toIso(mon), end: toIso(sun) });
          }
        }
      });

      return { exactDates, weekRanges, boardEvents };
    }

    function isEventInOpenWeeks(item, openBoardInfo) {
      const itemDate = normalizeDate(item.date);
      if (itemDate) {
        if (openBoardInfo.exactDates.has(itemDate)) return true;
        for (const r of openBoardInfo.weekRanges) {
          if (itemDate >= r.start && itemDate <= r.end) return true;
        }
      }

      if (openBoardInfo.boardEvents && openBoardInfo.boardEvents.length > 0) {
        const sig = getCanonicalKey(item.eventTitle, item.date);
        for (const bev of openBoardInfo.boardEvents) {
          if (bev.allNormDates && itemDate && bev.allNormDates.includes(itemDate)) return true;
          if (bev.coreName && sig.coreName && (bev.coreName.includes(sig.coreName) || sig.coreName.includes(bev.coreName))) {
            if (!itemDate) return true;
            for (const r of openBoardInfo.weekRanges) {
              if (itemDate >= r.start && itemDate <= r.end) return true;
            }
          }
        }
      }
      return false;
    }

    /* Resilient Multi-Attendee Attendance Parsing */
    async function getAllAttendance(clientId) {
      if (cache.eventAttendance.has(clientId)) return cache.eventAttendance.get(clientId);

      const res = await fetch(`/app/common/entity/custjob.nl?id=${clientId}&selectedtab=custom26`);
      const html = await res.text();
      const mainDoc = new DOMParser().parseFromString(html, 'text/html');
      const allDocs = [mainDoc];

      const hasEventTable = Boolean(mainDoc.querySelector('table[id*="mge_event_client"], tr[id*="mge_event_client"]'));
      if (!hasEventTable) {
        try {
          const directUrl = `/app/common/entity/custjob.nl?id=${clientId}&q=recmachcustrecord_mge_event_clientrange&si=0&f=T&machine=recmachcustrecord_mge_event_client`;
          const directRes = await fetch(directUrl);
          if (directRes.ok) {
            const directHtml = await directRes.text();
            if (directHtml.length > 100) {
              allDocs.push(new DOMParser().parseFromString(directHtml, 'text/html'));
            }
          }
        } catch (e) {}
      }

      let pageIndices = [];
      const rangeEl = mainDoc.querySelector('[data-options*="recmachcustrecord_mge_event_clientrange"]');
      if (rangeEl) {
        try {
          const opts = JSON.parse((rangeEl.getAttribute('data-options') || '').replace(/&quot;/g, '"'));
          pageIndices = opts.map(o => String(o.value)).filter(v => v !== '0' && v !== '');
        } catch (e) {}
      }
      if (!pageIndices.length) {
        const m = (html || '').match(/\b1\s+to\s+(\d+)\s+of\s+(\d+)\b/i);
        if (m) {
          const totalPages = Math.ceil(parseInt(m[2], 10) / parseInt(m[1], 10));
          for (let p = 1; p < totalPages; p++) pageIndices.push(String(p));
        }
      }

      if (pageIndices.length > 0) {
        const urls = pageIndices.map(si => `/app/common/entity/custjob.nl?id=${clientId}&q=recmachcustrecord_mge_event_clientrange&si=${si}&f=T&machine=recmachcustrecord_mge_event_client`);
        const responses = await Promise.allSettled(urls.map(u => fetch(u).then(r => r.text())));
        responses.forEach(r => {
          if (r.status === 'fulfilled' && r.value) {
            allDocs.push(new DOMParser().parseFromString(r.value, 'text/html'));
          }
        });
      }

      const results = [];
      allDocs.forEach(d => {
        d.querySelectorAll('a[href*="contact.nl?id="], a[href*="/entity/contact.nl?id="]').forEach(cLink => {
          const row = cLink.closest('tr');
          if (!row || row.querySelector('th')) return;

          const tbl = row.closest('table');
          if (tbl && tbl.id && /usernotes|messages|activities|media|contacts?_?splits|address|calls|tasks/i.test(tbl.id)) return;

          const contactName = (cLink.innerText || cLink.textContent || '').trim();
          const contactId = cLink.getAttribute('href')?.match(/[?&]id=(\d+)/)?.[1] || '';
          if (!contactName) return;

          let rowEditUrl = '';
          const allRowLinks = Array.from(row.querySelectorAll('a'));
          for (const a of allRowLinks) {
            const txt = (a.innerText || a.textContent || '').trim().toLowerCase();
            const href = a.getAttribute('href') || '';
            const onclick = a.getAttribute('onclick') || '';
            const combined = href + ' ' + onclick;

            if (txt === 'edit' || combined.includes('custrecordentry.nl') || combined.includes('&e=T')) {
              const mCust = combined.match(/(?:https?:\/\/[^\s'"]+)?(?:\/app\/common\/custom\/|\.\.\/custom\/|custom\/)?(custrecordentry\.nl\?[^'"\s\)]+)/i);
              if (mCust) {
                let q = mCust[1].replace(/&amp;/g, '&');
                if (!q.startsWith('/app/common/custom/')) q = '/app/common/custom/' + q;
                if (!q.includes('&e=T')) q += '&e=T';
                rowEditUrl = q;
                break;
              }
              const mApp = combined.match(/\/app\/[^\s'"\)]+/);
              if (mApp) {
                let q = mApp[0].replace(/&amp;/g, '&');
                if (!q.includes('&e=T') && !q.includes('contact.nl')) q += '&e=T';
                rowEditUrl = q;
                break;
              }
            }
          }

          if (!rowEditUrl && contactId) {
            rowEditUrl = '/app/common/entity/contact.nl?id=' + contactId + '&e=T';
          }

          let attendanceDate = '';
          let attendanceStatus = '';
          let seminarTitle = '';

          row.querySelectorAll('td').forEach(cell => {
            if (cell.contains(cLink)) return;
            const text = (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || /^(edit|view)$/i.test(text)) return;

            const dInfo = extractDateFromLine(text);
            if (!attendanceDate && dInfo && text.length < 30) {
              attendanceDate = dInfo.rawDate;
            } else if (!attendanceStatus && /\b(scheduled|rescheduled|re-scheduled|resched|schedule\s*change|attended|confirmed|cancell?ed|no[-\s]?show|noshow|ns|registered|enrolled|waitlist(ed)?|wait[-\s]?list|completed|invited|declined|tentative|pending|standby|present|did not attend|absent)\b/i.test(text)) {
              attendanceStatus = text;
            } else if (!seminarTitle && text.length > 4) {
              const isStatusWord = /\b(scheduled|rescheduled|confirmed|cancell?ed|no[-\s]?show|attended|completed|waitlist|registered)\b/i.test(text);
              if (!isStatusWord && !/^\d+$/.test(text) && !/^(yes|no|none)$/i.test(text)) {
                seminarTitle = text;
              }
            }
          });

          if ((attendanceDate || seminarTitle) && (seminarTitle || attendanceStatus || rowEditUrl)) {
            const compoundKey = `${contactName}_${seminarTitle}_${attendanceDate}`;
            if (!results.some(r => r.compoundKey === compoundKey)) {
              results.push({ 
                contactName, 
                contactId, 
                eventTitle: seminarTitle, 
                date: attendanceDate, 
                status: attendanceStatus || 'Scheduled', 
                editUrl: rowEditUrl,
                compoundKey 
              });
            }
          }
        });
      });

      cache.eventAttendance.set(clientId, results);
      return results;
    }

    async function fetchAttendeeRecord(attendee) {
      const attendeeId = attendee.id;
      try {
        const res = await fetch('/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendeeId);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        doc.querySelectorAll('header, nav, [id="ns-header"], [id="recent-records"], [id="header"], .uir-header, [id="div__nav"]').forEach(e => e.remove());
        const mainForm = doc.querySelector('form[name="main_form"], form[id="main_form"], [id="div__body"]') || doc.body;

        let contactId = safeLookupSS1('customrecord56', attendeeId, 'custrecord_crs_attendee_contact') || safeLookupSS1('customrecord_crs_attendee', attendeeId, 'custrecord_crs_attendee_contact');
        if (!contactId) {
          const cf = mainForm.querySelector('[id*="crs_attendee_contact"], [id*="crs_att_contact"], [id*="attendee_contact"]');
          if (cf) {
            const m = ((cf.querySelector('a')?.getAttribute('href') || '') + ' ' + (cf.querySelector('a')?.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) contactId = m[1];
          }
        }
        if (!contactId) {
          const ca = mainForm.querySelector('a[href*="contact.nl?id="], a[onclick*="contact.nl?id="]');
          if (ca) {
            const m = ((ca.getAttribute('href') || '') + ' ' + (ca.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) contactId = m[1];
          }
        }

        let clientInternalId = safeLookupSS1('customrecord56', attendeeId, 'custrecord_crs_attendee_client') || safeLookupSS1('customrecord_crs_attendee', attendeeId, 'custrecord_crs_attendee_client');
        if (!clientInternalId) {
          const clf = mainForm.querySelector('[id*="crs_attendee_client"], [id*="crs_att_client"], [id*="attendee_client"]');
          if (clf) {
            const m = ((clf.querySelector('a')?.getAttribute('href') || '') + ' ' + (clf.querySelector('a')?.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) clientInternalId = m[1];
          }
        }
        if (!clientInternalId) {
          const cla = mainForm.querySelector('a[href*="custjob.nl?id="], a[onclick*="custjob.nl?id="]');
          if (cla) {
            const m = ((cla.getAttribute('href') || '') + ' ' + (cla.getAttribute('onclick') || '')).match(/[?&]id=(\d+)/);
            if (m) clientInternalId = m[1];
          }
        }

        let clientDisplayText = (mainForm.querySelector('[id*="crs_attendee_client"] a, a[href*="custjob.nl"]')?.innerText || '').trim() ||
                                (doc.body.innerText || '').match(/CLIENT\s*[*]*\s*([0-9]+\s+[^\n\r]+)/i)?.[1]?.trim() || attendee.fullName.split(':')[0].trim();
        if (!clientInternalId && clientDisplayText) {
          const m = clientDisplayText.match(/^(\d+)/);
          if (m) clientInternalId = m[1];
        }

        activeClientName = clientDisplayText;
        const clientEntityId = clientDisplayText.match(/^(\d+)/)?.[1] || 'N/A';
        const positionText = getNetSuiteViewField(doc, 'custrecord_crs_att_position', ['Position', 'Position/Post']) || '-';

        document.getElementById('ns-insp-full-client').textContent = clientDisplayText;

        const btnClient = document.getElementById('ns-insp-btn-client');
        if (clientInternalId) {
          activeClientInternalId = clientInternalId;
          btnClient.href = toAbsoluteNsUrl('/app/common/entity/custjob.nl?id=' + clientInternalId);
          btnClient.textContent = `Open Client (${clientEntityId}) [id=${clientInternalId}]`;
          btnClient.style.pointerEvents = 'auto';
          btnClient.style.opacity = '1';
          document.getElementById('ns-insp-btn-save-note').disabled = false;
        } else {
          btnClient.style.pointerEvents = 'none';
          btnClient.style.opacity = '0.35';
        }

        if (contactId) {
          activeContactId = contactId;
          activePdfUrl = toAbsoluteNsUrl('/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + contactId);

          const btnContact = document.getElementById('ns-insp-btn-contact');
          btnContact.href = toAbsoluteNsUrl('/app/common/entity/contact.nl?id=' + contactId);
          btnContact.style.pointerEvents = 'auto';
          btnContact.style.opacity = '1';

          document.getElementById('ns-insp-btn-pdf').disabled = false;

          getContactData(contactId).then(cData => {
            activeContactName = cData.name || attendee.attendeeName;
            const finalPosition = cData.position || positionText;
            document.getElementById('ns-insp-contact-name').textContent = activeContactName;
            document.getElementById('ns-insp-position').textContent = finalPosition;
            document.getElementById('ns-insp-contact-phone').innerHTML = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';

            if (cData.email) {
              const rawSched = document.getElementById('ns-insp-sched-day')?.innerText.trim() || 'Scheduled Dates';
              const isDoctor = (finalPosition || '').toLowerCase().includes('doctor');
              const greetingName = isDoctor && !/^dr\./i.test(activeContactName) ? `Dr. ${activeContactName}` : activeContactName;
              const subject = encodeURIComponent('Checking In: Travel Plans for MGE Course Sessions');
              const body = encodeURIComponent(`Hello ${greetingName},\n\nI hope you're doing well.\n\nI have you scheduled for the course room on the following dates:\n\n${rawSched}\n\nI wanted to check in and see if you've been able to make your flight and hotel reservations yet. Please let me know if you need any assistance with your travel plans.\n\nI look forward to hearing from you.`);
              document.getElementById('ns-insp-contact-email').innerHTML = `<a href="mailto:${cData.email.trim()}?subject=${subject}&body=${body}">${cData.email}</a>`;
            } else {
              document.getElementById('ns-insp-contact-email').innerHTML = '-';
            }

            document.getElementById('ns-insp-contact-comments').textContent = cData.comments;
            updatePdfPiPIfOpen(activePdfUrl, activeContactName);
          });
        } else {
          activeContactName = attendee.attendeeName;
          document.getElementById('ns-insp-contact-name').textContent = activeContactName;
          document.getElementById('ns-insp-position').textContent = positionText;
          document.getElementById('ns-insp-contact-phone').textContent = '-';
          document.getElementById('ns-insp-contact-email').innerHTML = '-';
          document.getElementById('ns-insp-contact-comments').textContent = 'None recorded';
          const btnContact = document.getElementById('ns-insp-btn-contact');
          btnContact.style.pointerEvents = 'none';
          btnContact.style.opacity = '0.35';
          document.getElementById('ns-insp-btn-pdf').disabled = true;
          updatePdfPiPIfOpen('', activeContactName);
        }

        if (clientInternalId) {
          getClientData(clientInternalId, clientDisplayText).then(clientData => {
            document.getElementById('ns-insp-work-phone').innerHTML = clientData.workPhone ? `<a href="tel:${clientData.workPhone}">${clientData.workPhone}</a>` : '-';
            document.getElementById('ns-insp-email').innerHTML = clientData.email ? `<a href="mailto:${clientData.email}">${clientData.email}</a>` : '-';
            document.getElementById('ns-insp-comments').textContent = clientData.comments || 'None recorded';

            const formatContact = (name, phone) => (name && phone ? `${name}: <a href="tel:${phone}">${phone}</a>` : phone ? `<a href="tel:${phone}">${phone}</a>` : name || '-');
            document.getElementById('ns-insp-cell-1').innerHTML = formatContact(clientData.cell1Name, clientData.cell1Phone);
            document.getElementById('ns-insp-cell-2').innerHTML = formatContact(clientData.cell2Name, clientData.cell2Phone);

            const notesListEl = document.getElementById('ns-insp-notes-list');
            if (clientData.notes && clientData.notes.length > 0) {
              document.getElementById('ns-insp-notes-count').textContent = clientData.notes.length + ' note(s)';
              notesListEl.innerHTML = clientData.notes.map(n => `<div class="note-item"><div class="note-header"><span class="note-author">${n.author || 'NetSuite User'}</span><span>${n.date}</span></div><div class="note-body">${n.memo}</div></div>`).join('');
            } else {
              document.getElementById('ns-insp-notes-count').textContent = '0 notes';
              notesListEl.innerHTML = '<div style="color:rgb(161, 161, 170);">No user notes recorded on client.</div>';
            }
            document.getElementById('ns-insp-client-fetch-status').textContent = 'Resolved';
            document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(52, 211, 153)';
          });

          getAllAttendance(clientInternalId).then(allAttendance => {
            const openBoardInfo = getOpenBoardDateInfo();

            const rawMatches = allAttendance.filter(item => {
              const isThisContact = (contactId && item.contactId === contactId) ||
                (attendee.attendeeName && item.contactName.toLowerCase().includes(attendee.attendeeName.toLowerCase()));
              if (!isThisContact) return false;
              if (item.status && /cancel/i.test(item.status)) return false;
              return isEventInOpenWeeks(item, openBoardInfo);
            });

            const matches = [];
            rawMatches.forEach(m => {
              const k = `${m.contactName}_${m.eventTitle}_${m.date}`;
              if (!matches.some(x => `${x.contactName}_${x.eventTitle}_${x.date}` === k)) {
                matches.push(m);
              }
            });

            const eventBox = document.getElementById('ns-insp-linked-event-box');
            const eventItems = document.getElementById('ns-insp-linked-event-items');

            if (matches.length > 0) {
              seminarPill.style.display = 'inline-block';
              seminarPill.textContent = `📅 Seminar Found (${matches.length}) ↗`;
              cachedMatchingSeminars = {
                list: matches,
                title: matches[0].eventTitle || 'Linked Seminar',
                clientName: clientDisplayText,
                dates: matches[0].date || '-'
              };
              renderSeminarInPiP(matches, cachedMatchingSeminars.title, clientDisplayText, cachedMatchingSeminars.dates);

              if (eventBox && eventItems) {
                eventBox.style.display = 'block';
                eventItems.innerHTML = matches.map((m, idx) => {
                  const rawEditTarget = m.editUrl || (m.contactId ? '/app/common/entity/contact.nl?id=' + m.contactId + '&e=T' : '');
                  const fullEditUrl = toAbsoluteNsUrl(rawEditTarget);
                  return `
                    <div style="${idx > 0 ? 'border-top:1px solid rgba(251,191,36,0.2); padding-top:5px;' : ''}">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <span style="font-weight:700; color:#fff; font-size:12px;">${m.eventTitle || 'Linked Seminar'}</span>
                        <div style="display:flex; align-items:center; gap:4px;">
                          ${fullEditUrl ? `<a href="${fullEditUrl}" data-nav-url="${fullEditUrl}" target="_blank" rel="noopener noreferrer" class="pill ns-edit-event-btn" style="cursor:pointer; background:rgba(255, 255, 255, 0.12); color:rgb(244, 244, 245); border-color:rgba(255, 255, 255, 0.35); text-decoration:none;" title="Open Record in Edit Mode">EDIT ↗</a>` : ''}
                          ${getStatusBadge(m.status)}
                        </div>
                      </div>
                      <div style="font-size:11px; color:rgb(251, 191, 36); margin-top:2px;">${m.date || 'This Week'}</div>
                    </div>
                  `;
                }).join('');

                eventItems.querySelectorAll('.ns-edit-event-btn').forEach(btn => {
                  btn.onclick = (e) => {
                    const u = btn.getAttribute('data-nav-url') || btn.getAttribute('href');
                    if (!u || u === 'javascript:void(0)') return;
                    e.preventDefault();
                    e.stopPropagation();
                    try {
                      const rootWin = window.opener || window;
                      rootWin.open(u, '_blank');
                    } catch(err) {
                      window.open(u, '_blank');
                    }
                  };
                });
              }
            } else {
              seminarPill.style.display = 'none';
              cachedMatchingSeminars = null;
              closeSeminarPiP();
              if (eventBox && eventItems) {
                eventBox.style.display = 'none';
                eventItems.innerHTML = '';
              }
            }
          }).catch(() => {
            seminarPill.style.display = 'none';
            cachedMatchingSeminars = null;
            closeSeminarPiP();
            const eventBox = document.getElementById('ns-insp-linked-event-box');
            if (eventBox) eventBox.style.display = 'none';
          });
        } else {
          seminarPill.style.display = 'none';
          cachedMatchingSeminars = null;
          closeSeminarPiP();
          const eventBox = document.getElementById('ns-insp-linked-event-box');
          if (eventBox) eventBox.style.display = 'none';
        }
      } catch (err) {
        console.error('Attendee resolution error:', err);
      }
    }

    function selectAttendee(attendee) {
      activeAttendeeId = attendee.id;
      activeClientInternalId = null;
      activeClientName = '';
      activeContactId = null;
      activeContactName = '';
      activePdfUrl = '';
      cachedMatchingSeminars = null;

      highlightBoardElement(attendee.element);

      setPdfPiPLoading(attendee.attendeeName);
      closeSeminarPiP();
      seminarPill.style.display = 'none';

      const eventBox = document.getElementById('ns-insp-linked-event-box');
      const eventItems = document.getElementById('ns-insp-linked-event-items');
      if (eventBox) eventBox.style.display = 'none';
      if (eventItems) eventItems.innerHTML = '';

      document.getElementById('ns-insp-contact-name').textContent = attendee.attendeeName || 'Loading...';
      document.getElementById('ns-insp-position').textContent = '...';
      document.getElementById('ns-insp-contact-phone').textContent = '...';
      document.getElementById('ns-insp-contact-email').innerHTML = '...';
      document.getElementById('ns-insp-contact-comments').textContent = '...';

      document.getElementById('ns-insp-sched-day').innerHTML = getAttendeeDates(attendee.element);
      document.getElementById('ns-insp-pill-id').textContent = 'Attendee ID: ' + attendee.id;

      document.getElementById('ns-insp-full-client').textContent = 'Loading...';
      document.getElementById('ns-insp-work-phone').textContent = '...';
      document.getElementById('ns-insp-email').innerHTML = '...';
      document.getElementById('ns-insp-cell-1').textContent = '...';
      document.getElementById('ns-insp-cell-2').textContent = '...';
      document.getElementById('ns-insp-comments').textContent = '...';
      document.getElementById('ns-insp-client-fetch-status').textContent = 'Fetching...';

      document.getElementById('ns-insp-notes-count').textContent = '-';
      document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Loading notes...</div>';
      document.getElementById('ns-insp-new-note').value = '';
      document.getElementById('ns-insp-save-status').textContent = '';
      document.getElementById('ns-insp-btn-save-note').disabled = true;
      document.getElementById('ns-insp-btn-pdf').disabled = true;

      const btnAttendee = document.getElementById('ns-insp-btn-attendee');
      btnAttendee.href = toAbsoluteNsUrl('/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendee.id + '&e=T');
      btnAttendee.style.pointerEvents = 'auto';
      btnAttendee.style.opacity = '1';

      const btnContact = document.getElementById('ns-insp-btn-contact');
      btnContact.style.pointerEvents = 'none';
      btnContact.style.opacity = '0.35';

      fetchAttendeeRecord(attendee);
    }

    /* Multi-Strategy Client & Contact Resolver with Colon Extraction */
    async function resolveEventClientAndContact(eventTarget, clickedCell, tr) {
      let detectedContactId = null;
      let clientInternalId = null;
      let clientDisplayText = '';

      const contactLink = eventTarget.closest('a[href*="contact.nl?id="]') || 
                          clickedCell.querySelector('a[href*="contact.nl?id="]') || 
                          (tr ? tr.querySelector('a[href*="contact.nl?id="]') : null);
      if (contactLink) {
        detectedContactId = contactLink.getAttribute('href')?.match(/[?&]id=(\d+)/)?.[1] || null;
      }

      const candidates = [clickedCell, eventTarget, tr].filter(Boolean);
      for (const el of candidates) {
        const cId = el.getAttribute('data-contactid') || el.dataset?.contactid;
        if (cId && /^\d+$/.test(cId) && !detectedContactId) detectedContactId = cId;

        const id = el.getAttribute('data-clientid') || el.getAttribute('data-customerid') || el.dataset?.clientid || el.dataset?.customerid;
        if (id && /^\d+$/.test(id) && !clientInternalId) clientInternalId = id;
      }

      if (!clientInternalId && tr) {
        const clientLink = tr.querySelector('a[href*="custjob.nl?id="], a[href*="customer.nl?id="], a[href*="company.nl?id="]');
        if (clientLink) {
          clientInternalId = clientLink.getAttribute('href')?.match(/[?&]id=(\d+)/)?.[1] || null;
          clientDisplayText = (clientLink.innerText || clientLink.textContent || '').trim();
        }
      }

      if (!clientInternalId && tr) {
        const clientCell = tr.querySelector('td.clientRecord, [data-clientid], [data-customerid]');
        if (clientCell) {
          const id = clientCell.getAttribute('data-clientid') || clientCell.getAttribute('data-customerid') || clientCell.dataset?.clientid || clientCell.dataset?.customerid;
          if (id && /^\d+$/.test(id)) clientInternalId = id;
          if (!clientDisplayText) clientDisplayText = (clientCell.innerText || clientCell.textContent || '').trim();
        }
      }

      if (!clientInternalId && tr) {
        const html = tr.outerHTML || '';
        const m = html.match(/(?:custjob\.nl|customer\.nl)\?[^"']*id=(\d+)/i) || html.match(/(?:customer|custjob|client)[^0-9]*(\d{4,})/i);
        if (m) clientInternalId = m[1];
      }

      if (!clientInternalId && tr) {
        let prev = tr.previousElementSibling;
        while (prev && !isSeminarHeader(prev)) {
          const id = prev.getAttribute('data-clientid') || prev.getAttribute('data-customerid') || prev.dataset?.clientid || prev.dataset?.customerid;
          if (id && /^\d+$/.test(id)) { clientInternalId = id; break; }
          const link = prev.querySelector('a[href*="custjob.nl?id="], a[href*="customer.nl?id="]');
          if (link) {
            const m = link.getAttribute('href')?.match(/[?&]id=(\d+)/);
            if (m) { clientInternalId = m[1]; break; }
          }
          prev = prev.previousElementSibling;
        }
      }

      if (!clientInternalId && detectedContactId) {
        try {
          const cData = await getContactData(detectedContactId);
          if (cData && cData.companyId) {
            clientInternalId = cData.companyId;
          }
        } catch (e) {}
      }

      if (!clientInternalId && clientDisplayText) {
        const m = clientDisplayText.match(/^(\d{3,})/);
        if (m) clientInternalId = m[1];
      }

      return { clientInternalId, detectedContactId, clientDisplayText };
    }

    async function selectEventAttendee(eventTarget) {
      const clickedCell = eventTarget.closest('td, th, [data-clientid], [data-customerid]') || eventTarget;
      const tr = clickedCell.closest('tr');

      highlightBoardElement(eventTarget);

      const nameEl = clickedCell.querySelector('.attendeeName') || clickedCell.closest('.attendeeName') || clickedCell;
      let rawText = '';
      if (nameEl) {
        const clone = nameEl.cloneNode(true);
        clone.querySelectorAll('.attendeeCount, i, span, svg').forEach(s => s.remove());
        rawText = (clone.innerText || clone.textContent || '').trim().replace(/\s+/g, ' ');
      }
      if (!rawText) rawText = (clickedCell.innerText || clickedCell.textContent || '').trim();

      // Cleanly separate Client Name and Attendee Name across colon format
      let clientParsedName = '';
      let attendeeParsedName = rawText.replace(/\(\d+\)/g, '').trim();
      if (rawText.includes(':')) {
        const parts = rawText.split(':');
        clientParsedName = parts[0].trim();
        attendeeParsedName = parts.slice(1).join(':').replace(/\(\d+\)/g, '').trim();
      }

      const schedDatesHtml = getAttendeeDates(tr || clickedCell);
      const boardEvent = findBoardEvent(clickedCell);
      const eventDisplayHeader = boardEvent ? boardEvent.rawText : (rawText + ' Seminar');

      const isNoShow = !!(clickedCell.querySelector('.isNoShow') || /\bstatus(noshow|no-show|ns)\b/i.test(clickedCell.className) || /\bno[-\s]?show\b/i.test(clickedCell.innerText || ''));
      const isResched = !!(clickedCell.querySelector('.isResched') || /\bstatus(resched|rsch)\b/i.test(clickedCell.className) || /\bre[-\s]?sched(ule|uled)?\b/i.test(clickedCell.innerText || ''));
      const isCancel = !!(clickedCell.querySelector('.isCancel') || /\bstatus(cancel|cxl)\b/i.test(clickedCell.className) || /\bcancell?ed\b/i.test(clickedCell.innerText || ''));
      const isConf = !!(clickedCell.querySelector('.isConfirmed') || clickedCell.classList.contains('statusConf'));
      const isSchd = !!(clickedCell.classList.contains('statusSchd'));
      
      let fallbackStatus = '';
      if (isNoShow) fallbackStatus = 'No Show';
      else if (isResched) fallbackStatus = 'Rescheduled';
      else if (isCancel) fallbackStatus = 'Cancelled';
      else if (isConf) fallbackStatus = 'Confirmed';
      else if (isSchd) fallbackStatus = 'Scheduled';

      activeAttendeeId = null;
      activeContactId = null;
      activeContactName = attendeeParsedName || rawText;
      activePdfUrl = '';
      cachedMatchingSeminars = null;

      setPdfPiPLoading(attendeeParsedName);

      const eventBox = document.getElementById('ns-insp-linked-event-box');
      if (eventBox) eventBox.style.display = 'none';

      document.getElementById('ns-insp-contact-name').textContent = attendeeParsedName || 'Event Attendee';
      document.getElementById('ns-insp-position').textContent = 'Seminar Participant';
      document.getElementById('ns-insp-contact-phone').innerHTML = '...';
      document.getElementById('ns-insp-contact-email').innerHTML = '...';
      document.getElementById('ns-insp-contact-comments').textContent = 'Querying attendee file...';

      const dateBlock = (boardEvent && boardEvent.dateStr) ? `<div>${boardEvent.dateStr}</div>` : schedDatesHtml;
      document.getElementById('ns-insp-sched-day').innerHTML = `${dateBlock}${fallbackStatus ? `<div style="margin-top:4px;">${getStatusBadge(fallbackStatus)}</div>` : ''}`;

      document.getElementById('ns-insp-full-client').textContent = clientParsedName || 'Resolving client...';
      document.getElementById('ns-insp-work-phone').innerHTML = '...';
      document.getElementById('ns-insp-email').innerHTML = '...';
      document.getElementById('ns-insp-cell-1').innerHTML = '...';
      document.getElementById('ns-insp-cell-2').innerHTML = '...';
      document.getElementById('ns-insp-comments').textContent = '...';
      document.getElementById('ns-insp-client-fetch-status').textContent = 'Fetching...';
      document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(161, 161, 170)';

      document.getElementById('ns-insp-notes-count').textContent = '-';
      document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Loading notes...</div>';

      const win = await getSeminarPiPWindow();
      if (win) {
        const d = win.document;
        d.getElementById('pip-event-title').textContent = eventDisplayHeader;
        d.getElementById('pip-event-client').textContent = 'Client: ' + (clientParsedName || rawText);
        d.getElementById('pip-event-dates').innerHTML = dateBlock;
        d.getElementById('pip-contacts-count').textContent = 'Querying...';
        d.getElementById('pip-event-contacts-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Querying records...</div>';
      }

      let { clientInternalId, detectedContactId, clientDisplayText } = await resolveEventClientAndContact(eventTarget, clickedCell, tr);
      activeClientInternalId = clientInternalId;
      activeClientName = clientDisplayText || clientParsedName || rawText;
      document.getElementById('ns-insp-pill-id').textContent = clientInternalId ? ('Client ID: ' + clientInternalId) : 'Event Mode';

      function applyContactToUi(cId, cData) {
        activeContactId = cId;
        activeContactName = cData.name || attendeeParsedName;
        document.getElementById('ns-insp-contact-name').textContent = activeContactName;
        document.getElementById('ns-insp-position').textContent = cData.position || 'Seminar Participant';
        document.getElementById('ns-insp-contact-phone').innerHTML = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';
        document.getElementById('ns-insp-contact-comments').textContent = cData.comments || 'None recorded';

        if (cData.email) {
          const rawSched = document.getElementById('ns-insp-sched-day')?.innerText.trim() || 'Scheduled Dates';
          const isDoctor = (cData.position || '').toLowerCase().includes('doctor');
          const greetingName = isDoctor && !/^dr\./i.test(activeContactName) ? `Dr. ${activeContactName}` : activeContactName;
          const subject = encodeURIComponent('Checking In: Travel Plans for MGE Course Sessions');
          const body = encodeURIComponent(`Hello ${greetingName},\n\nI hope you're doing well.\n\nI have you scheduled for the course room on the following dates:\n\n${rawSched}\n\nI wanted to check in and see if you've been able to make your flight and hotel reservations yet. Please let me know if you need any assistance with your travel plans.\n\nI look forward to hearing from you.`);
          document.getElementById('ns-insp-contact-email').innerHTML = `<a href="mailto:${cData.email.trim()}?subject=${subject}&body=${body}">${cData.email}</a>`;
        } else {
          document.getElementById('ns-insp-contact-email').innerHTML = '-';
        }

        const btnContact = document.getElementById('ns-insp-btn-contact');
        btnContact.href = toAbsoluteNsUrl('/app/common/entity/contact.nl?id=' + cId);
        btnContact.style.pointerEvents = 'auto';
        btnContact.style.opacity = '1';

        activePdfUrl = toAbsoluteNsUrl('/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + cId);
        document.getElementById('ns-insp-btn-pdf').disabled = false;
        updatePdfPiPIfOpen(activePdfUrl, activeContactName);
      }

      if (detectedContactId) {
        getContactData(detectedContactId).then(cData => applyContactToUi(detectedContactId, cData));
      }

      const btnClient = document.getElementById('ns-insp-btn-client');
      if (clientInternalId) {
        btnClient.href = toAbsoluteNsUrl('/app/common/entity/custjob.nl?id=' + clientInternalId);
        btnClient.textContent = `Open Master Client File [id=${clientInternalId}]`;
        btnClient.style.pointerEvents = 'auto';
        btnClient.style.opacity = '1';
        document.getElementById('ns-insp-btn-save-note').disabled = false;

        const capturedId = clientInternalId;
        getClientData(capturedId, clientDisplayText || clientParsedName || rawText).then(clientData => {
          if (activeClientInternalId !== capturedId) return;

          document.getElementById('ns-insp-full-client').textContent = clientData.companyName || clientParsedName || rawText;
          document.getElementById('ns-insp-work-phone').innerHTML = clientData.workPhone ? `<a href="tel:${clientData.workPhone}">${clientData.workPhone}</a>` : '-';
          document.getElementById('ns-insp-email').innerHTML = clientData.email ? `<a href="mailto:${clientData.email}">${clientData.email}</a>` : '-';
          document.getElementById('ns-insp-comments').textContent = clientData.comments || 'None recorded';

          const formatContact = (name, phone) => (name && phone ? `${name}: <a href="tel:${phone}">${phone}</a>` : phone ? `<a href="tel:${phone}">${phone}</a>` : name || '-');
          document.getElementById('ns-insp-cell-1').innerHTML = formatContact(clientData.cell1Name, clientData.cell1Phone);
          document.getElementById('ns-insp-cell-2').innerHTML = formatContact(clientData.cell2Name, clientData.cell2Phone);

          const notesListEl = document.getElementById('ns-insp-notes-list');
          if (clientData.notes && clientData.notes.length > 0) {
            document.getElementById('ns-insp-notes-count').textContent = clientData.notes.length + ' note(s)';
            notesListEl.innerHTML = clientData.notes.map(n => `<div class="note-item"><div class="note-header"><span class="note-author">${n.author || 'NetSuite User'}</span><span>${n.date}</span></div><div class="note-body">${n.memo}</div></div>`).join('');
          } else {
            document.getElementById('ns-insp-notes-count').textContent = '0 notes';
            notesListEl.innerHTML = '<div style="color:rgb(161, 161, 170);">No user notes recorded.</div>';
          }
          document.getElementById('ns-insp-client-fetch-status').textContent = 'Resolved';
          document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(52, 211, 153)';

          if (!activeContactId && attendeeParsedName) {
            getAllClientContacts(capturedId).then(allContacts => {
              if (activeContactId) return;
              const found = allContacts.find(c => 
                c.name.toLowerCase().includes(attendeeParsedName.toLowerCase()) ||
                attendeeParsedName.toLowerCase().includes(c.name.toLowerCase())
              );
              if (found) {
                detectedContactId = found.id;
                getContactData(found.id).then(cData => applyContactToUi(found.id, cData));
              }
            });
          }
        }).catch(() => {
          if (activeClientInternalId === capturedId) {
            document.getElementById('ns-insp-client-fetch-status').textContent = 'Error';
            document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(248, 113, 113)';
          }
        });

        getAllAttendance(capturedId).then(allAttendance => {
          if (activeClientInternalId !== capturedId) return;

          const displayAttendance = (boardEvent && allAttendance.length > 0)
            ? allAttendance.filter(item => {
                const itemDate = normalizeDate(item.date);
                const validDates = boardEvent.allNormDates || [];
                const sig = getCanonicalKey(item.eventTitle, item.date);

                const isTitleMatch = Boolean(boardEvent.coreName && sig.coreName &&
                  (boardEvent.coreName.includes(sig.coreName) || sig.coreName.includes(boardEvent.coreName)));
                const isDateMatch = Boolean(itemDate && validDates.includes(itemDate));

                return isTitleMatch || isDateMatch;
              })
            : allAttendance;

          if (displayAttendance.length === 0 && attendeeParsedName) {
            displayAttendance.push({
              contactName: attendeeParsedName,
              contactId: detectedContactId || '',
              eventTitle: eventDisplayHeader,
              date: (boardEvent && boardEvent.dateStr) ? boardEvent.dateStr : 'This Week',
              status: fallbackStatus || 'Scheduled',
              editUrl: detectedContactId ? `/app/common/entity/contact.nl?id=${detectedContactId}&e=T` : ''
            });
          }

          cachedMatchingSeminars = {
            list: displayAttendance,
            title: eventDisplayHeader,
            clientName: clientParsedName || rawText,
            dates: dateBlock
          };
          renderSeminarInPiP(displayAttendance, eventDisplayHeader, clientParsedName || rawText, dateBlock);

          let targetContact = null;
          if (attendeeParsedName && displayAttendance.length > 0) {
            targetContact = displayAttendance.find(i => 
              i.contactName.toLowerCase().includes(attendeeParsedName.toLowerCase()) ||
              attendeeParsedName.toLowerCase().includes(i.contactName.toLowerCase())
            );
          }
          if (!targetContact && displayAttendance.length > 0) {
            targetContact = displayAttendance[0];
          }

          if (targetContact && targetContact.contactId) {
            getContactData(targetContact.contactId).then(cData => applyContactToUi(targetContact.contactId, cData));
          } else if (targetContact) {
            document.getElementById('ns-insp-contact-name').textContent = targetContact.contactName;
          }
        });
      } else {
        document.getElementById('ns-insp-full-client').textContent = clientParsedName || rawText || 'Client ID not detected';
        document.getElementById('ns-insp-client-fetch-status').textContent = 'Not Found';
        document.getElementById('ns-insp-client-fetch-status').style.color = 'rgb(251, 191, 36)';
        document.getElementById('ns-insp-notes-list').innerHTML = '<div style="color:rgb(161, 161, 170);">Click attendee or client link directly to load client notes.</div>';
        btnClient.style.pointerEvents = 'none';
        btnClient.style.opacity = '0.35';
        document.getElementById('ns-insp-btn-save-note').disabled = true;

        if (attendeeParsedName) {
          const singleFallback = [{
            contactName: attendeeParsedName,
            contactId: detectedContactId || '',
            eventTitle: eventDisplayHeader,
            date: (boardEvent && boardEvent.dateStr) ? boardEvent.dateStr : 'This Week',
            status: fallbackStatus || 'Scheduled',
            editUrl: detectedContactId ? `/app/common/entity/contact.nl?id=${detectedContactId}&e=T` : ''
          }];
          renderSeminarInPiP(singleFallback, eventDisplayHeader, clientParsedName || rawText, dateBlock);
        }
      }
    }

    document.getElementById('ns-insp-btn-pdf').onclick = openPdfPiP;

    document.getElementById('ns-insp-btn-save-note').onclick = async () => {
      const inp = document.getElementById('ns-insp-new-note');
      const st = document.getElementById('ns-insp-save-status');
      const btn = document.getElementById('ns-insp-btn-save-note');
      const val = inp.value.trim();
      if (!val || !activeClientInternalId) return;

      btn.disabled = true;
      st.textContent = 'Saving...';
      st.style.color = 'rgb(56, 189, 248)';

      try {
        const u = '/app/crm/common/note.nl?l=T&entity=' + activeClientInternalId;
        const res = await fetch(u);
        const form = new DOMParser().parseFromString(await res.text(), 'text/html').querySelector('form[name="main_form"], form[id="main_form"]');
        const fd = new FormData();
        form.querySelectorAll('input').forEach(i => { if (i.name && i.value !== undefined) fd.set(i.name, i.value); });
        fd.set('entity', activeClientInternalId);
        fd.set('note', val);
        await fetch(form.action || u, { method: 'POST', body: fd });

        const itemHtml = `<div class="note-item" style="border-left-color:rgb(56,189,248);"><div class="note-header"><span class="note-author">You</span><span>Just now</span></div><div class="note-body">${val}</div></div>`;
        const list = document.getElementById('ns-insp-notes-list');
        if (list.innerText.includes('No user notes') || list.innerText.includes('Loading') || list.innerText.includes('Waiting') || list.innerText.includes('Click attendee')) list.innerHTML = itemHtml;
        else list.insertAdjacentHTML('afterbegin', itemHtml);

        cache.clients.delete(activeClientInternalId);
        inp.value = '';
        st.textContent = 'Saved!';
        st.style.color = 'rgb(52, 211, 153)';
        setTimeout(() => { st.textContent = ''; btn.disabled = false; }, 3000);
      } catch (err) {
        st.textContent = 'Failed to save';
        st.style.color = 'rgb(248, 113, 113)';
        btn.disabled = false;
      }
    };

    const searchInp = document.getElementById('ns-insp-search');
    const searchDrop = document.getElementById('ns-insp-dropdown');

    searchInp.oninput = () => {
      const val = searchInp.value.trim().toLowerCase();
      if (!val) { searchDrop.style.display = 'none'; searchDrop.innerHTML = ''; return; }
      const doc = window.opener?.document;
      if (!doc) return;

      const items = Array.from(doc.querySelectorAll('[data-courseattendeeid]'))
        .filter(el => (el.innerText || el.textContent || '').trim().length > 0)
        .map(el => {
          const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
          const parts = t.split(':');
          return { id: el.dataset.courseattendeeid, fullName: t, attendeeName: parts.length > 1 ? parts.slice(1).join(':').trim() : t, element: el };
        })
        .filter(x => x.fullName.toLowerCase().includes(val) || x.id.includes(val));

      if (!items.length) {
        searchDrop.style.display = 'block';
        searchDrop.innerHTML = '<div style="padding:7px 12px; color:rgb(161,161,170); font-size:11px;">No matches found</div>';
        return;
      }
      searchDrop.style.display = 'block';
      searchDrop.innerHTML = items.slice(0, 12).map(x => `<div class="search-item" data-id="${x.id}"><strong>${x.fullName}</strong></div>`).join('');
    };

    searchDrop.onclick = (e) => {
      const itemEl = e.target.closest('.search-item');
      if (!itemEl) return;
      const doc = window.opener?.document;
      const el = doc?.querySelector(`[data-courseattendeeid="${itemEl.dataset.id}"]`);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        const parts = text.split(':');
        selectAttendee({ id: el.dataset.courseattendeeid, element: el, fullName: text, attendeeName: parts.length > 1 ? parts.slice(1).join(':').trim() : text });
        searchDrop.style.display = 'none';
        searchInp.value = text;
      }
    };

    function onBoardClick(e) {
      const courseTarget = e.target.closest('[data-courseattendeeid]');
      if (courseTarget) {
        const text = (courseTarget.innerText || courseTarget.textContent || '').trim().replace(/\s+/g, ' ');
        const parts = text.split(':');
        selectAttendee({
          id: courseTarget.dataset.courseattendeeid,
          element: courseTarget,
          fullName: text,
          attendeeName: parts.length > 1 ? parts.slice(1).join(':').trim() : text
        });
        return;
      }

      const clientCell = e.target.closest('[data-clientid], [data-customerid], td.clientRecord');
      const attendeeNameEl = e.target.closest('.attendeeName, .attendeeNameWrap, [class*="attendee"]');
      const contactLinkEl = e.target.closest('a[href*="contact.nl?id="], a[href*="/entity/contact.nl?id="]');
      const eventRecordCell = e.target.closest('.eventRecord');
      const tdCell = e.target.closest('td, th');

      const isInEventSection = eventRecordCell || (tdCell && findBoardEvent(tdCell));

      if (clientCell || attendeeNameEl || contactLinkEl || isInEventSection) {
        selectEventAttendee(e.target);
      }
    }

    function setBridgeStatus(connected) {
      const badge = document.getElementById('ns-bridge-status');
      if (!badge) return;
      badge.textContent = connected ? '● Connected' : '○ Reconnecting...';
      badge.style.background = connected ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)';
      badge.style.color = connected ? 'rgb(74, 222, 128)' : 'rgb(251, 191, 36)';
      badge.style.borderColor = connected ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)';
    }

    /* Active Delegator Rehook Mechanism (No Reload Required) */
    window.__nsRehookOpener = function(explicitOpener) {
      try {
        if (explicitOpener && !explicitOpener.closed) {
          try { window.opener = explicitOpener; } catch (e) {}
        }
        const oWin = window.opener;
        if (!oWin || oWin.closed) { setBridgeStatus(false); return; }
        const oDoc = oWin.document;
        if (oDoc && oDoc.body) {
          ensureBoardStyles(oDoc);

          oWin.__nsInspectorActiveHandler = onBoardClick;

          if (!oWin.__nsInspectorListenerInstalled) {
            oWin.__nsInspectorListenerInstalled = true;
            oDoc.addEventListener('click', function(e) {
              if (typeof oWin.__nsInspectorActiveHandler === 'function') {
                try {
                  oWin.__nsInspectorActiveHandler(e);
                } catch (err) {
                  oWin.__nsInspectorActiveHandler = null;
                }
              }
            }, true);
          }

          setBridgeStatus(true);
        }
      } catch (err) {
        setBridgeStatus(false);
      }
    };

    setInterval(window.__nsRehookOpener, 500);
    window.__nsRehookOpener();
  }

  const script = doc.createElement('script');
  script.textContent = '(' + runInspectorApp.toString() + ')();';
  doc.head.appendChild(script);
})();