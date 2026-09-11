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
      contactSchedules: new Map(),
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
    let outlookWindow = null;
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

    function areDatesSameWeek(iso1, iso2) {
      if (!iso1 || !iso2) return false;
      const p1 = iso1.split('-').map(Number);
      const p2 = iso2.split('-').map(Number);
      const d1 = new Date(p1[0], p1[1] - 1, p1[2]);
      const d2 = new Date(p2[0], p2[1] - 1, p2[2]);
      if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
      const diffDays = Math.abs((d1 - d2) / (1000 * 60 * 60 * 24));
      if (diffDays > 6) return false;
      const day1 = d1.getDay() === 0 ? 7 : d1.getDay();
      const day2 = d2.getDay() === 0 ? 7 : d2.getDay();
      const mon1 = new Date(d1); mon1.setDate(d1.getDate() - (day1 - 1));
      const mon2 = new Date(d2); mon2.setDate(d2.getDate() - (day2 - 1));
      return mon1.getFullYear() === mon2.getFullYear() &&
             mon1.getMonth() === mon2.getMonth() &&
             mon1.getDate() === mon2.getDate();
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

    /* Text-Only Highlighter Styles */
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

    /* Universal Date Normalizer */
    function normalizeDate(dStr) {
      if (!dStr) return '';
      const s = String(dStr).replace(/\u00a0/g, ' ').trim();
      const now = new Date();
      const refYear = now.getFullYear();
      const refMonth = now.getMonth() + 1;

      // 1. Date Range
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

      // 2. ISO format
      const isoM = s.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
      if (isoM) {
        return `${isoM[1]}-${String(isoM[2]).padStart(2, '0')}-${String(isoM[3]).padStart(2, '0')}`;
      }

      // 3. DD-Mon-YYYY
      const monthsMap = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06', jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
      const ddmmyyyy = s.match(/\b(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-\d{2,4}\b/i);
      if (ddmmyyyy) {
        let yr = ddmmyyyy[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${monthsMap[ddmmyyyy[2].toLowerCase()] || '01'}-${String(ddmmyyyy[1]).padStart(2, '0')}`;
      }

      // 4. Month DD, YYYY
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

      // 5. Slash with year
      const slashWithYear = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
      if (slashWithYear) {
        const m = parseInt(slashWithYear[1], 10);
        const d = parseInt(slashWithYear[2], 10);
        let yr = slashWithYear[3];
        if (yr.length === 2) yr = '20' + yr;
        return `${yr}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }

      // 6. Slash without year
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

    /* Extract Attendee Status from a fetched NetSuite record page (edit OR view mode) */
    function extractAttendeeStatus(doc) {
      const VALID = ['Scheduled', 'Confirmed', 'Schedule Change', 'No Show'];
      const STATUS_MAP = { '1': 'Scheduled', '2': 'Confirmed', '4': 'No Show', '5': 'Schedule Change' };

      // --- EDIT MODE: hidden numeric input (most reliable when present) ---
      const hddn = Array.from(doc.querySelectorAll('input[id^="hddn_custrecord_crs_attendee_status"]'))
                        .find(el => !el.id.includes('orig') && !el.id.includes('req') && !el.id.includes('changed'));
      if (hddn && hddn.value && STATUS_MAP[hddn.value.trim()]) return STATUS_MAP[hddn.value.trim()];

      // --- EDIT MODE: visible text input ---
      const inpt = doc.querySelector('input[name="inpt_custrecord_crs_attendee_status"]');
      if (inpt && VALID.includes(inpt.value.trim())) return inpt.value.trim();

      // --- EDIT MODE: select element ---
      const sel = doc.querySelector('select[name="custrecord_crs_attendee_status"]');
      if (sel && sel.selectedIndex >= 0) {
        const selText = sel.options[sel.selectedIndex]?.text?.trim();
        if (VALID.includes(selText)) return selText;
      }

      // --- VIEW MODE: span with _val id ---
      const valSpan = doc.querySelector('[id$="custrecord_crs_attendee_status_val"]');
      if (valSpan) {
        const t = (valSpan.innerText || valSpan.textContent || '').trim();
        if (VALID.includes(t)) return t;
      }

      // --- VIEW MODE: find "Status" label cell and read its sibling value cell ---
      // NetSuite renders view-mode fields as <td class="labelcell">Status</td><td class="datacell">Confirmed</td>
      const allTds = Array.from(doc.querySelectorAll('td'));
      for (const td of allTds) {
        const label = (td.innerText || td.textContent || '').replace(/\s+/g, ' ').trim();
        if (/^Status$/i.test(label)) {
          const sibling = td.nextElementSibling;
          if (sibling) {
            const val = (sibling.innerText || sibling.textContent || '').replace(/\s+/g, ' ').trim();
            if (VALID.includes(val)) return val;
          }
        }
      }

      return '';
    }

    /* Extract Date Substring and ISO from Line */
    function extractDateFromLine(line) {

      if (!line) return null;

      const rangeM = line.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*(?:-|to|–)\s*\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/i);
      if (rangeM) {
        const iso = normalizeDate(rangeM[0]);
        if (iso) return { rawDate: rangeM[0], iso };
      }

      const isoM = line.match(/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/);
      if (isoM) {
        const iso = normalizeDate(isoM[0]);
        if (iso) return { rawDate: isoM[0], iso };
      }

      const ddmonM = line.match(/\b\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*-\d{2,4}\b/i);
      if (ddmonM) {
        const iso = normalizeDate(ddmonM[0]);
        if (iso) return { rawDate: ddmonM[0], iso };
      }

      const monNameM = line.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*(\d{2,4}))?\b/i);
      if (monNameM) {
        const iso = normalizeDate(monNameM[0]);
        if (iso) return { rawDate: monNameM[0], iso };
      }

      const slashYrM = line.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
      if (slashYrM) {
        const iso = normalizeDate(slashYrM[0]);
        if (iso) return { rawDate: slashYrM[0], iso };
      }

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

    /* Comprehensive Contact Page Attendance/Scheduling (custom26) Machine Parser */
    async function getContactSchedulingRecords(contactId) {
      if (!contactId) return [];
      if (cache.contactSchedules.has(contactId)) {
        return cache.contactSchedules.get(contactId);
      }

      try {
        const mainUrl = `/app/common/entity/contact.nl?id=${contactId}&selectedtab=custom26`;
        const res = await fetch(mainUrl);
        if (!res.ok) return [];
        const html = await res.text();
        const mainDoc = new DOMParser().parseFromString(html, 'text/html');
        const allDocs = [mainDoc];

        // Fetch submachine tabs if not rendered in primary DOM view
        const extraFetches = [];
        if (!html.includes('rectype=54') && !html.includes('recmachcustrecord_mge_event_contact')) {
          extraFetches.push(
            fetch(`/app/common/entity/contact.nl?id=${contactId}&selectedtab=custom26&q=recmachcustrecord_mge_event_contactrange&si=0&f=T&machine=recmachcustrecord_mge_event_contact`).then(r => r.text()).catch(() => '')
          );
        }
        if (!html.includes('rectype=56') && !html.includes('recmachcustrecord_crs_attendee_contact')) {
          extraFetches.push(
            fetch(`/app/common/entity/contact.nl?id=${contactId}&selectedtab=custom26&q=recmachcustrecord_crs_attendee_contactrange&si=0&f=T&machine=recmachcustrecord_crs_attendee_contact`).then(r => r.text()).catch(() => '')
          );
        }

        if (extraFetches.length > 0) {
          const subResults = await Promise.allSettled(extraFetches);
          subResults.forEach(sr => {
            if (sr.status === 'fulfilled' && sr.value && sr.value.length > 200) {
              allDocs.push(new DOMParser().parseFromString(sr.value, 'text/html'));
            }
          });
        }

        const records = [];
        const seenRecords = new Set();

        allDocs.forEach(d => {
          const editAnchors = Array.from(d.querySelectorAll(
            'a.dottedlink[href*="custrecordentry.nl"], a[href*="custrecordentry.nl"], a[onclick*="custrecordentry.nl"]'
          ));

          editAnchors.forEach(a => {
            const row = a.closest('tr');
            if (!row) return;

            const href = a.getAttribute('href') || '';
            const oc = a.getAttribute('onclick') || '';
            const combined = href + ' ' + oc;

            const m = combined.match(/(?:https?:\/\/[^\s'"]+)?(?:\/app\/common\/custom\/|\.\.\/custom\/|custom\/)?(custrecordentry\.nl\?[^'"\s\)]+)/i);
            if (!m) return;

            let editUrl = m[1].replace(/&amp;/g, '&');
            if (!editUrl.startsWith('/app/common/custom/')) editUrl = '/app/common/custom/' + editUrl;
            if (!editUrl.includes('&e=T')) editUrl += '&e=T';

            const rectype = editUrl.match(/[?&]rectype=(\d+)/)?.[1] || '';
            const defaultType = rectype === '56' ? 'Course' : (rectype === '54' ? 'Event' : 'Seminar');

            const cells = Array.from(row.querySelectorAll('td'));
            if (!cells.length) return;

            const VALID_STATUSES = ['Scheduled', 'Confirmed', 'Schedule Change', 'No Show'];
            let status = '';
            for (const c of cells) {
              const t = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
              if (VALID_STATUSES.some(s => s.toLowerCase() === t.toLowerCase())) {
                status = VALID_STATUSES.find(s => s.toLowerCase() === t.toLowerCase());
                break;
              }
            }

            let title = '';
            for (const c of cells) {
              if (c.contains(a)) continue;
              const t = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
              if (t.length > 3 && !extractDateFromLine(t) && !/^(yes|no|none|edit|view)$/i.test(t) && !/\b(confirmed|scheduled|attended|completed|cancell?ed)\b/i.test(t)) {
                title = t;
                break;
              }
            }

            const tbl = row.closest('table');
            const headerRow = tbl ? tbl.querySelector('tr.uir-list-header-tr, tr:has(.listheader), tr:has(th)') : null;
            const attendedDays = [];
            let weekEndingColIdx = -1;

            if (headerRow) {
              Array.from(headerRow.children).forEach((hCell, idx) => {
                const hTxt = (hCell.innerText || hCell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

                // Track Week Ending column index
                if (/week\s*end/i.test(hTxt) && weekEndingColIdx === -1) {
                  weekEndingColIdx = idx;
                }

                // Track checked day columns
                const dm = hTxt.match(/\b(mon|tue|wed|thu|fri|sat)\b/i);
                if (dm && cells[idx]) {
                  const v = (cells[idx].innerText || cells[idx].textContent || '').trim().toLowerCase();
                  if (v === 'yes' || v === 'y' || cells[idx].querySelector('img[src*="check"], input:checked')) {
                    attendedDays.push(dm[1].toLowerCase());
                  }
                }
              });
            }

            // Read Week Ending date: prefer the specific column, fall back to first date found in row
            let rawDate = '';
            if (weekEndingColIdx >= 0 && cells[weekEndingColIdx]) {
              const t = (cells[weekEndingColIdx].innerText || cells[weekEndingColIdx].textContent || '').trim();
              const dM = extractDateFromLine(t);
              if (dM) rawDate = dM.rawDate;
            }
            if (!rawDate) {
              for (const c of cells) {
                const t = (c.innerText || c.textContent || '').trim();
                const dM = extractDateFromLine(t);
                if (dM) { rawDate = dM.rawDate; break; }
              }
            }

            let finalDateStr = rawDate;
            let finalIso = normalizeDate(rawDate);

            if (finalIso && attendedDays.length > 0) {
              // Week Ending is always a Wednesday. Session days are the PRIOR calendar week.
              // Apply fixed backwards offsets from the Week Ending Wednesday.
              const DAY_OFFSETS = { tue: -8, wed: -7, thu: -6, fri: -5, sat: -4 };
              const p = finalIso.split('-').map(Number);
              const weekEndingDt = new Date(p[0], p[1] - 1, p[2]);

              const validDates = attendedDays
                .filter(d => DAY_OFFSETS[d] !== undefined)
                .map(d => {
                  const dt = new Date(weekEndingDt);
                  dt.setDate(weekEndingDt.getDate() + DAY_OFFSETS[d]);
                  return dt;
                })
                .sort((a, b) => a - b);

              if (validDates.length > 0) {
                const first = validDates[0];
                const last  = validDates[validDates.length - 1];

                finalIso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;

                const m1 = first.getMonth() + 1, d1 = first.getDate(), y1 = first.getFullYear();
                const m2 = last.getMonth()  + 1, d2 = last.getDate();

                if (validDates.length === 1) {
                  finalDateStr = `${m1}/${d1}/${y1}`;
                } else if (m1 === m2) {
                  finalDateStr = `${m1}/${d1} - ${m1}/${d2}/${y1}`;
                } else {
                  finalDateStr = `${m1}/${d1} - ${m2}/${d2}/${y1}`;
                }
              }
            }

            const recKey = `${editUrl}_${finalIso}_${title}`;
            if (!seenRecords.has(recKey)) {
              seenRecords.add(recKey);
              records.push({
                title: title || defaultType,
                rawDate: finalDateStr || rawDate,
                iso: finalIso,
                status: status || 'Scheduled',
                editUrl,
                attendedDays
              });
            }
          });
        });

        cache.contactSchedules.set(contactId, records);
        return records;
      } catch (err) {
        console.warn('Failed to parse contact scheduling subtabs:', err);
        return [];
      }
    }

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; width: 100%; height: 100%;
        overflow: hidden; background: rgb(18, 18, 20);
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: rgb(244, 244, 245);
        user-select: text !important;
        -webkit-user-select: text !important;
      }
      ::-webkit-scrollbar { width: 5px; height: 5px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

      .nav-bar {
        display: flex; background: rgba(24, 24, 27, 0.98);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        padding: 8px 12px; align-items: center; justify-content: space-between; flex-shrink: 0;
        user-select: none; -webkit-user-select: none;
      }
      .app-title { font-weight: 700; font-size: 13px; color: white; display: flex; align-items: center; gap: 8px; user-select: none; -webkit-user-select: none; }

      .content-viewport { width: 100%; height: calc(100% - 46px); overflow: hidden; position: relative; }
      .view-pane { width: 100%; height: 100%; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }

      .pill {
        display: inline-block; padding: 2px 7px; border-radius: 999px;
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18);
        color: rgb(228, 228, 231); letter-spacing: 0.5px; white-space: nowrap;
        user-select: none; -webkit-user-select: none;
      }

      .btn {
        padding: 7px 12px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 12px;
        display: inline-flex; align-items: center; justify-content: center; text-decoration: none;
        transition: all 0.2s ease; border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.08); color: rgb(250, 250, 250);
        user-select: none; -webkit-user-select: none;
      }
      .btn:hover { background: rgba(255, 255, 255, 0.14); }
      .btn-solid { background: linear-gradient(180deg, white 0%, rgb(228, 228, 231) 100%); color: rgb(9, 9, 11); border: 1px solid white; font-weight: 700; }
      .btn-solid:hover { background: rgb(212, 212, 216); }

      .glass-card {
        background: rgba(255, 255, 255, 0.035); border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px; padding: 10px 12px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .card-contact { border-left: 3px solid rgb(129, 140, 248); }
      .title-contact { color: rgb(129, 140, 248) !important; }
      .card-client { border-left: 3px solid rgb(56, 189, 248); }
      .title-client { color: rgb(56, 189, 248) !important; }
      .card-schedule { border-left: 3px solid rgb(251, 191, 36); }
      .title-schedule { color: rgb(251, 191, 36) !important; }
      .card-notes { border-left: 3px solid rgb(52, 211, 153); }
      .title-notes { color: rgb(52, 211, 153) !important; }

      .field-label {
        font-size: 10px; text-transform: uppercase; font-weight: 700;
        color: rgb(161, 161, 170); letter-spacing: 0.6px; margin-bottom: 2px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .field-value {
        font-size: 12px; color: rgb(250, 250, 250); font-weight: 500; word-break: break-word;
        user-select: text !important; -webkit-user-select: text !important; cursor: text;
      }
      .field-value a { color: rgb(250, 250, 250); text-decoration: none; cursor: pointer; }
      .field-value a:hover { color: rgb(56, 189, 248); }

      input[type="text"], textarea {
        width: 100%; background: rgba(9, 9, 11, 0.65); border: 1px solid rgba(255, 255, 255, 0.14);
        color: rgb(250, 250, 250); padding: 7px 11px; border-radius: 8px; font-size: 12px; outline: none;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .search-results {
        max-height: 130px; overflow-y: auto; background: rgba(18, 18, 20, 0.96);
        border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 10px; display: none; margin-top: 4px;
      }
      .search-item { padding: 7px 12px; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 11px; color: rgb(228, 228, 231); }
      .search-item:hover { background: rgba(255, 255, 255, 0.12); color: white; }

      .scroll-box {
        font-size: 11px; color: rgb(212, 212, 216); max-height: 52px; overflow-y: auto;
        background: rgba(9, 9, 11, 0.5); padding: 6px 8px; border-radius: 6px; white-space: pre-wrap;
        user-select: text !important; -webkit-user-select: text !important; cursor: text;
      }
      .notes-container {
        max-height: 155px; overflow-y: auto; background: rgba(9, 9, 11, 0.5);
        padding: 8px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 8px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .note-item {
        border-left: 2px solid rgb(52, 211, 153); padding-left: 8px;
        user-select: text !important; -webkit-user-select: text !important;
      }
      .note-header { font-size: 11px; color: rgb(161, 161, 170); display: flex; justify-content: space-between; margin-bottom: 3px; }
      .note-author { font-weight: 700; color: rgb(250, 250, 250); user-select: text !important; -webkit-user-select: text !important; }
      .note-body {
        font-size: 13px; color: rgb(244, 244, 245); white-space: pre-wrap; word-break: break-word;
        user-select: text !important; -webkit-user-select: text !important; cursor: text;
      }
    `;
    document.head.appendChild(style);

    const appContainer = document.createElement('div');
    appContainer.id = UI_ID;
    appContainer.style.cssText = 'display:flex; flex-direction:column; width:100%; height:100%; overflow:hidden; position:relative;';
    appContainer.innerHTML = `
      <div class="nav-bar">
        <div class="app-title">
          <span>👤 Inspector</span>
          <span id="ns-seminar-pip-pill" class="pill" style="display:none; cursor:pointer; background:rgba(251, 191, 36, 0.2); color:rgb(251, 191, 36); border-color:rgba(251, 191, 36, 0.4);" title="Click to pop out Seminar Mini-Window">📅 Seminar Found ↗</span>
        </div>
        <span class="pill" id="ns-bridge-status" style="background:rgba(34, 197, 94, 0.2); color:rgb(74, 222, 128); border-color:rgba(34, 197, 94, 0.4);">● Connected</span>
      </div>

      <div class="content-viewport">
        <div class="view-pane" id="pane-inspector-view">
          <div>
            <input type="text" id="ns-insp-search" placeholder="Search attendee on board..." autocomplete="off" />
            <div class="search-results" id="ns-insp-dropdown"></div>
          </div>

          <div class="glass-card card-contact">
            <div class="field-label title-contact">Linked Contact File</div>
            <div id="ns-insp-contact-name" class="field-value" style="font-size:15px; font-weight:700; color:rgb(255, 255, 255); margin-top:3px;">-</div>
            <div class="field-label" style="margin-top:6px;">Position / Post</div>
            <div id="ns-insp-position" class="field-value" style="font-weight:600; color:rgb(228, 228, 231);">-</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:6px;">
              <div><div class="field-label">Direct Phone</div><div id="ns-insp-contact-phone" class="field-value">-</div></div>
              <div><div class="field-label" style="color:rgb(255, 255, 255);">Contact Email</div><div id="ns-insp-contact-email" class="field-value" style="font-size:11px; color:rgb(255, 255, 255);">-</div></div>
            </div>
            <div class="field-label" style="margin-top:6px;">Contact Comments</div>
            <div id="ns-insp-contact-comments" class="scroll-box">-</div>
          </div>

          <div class="glass-card card-client">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="field-label title-client">Linked Client Master</span>
              <span id="ns-insp-client-fetch-status" style="font-size:10px; color:rgb(161, 161, 170);">-</span>
            </div>
            <div id="ns-insp-full-client" class="field-value" style="font-weight:600; font-size:13px; margin-top:3px;">-</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:6px;">
              <div><div class="field-label">Work Phone</div><div id="ns-insp-work-phone" class="field-value">-</div></div>
              <div><div class="field-label" style="color:rgb(255, 255, 255);">Primary Email</div><div id="ns-insp-email" class="field-value" style="font-size:11px; color:rgb(255, 255, 255);">-</div></div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:6px;">
              <div><div class="field-label">Cell 1</div><div id="ns-insp-cell-1" class="field-value">-</div></div>
              <div><div class="field-label">Cell 2</div><div id="ns-insp-cell-2" class="field-value">-</div></div>
            </div>
            <div class="field-label" style="margin-top:6px;">Client Comments</div>
            <div id="ns-insp-comments" class="scroll-box">-</div>
            
            <button id="ns-insp-btn-scan-60d" class="btn btn-solid" style="margin-top:10px; width:100%; background:linear-gradient(180deg,#38bdf8 0%,#0284c7 100%); color:white; border:none; padding:8px 12px;">
              📅 Scan Office 30-Day Outlook (PDFs)
            </button>
          </div>

          <div class="glass-card card-schedule">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <div><div class="field-label title-schedule">Scheduled Date & Status</div><div id="ns-insp-sched-day" class="field-value" style="font-size:12px; font-weight:600; line-height:1.5;">-</div></div>
              <span class="pill" id="ns-insp-pill-id">Attendee ID: --</span>
            </div>

            <div id="ns-insp-linked-event-box" style="display:none; margin-top:8px; padding:8px 10px; border-radius:8px; background:rgba(251, 191, 36, 0.12); border:1px solid rgba(251, 191, 36, 0.35);">
              <div class="field-label" style="color:rgb(251, 191, 36); font-size:10px; margin-bottom:4px;">📅 Attending Event This Week</div>
              <div id="ns-insp-linked-event-items" style="display:flex; flex-direction:column; gap:6px;"></div>
            </div>

            <div style="margin-top:8px; padding-top:8px; border-top:1px solid rgba(255, 255, 255, 0.08); display:flex; flex-direction:column; gap:6px;">
              <button id="ns-insp-btn-pdf" class="btn" disabled>Print Schedule 2020 (PDF) ↗</button>
              <a id="ns-insp-btn-attendee" href="javascript:void(0)" target="_blank" class="btn" style="opacity:0.4; pointer-events:none;">Edit Custom Record (No. 56)</a>
            </div>
          </div>

          <div class="glass-card card-notes">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span class="field-label title-notes">5 Latest User Notes</span>
              <span id="ns-insp-notes-count" style="font-size:9px; color:rgb(161, 161, 170);">-</span>
            </div>
            <div id="ns-insp-notes-list" class="notes-container"><div style="color:rgb(161, 161, 170);">Waiting for click...</div></div>
            <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 8px; margin-top: 6px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span class="field-label title-notes">Add Note to Client</span>
                <span id="ns-insp-save-status" style="font-size:10px; color:rgb(161, 161, 170);"></span>
              </div>
              <textarea id="ns-insp-new-note" placeholder="Write a note to log under this client..." rows="2" style="resize:vertical;"></textarea>
              <div style="display:flex; justify-content:flex-end; margin-top:6px;">
                <button id="ns-insp-btn-save-note" class="btn btn-solid" style="padding:6px 14px; font-size:11px;" disabled>Save Note</button>
              </div>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:6px;">
            <a id="ns-insp-btn-contact" href="javascript:void(0)" target="_blank" class="btn" style="opacity:0.4; pointer-events:none;">Open Contact File (contact.nl)</a>
            <a id="ns-insp-btn-client" href="javascript:void(0)" target="_blank" class="btn" style="opacity:0.4; pointer-events:none;">Open Master Client File (custjob.nl)</a>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(appContainer);

    const seminarPill = document.getElementById('ns-seminar-pip-pill');
    const btnScan60d = document.getElementById('ns-insp-btn-scan-60d');

    /* Status Badge Resolver */
    function getStatusBadge(status) {
      if (!status || /^(edit|view)$/i.test(status.trim())) return '';
      const s = status.trim().toLowerCase();
      let bg = 'rgba(255, 255, 255, 0.08)', color = 'rgb(228, 228, 231)', border = 'rgba(255, 255, 255, 0.18)';

      if (s.includes('resched') || s.includes('re-sched') || s.includes('schedule change') || s.includes('sched change')) {
        bg = 'rgba(249, 115, 22, 0.25)'; color = 'rgb(251, 146, 60)'; border = 'rgba(249, 115, 22, 0.5)';
      } else if (s.includes('noshow') || s.includes('no show') || s.includes('no-show') || s === 'ns' || s.includes('did not attend') || s.includes('absent')) {
        bg = 'rgba(239, 68, 68, 0.25)'; color = 'rgb(248, 113, 113)'; border = 'rgba(239, 68, 68, 0.6)';
      } else if (s.includes('cancel') || s.includes('cxl')) {
        bg = 'rgba(239, 68, 68, 0.15)'; color = 'rgb(252, 165, 165)'; border = 'rgba(239, 68, 68, 0.35)';
      } else if (s.includes('confirm')) {
        bg = 'rgba(34, 197, 94, 0.2)'; color = 'rgb(74, 222, 128)'; border = 'rgba(34, 197, 94, 0.4)';
