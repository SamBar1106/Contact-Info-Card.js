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
      const ddmmyyyy = s.match(/\b(\d{1,2})[\s\-\/]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-\/]+(\d{2,4})\b/i);
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
    function parseLocalDate(dStr) {
      if (!dStr) return null;
      const str = String(dStr).replace(/\u00a0/g, ' ').trim();
      const isoM = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      if (isoM) {
        return new Date(parseInt(isoM[1], 10), parseInt(isoM[2], 10) - 1, parseInt(isoM[3], 10));
      }
      const usM = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (usM) {
        let yr = usM[3];
        if (yr.length === 2) yr = '20' + yr;
        return new Date(parseInt(yr, 10), parseInt(usM[1], 10) - 1, parseInt(usM[2], 10));
      }
      const monthsMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
      const ddmmyyyy = str.match(/^(\d{1,2})[-/\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[-/\s]+(\d{2,4})$/i);
      if (ddmmyyyy) {
        let yr = ddmmyyyy[3];
        if (yr.length === 2) yr = '20' + yr;
        const m = monthsMap[ddmmyyyy[2].toLowerCase()];
        if (m !== undefined) return new Date(parseInt(yr, 10), m, parseInt(ddmmyyyy[1], 10));
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        if (str.includes('T') || str.includes('Z') || /^\d{4}-\d{2}-\d{2}$/.test(str)) {
          return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        }
        return d;
      }
      return null;
    }
    function isCheckboxChecked(doc, day) {
      const el = doc.querySelector(`#custrecord_crs_attendee_${day}_fs_inp, [id*="custrecord_crs_attendee_${day}_fs"], [id$="custrecord_crs_attendee_${day}_val"]`);
      if (!el) return false;
      if (el.checked) return true;
      const cls = (el.className || '') + ' ' + (el.getAttribute('class') || '');
      if (cls.includes('checkbox_ck') || cls.includes('checkbox_checked')) return true;
      const txt = (el.innerText || el.textContent || el.value || '').trim().toLowerCase();
      if (txt === 'yes' || txt === 't' || txt === 'true') return true;
      const img = el.querySelector('img');
      if (img && (img.src.includes('checkbox_ck') || img.alt.toLowerCase().includes('yes'))) return true;
      return false;
    }
    function extractAttendeeStatus(doc) {
      const VALID = ['Scheduled', 'Confirmed', 'Schedule Change', 'No Show'];
      const STATUS_MAP = { '1': 'Scheduled', '2': 'Confirmed', '4': 'No Show', '5': 'Schedule Change' };

      const hddn = Array.from(doc.querySelectorAll('input[id^="hddn_custrecord_crs_attendee_status"]'))
                        .find(el => !el.id.includes('orig') && !el.id.includes('req') && !el.id.includes('changed'));
      if (hddn && hddn.value && STATUS_MAP[hddn.value.trim()]) return STATUS_MAP[hddn.value.trim()];

      const inpt = doc.querySelector('input[name="inpt_custrecord_crs_attendee_status"]');
      if (inpt && VALID.includes(inpt.value.trim())) return inpt.value.trim();

      const sel = doc.querySelector('select[name="custrecord_crs_attendee_status"]');
      if (sel && sel.selectedIndex >= 0) {
        const selText = sel.options[sel.selectedIndex]?.text?.trim();
        if (VALID.includes(selText)) return selText;
      }

      const valSpan = doc.querySelector('[id$="custrecord_crs_attendee_status_val"]');
      if (valSpan) {
        const t = (valSpan.innerText || valSpan.textContent || '').trim();
        if (VALID.includes(t)) return t;
      }

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

      const ddmonM = line.match(/\b\d{1,2}[\s\-\/]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s\-\/]+\d{2,4}\b/i);
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
            let rawDate = '';
            let title = '';

            const tbl = row.closest('table');
            const headerRow = tbl ? tbl.querySelector('tr.uir-list-header-tr, tr:has(.listheader), tr:has(th)') : null;
            const attendedDays = [];
            let weekEndingColIdx = -1;

            if (headerRow) {
              Array.from(headerRow.children).forEach((hCell, idx) => {
                const hTxt = (hCell.innerText || hCell.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

                if (/week\s*end/i.test(hTxt) && weekEndingColIdx === -1) {
                  weekEndingColIdx = idx;
                }

                const dm = hTxt.match(/\b(mon|tue|wed|thu|fri|sat)\b/i);
                if (dm && cells[idx]) {
                  const v = (cells[idx].innerText || cells[idx].textContent || '').trim().toLowerCase();
                  if (v === 'yes' || v === 'y' || cells[idx].querySelector('img[src*="check"], input:checked')) {
                    attendedDays.push(dm[1].toLowerCase());
                  }
                }
              });
            }

            if (weekEndingColIdx >= 0 && cells[weekEndingColIdx]) {
              const t = (cells[weekEndingColIdx].innerText || cells[weekEndingColIdx].textContent || '').trim();
              const dM = extractDateFromLine(t);
              if (dM) rawDate = dM.rawDate;
            }

            for (const c of cells) {
              if (c.contains(a)) continue;
              const text = (c.innerText || c.textContent || '').replace(/\s+/g, ' ').trim();
              
              if (!text || /^(edit|view|remove)$/i.test(text)) continue;

              const dInfo = extractDateFromLine(text);

              if (!status && VALID_STATUSES.some(s => s.toLowerCase() === text.toLowerCase())) {
                status = VALID_STATUSES.find(s => s.toLowerCase() === text.toLowerCase());
              } else if (!rawDate && dInfo && text.length < 30) {
                rawDate = dInfo.rawDate;
              } else if (!title && text.length > 3) {
                const isStatusWord = VALID_STATUSES.some(s => s.toLowerCase() === text.toLowerCase());
                if (!isStatusWord && !/^\d+$/.test(text) && !/^(yes|no|none)$/i.test(text) && !dInfo) {
                  title = text;
                }
              }
            }

            // ONLY ALLOW SCHEDULED OR CONFIRMED
            let finalStatus = status || 'Scheduled';
            if (!/^(Scheduled|Confirmed)$/i.test(finalStatus)) return; // Filters out No Show, Cancelled, Schedule Change

            let finalDateStr = rawDate;
            let finalIso = normalizeDate(rawDate);

            if (finalIso && attendedDays.length > 0) {
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
                status: finalStatus,
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
    function getWeekHeaderMap(el) {
      const mainDoc = window.opener?.document || document;
      const weekContainer = (el && (el.closest('.wkTd') || el.closest('[id*="week-"]') || el.closest('table.wkTbl') || el.closest('table'))) || mainDoc;
      if (!weekContainer) return {};
      if (cache.weekHeaders.has(weekContainer)) return cache.weekHeaders.get(weekContainer);

      const map = {};
      weekContainer.querySelectorAll('thead th.dayTh, thead th[class*="day_"], th.dayTh, th[class*="day_"]').forEach(th => {
        const m = th.className.match(/\b(day_[a-z0-9]+)\b/i);
        if (m) {
          const txt = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt && !map[m[1].toLowerCase()]) map[m[1].toLowerCase()] = txt;
        }
      });

      const dayIndexMap = { 1: 'day_mon', 2: 'day_tue', 3: 'day_wed', 4: 'day_thu', 5: 'day_fri', 6: 'day_sat' };
      weekContainer.querySelectorAll('[id*="_day_"], [id*="day_"]').forEach(span => {
        const m = span.id.match(/day_(\d+)/i);
        if (m && dayIndexMap[m[1]]) {
          const key = dayIndexMap[m[1]];
          const th = span.closest('th, td');
          const sTxt = (span.innerText || span.textContent || '').trim();
          if (th && !map[key]) map[key] = (th.innerText || th.textContent || '').replace(/\s+/g, ' ').trim();
          else if (sTxt && !map[key]) map[key] = ({ day_mon: 'Mon - ', day_tue: 'Tue - ', day_wed: 'Wed - ', day_thu: 'Thu - ', day_fri: 'Fri - ', day_sat: 'Sat - ' }[key] || '') + sTxt;
        }
      });

      cache.weekHeaders.set(weekContainer, map);
      return map;
    }
    function getAttendeeDates(el) {
      const tr = el ? el.closest('tr') : null;
      if (!tr) return '-';
      const headerMap = getWeekHeaderMap(el);
      const cells = Array.from(tr.querySelectorAll('td'));
      const dayOrder = ['day_tue', 'day_wed', 'day_thu', 'day_fri', 'day_sat', 'day_mon'];
      const scheduledList = [];

      cells.forEach(td => {
        if (td.classList.contains('statusSchd') || /\bstatus(schd|conf)/i.test(td.className)) {
          const m = td.className.match(/\b(day_[a-z0-9]+)\b/i);
          if (m) {
            const dayKey = m[1].toLowerCase();
            scheduledList.push({ dayKey, dateStr: headerMap[dayKey] || dayKey.replace('day_', '').toUpperCase() });
          }
        }
      });

      if (scheduledList.length === 0) {
        const m = el.className.match(/\b(day_[a-z0-9]+)\b/i);
        if (m && headerMap[m[1].toLowerCase()]) scheduledList.push({ dayKey: m[1].toLowerCase(), dateStr: headerMap[m[1].toLowerCase()] });
      }

      scheduledList.sort((a, b) => (dayOrder.indexOf(a.dayKey) - dayOrder.indexOf(b.dayKey)));
      const unique = [...new Set(scheduledList.map(x => x.dateStr))];
      if (unique.length === 0) return '-';
      return unique.length === 1 ? `<div>${unique[0]}</div>` : `<div>${unique[0]}</div><div>${unique[unique.length - 1]}</div>`;
    }
    function safeLookupSS1(recType, internalId, fieldId) {
      try {
        const oWin = window.opener || window;
        const fn = oWin.nlapiLookupField || oWin.parent?.nlapiLookupField;
        if (typeof fn === 'function') return fn(recType, internalId, fieldId) || '';
      } catch (e) {}
      return '';
    }
    function getNetSuiteViewField(doc, fieldId, labelFallbacks = []) {
      const el = doc.querySelector(`[aria-labelledby="${fieldId}_fs_lbl"], [id="${fieldId}_val"], [id="${fieldId}_fs"], [id*="${fieldId}_val"]`);
      if (el && (el.innerText || el.textContent || '').trim()) return (el.innerText || el.textContent || '').trim();
      const formInput = doc.querySelector(`input[name="${fieldId}"], textarea[name="${fieldId}"], select[name="${fieldId}"]`);
      if (formInput && formInput.value?.trim()) return formInput.value.trim();

      for (const lbl of labelFallbacks) {
        const labelEl = Array.from(doc.querySelectorAll('.smallgraytextnolink, .uir-field-label, td.label')).find(
          e => (e.innerText || e.textContent || '').trim().toLowerCase().startsWith(lbl.toLowerCase())
        );
        if (labelEl) {
          const next = labelEl.nextElementSibling || labelEl.closest('td')?.nextElementSibling;
          const nTxt = (next?.innerText || next?.textContent || '').trim();
          if (nTxt) return nTxt;
        }
      }
      return '';
    }
    function extractNotes(doc) {
      const rows = Array.from(doc.querySelectorAll('tr[id^="usernotesrow"], [id="usernotes_splits"] tr.uir-list-row-tr'));
      const notes = [];
      for (const row of rows) {
        if (notes.length >= 5) break;
        const cells = Array.from(row.querySelectorAll('td.uir-list-row-cell, td.listtext'));
        if (cells.length >= 4) {
          const date = (cells[1]?.innerText || cells[1]?.textContent || '').trim();
          const author = (cells[2]?.innerText || cells[2]?.textContent || '').trim();
          const memo = (cells[4]?.innerText || cells[4]?.textContent || cells[3]?.innerText || cells[3]?.textContent || '').trim();
          if (memo && !/author|date|memo/i.test(author) && !notes.some(n => n.memo === memo)) {
            notes.push({ date, author, memo, timestamp: Date.parse(date.replace(/-/g, ' ')) || 0 });
          }
        }
      }
      notes.sort((a, b) => b.timestamp - a.timestamp);
      return notes;
    }
    async function getClientData(clientInternalId, fallbackBoardName = '') {
      if (cache.clients.has(clientInternalId)) return cache.clients.get(clientInternalId);
      const res = await fetch('/app/common/entity/custjob.nl?id=' + clientInternalId);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      let resolvedCompany = safeLookupSS1('customer', clientInternalId, 'companyname') || safeLookupSS1('customer', clientInternalId, 'entitytitle');
      if (!resolvedCompany || /dashboard|customer 360|list view|search/i.test(resolvedCompany)) {
        const fieldVal = (doc.querySelector('[id="companyname_val"], [id*="companyname_val"], [id="entitytitle_val"], [id="altname_val"]')?.innerText || '').trim();
        resolvedCompany = (fieldVal && !/dashboard|customer 360|list view|search/i.test(fieldVal)) ? fieldVal : (fallbackBoardName || 'Client Master');
      }

      const uirRecordId = (doc.querySelector('.uir-record-id')?.innerText || '').trim();
      if (uirRecordId) {
        resolvedCompany = uirRecordId;
      }

      let notes = extractNotes(doc);
      if (notes.length === 0) {
        try {
          const noteRes = await fetch('/app/crm/common/note.nl?l=T&entity=' + clientInternalId);
          if (noteRes.ok) notes = extractNotes(new DOMParser().parseFromString(await noteRes.text(), 'text/html'));
        } catch (e) {}
      }

      const data = {
        companyName: resolvedCompany,
        workPhone: safeLookupSS1('customer', clientInternalId, 'phone') || getNetSuiteViewField(doc, 'phone', ['Work Phone', 'Phone', 'Main Phone']) || html.match(/id=["']phone_val["'][^>]*>([^<]+)</i)?.[1]?.trim() || '',
        email: safeLookupSS1('customer', clientInternalId, 'email') || getNetSuiteViewField(doc, 'email', ['Email', 'Primary Email']) || html.match(/id=["']email_val["'][^>]*>([^<]+)</i)?.[1]?.trim() || '',
        comments: safeLookupSS1('customer', clientInternalId, 'comments') || getNetSuiteViewField(doc, 'comments', ['Comments']) || 'None recorded',
        cell1Phone: safeLookupSS1('customer', clientInternalId, 'mobilephone') || getNetSuiteViewField(doc, 'mobilephone', ['Cell Phone 1']) || '',
        cell1Name: safeLookupSS1('customer', clientInternalId, 'custentity3') || getNetSuiteViewField(doc, 'custentity3', ['Cell 1 Name']) || '',
        cell2Phone: safeLookupSS1('customer', clientInternalId, 'custentitycellphone2') || getNetSuiteViewField(doc, 'custentitycellphone2', ['Cell Phone 2']) || '',
        cell2Name: safeLookupSS1('customer', clientInternalId, 'custentitycell2name') || getNetSuiteViewField(doc, 'custentitycell2name', ['Cell 2 Name']) || '',
        doc,
        notes
      };

      cache.clients.set(clientInternalId, data);
      return data;
    }
    async function getContactData(contactId) {
      if (cache.contacts.has(contactId)) return cache.contacts.get(contactId);
      const res = await fetch('/app/common/entity/contact.nl?id=' + contactId);
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');

      let companyId = safeLookupSS1('contact', contactId, 'company') || safeLookupSS1('contact', contactId, 'parentcustomer');
      if (!companyId) {
        const compLink = doc.querySelector('a[href*="custjob.nl?id="], a[href*="customer.nl?id="], [id="company_val"] a, [id="parent_val"] a');
        const m = (compLink?.getAttribute('href') || '').match(/[?&]id=(\d+)/);
        if (m) companyId = m[1];
      }
      if (!companyId) {
        const m = html.match(/(?:custjob\.nl|customer\.nl)\?[^"']*id=(\d+)/i);
        if (m) companyId = m[1];
      }

      const data = {
        name: safeLookupSS1('contact', contactId, 'entityid') || getNetSuiteViewField(doc, 'entityid', ['Contact', 'Name']) || (doc.querySelector('.uir-page-title, h1')?.innerText || '').trim(),
        position: safeLookupSS1('contact', contactId, 'title') || getNetSuiteViewField(doc, 'title', ['Position', 'Position/Post']) || '',
        email: safeLookupSS1('contact', contactId, 'email') || getNetSuiteViewField(doc, 'email', ['Email']) || html.match(/mailto:([^"'>\s]+)/i)?.[1] || '',
        phone: safeLookupSS1('contact', contactId, 'phone') || safeLookupSS1('contact', contactId, 'mobilephone') || getNetSuiteViewField(doc, 'mobilephone', ['Cell Phone 1']) || getNetSuiteViewField(doc, 'phone', ['Main Phone']) || html.match(/tel:([^"'>\s]+)/i)?.[1] || '',
        comments: safeLookupSS1('contact', contactId, 'comments') || getNetSuiteViewField(doc, 'comments', ['Comments']) || 'None recorded',
        companyId: companyId || ''
      };

      cache.contacts.set(contactId, data);
      return data;
    }
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
            rowEditUrl = '/app/common/entity/contact.nl?id=' + contactId + '&selectedtab=custom26&e=T';
          }

          let attendanceDate = '';
          let attendanceStatus = '';
          let seminarTitle = '';

          const VALID_STATUSES = ['Scheduled', 'Confirmed', 'Schedule Change', 'No Show'];

          row.querySelectorAll('td').forEach(cell => {
            if (cell.contains(cLink)) return;
            const text = (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim();
            if (!text || /^(edit|view)$/i.test(text)) return;

            const dInfo = extractDateFromLine(text);
            if (!attendanceDate && dInfo && text.length < 30) {
              attendanceDate = dInfo.rawDate;
            } else if (!attendanceStatus && VALID_STATUSES.some(s => s.toLowerCase() === text.toLowerCase())) {
              attendanceStatus = VALID_STATUSES.find(s => s.toLowerCase() === text.toLowerCase());
            } else if (!seminarTitle && text.length > 4) {
              const isStatusWord = VALID_STATUSES.some(s => s.toLowerCase() === text.toLowerCase());
              if (!isStatusWord && !/^\d+$/.test(text) && !/^(yes|no|none)$/i.test(text)) {
                seminarTitle = text;
              }
            }
          });

          // ONLY ALLOW SCHEDULED OR CONFIRMED
          let finalStatus = attendanceStatus || 'Scheduled';
          if (!/^(Scheduled|Confirmed)$/i.test(finalStatus)) return;

          if ((attendanceDate || seminarTitle) && (seminarTitle || attendanceStatus || rowEditUrl)) {
            const compoundKey = `${contactName}_${seminarTitle}_${attendanceDate}`;
            if (!results.some(r => r.compoundKey === compoundKey)) {
              results.push({ 
                contactName, 
                contactId, 
                eventTitle: seminarTitle, 
                date: attendanceDate, 
                rawDate: attendanceDate,
                status: finalStatus, 
                editUrl: rowEditUrl,
                compoundKey 
              });
            }
          }
        });
      });
      
      for (const rec of results) {
        if (rec.editUrl && rec.editUrl.includes('rectype=56')) {
          try {
            const req = await fetch(rec.editUrl);
            if (!req.ok) continue;
            const text = await req.text();
            const recDoc = new DOMParser().parseFromString(text, 'text/html');

            const exactStatus = extractAttendeeStatus(recDoc);
            if (exactStatus) rec.status = exactStatus;

            const weekEndingEl = recDoc.querySelector('#custrecord_crs_attendee_week_ending_display, #custrecord_crs_attendee_week_ending_val, [id$="custrecord_crs_attendee_week_ending_val"], [name="custrecord_crs_attendee_week_ending"]');
            const rawWeekVal = weekEndingEl ? (weekEndingEl.value || weekEndingEl.innerText || weekEndingEl.textContent || '').trim() : '';
            const weekEndingIso = normalizeDate(rawWeekVal);

            if (weekEndingIso) {
              const DAY_OFFSETS = { tue: -8, wed: -7, thu: -6, fri: -5, sat: -4 };
              const daysToCheck = ['tue', 'wed', 'thu', 'fri', 'sat'];
              const p = weekEndingIso.split('-').map(Number);
              const weekEndingDt = new Date(p[0], p[1] - 1, p[2]);

              const validDates = daysToCheck
                .filter(day => isCheckboxChecked(recDoc, day))
                .map(day => {
                  const dt = new Date(weekEndingDt);
                  dt.setDate(weekEndingDt.getDate() + DAY_OFFSETS[day]);
                  return dt;
                })
                .sort((a, b) => a - b);

              if (validDates.length > 0) {
                const first = validDates[0];
                const last = validDates[validDates.length - 1];
                
                rec.iso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
                
                const m1 = first.getMonth() + 1, d1 = first.getDate(), y1 = first.getFullYear();
                const m2 = last.getMonth() + 1, d2 = last.getDate();

                if (validDates.length === 1) {
                  rec.rawDate = `${m1}/${d1}/${y1}`;
                  rec.date = `${m1}/${d1}/${y1}`;
                } else if (m1 === m2) {
                  rec.rawDate = `${m1}/${d1} - ${m1}/${d2}/${y1}`;
                  rec.date = `${m1}/${d1} - ${m1}/${d2}/${y1}`;
                } else {
                  rec.rawDate = `${m1}/${d1} - ${m2}/${d2}/${y1}`;
                  rec.date = `${m1}/${d1} - ${m2}/${d2}/${y1}`;
                }
              }
            }
          } catch(e) {}
        }
      }

      // Final strict filter right before saving to cache just to be absolutely certain
      const finalFilteredResults = results.filter(r => /^(Scheduled|Confirmed)$/i.test(r.status));
      cache.eventAttendance.set(clientId, finalFilteredResults);
      return finalFilteredResults;
    }
    async function fetchAttendeeRecord(attendee) {
      const attendeeId = attendee.id;
      try {
        const res = await fetch('/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendeeId);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const exactStatus = extractAttendeeStatus(doc);

        const weekEndingEl = doc.querySelector('#custrecord_crs_attendee_week_ending_display, #custrecord_crs_attendee_week_ending_val, [id$="custrecord_crs_attendee_week_ending_val"], [name="custrecord_crs_attendee_week_ending"]');
        const rawWeekVal = weekEndingEl ? (weekEndingEl.value || weekEndingEl.innerText || weekEndingEl.textContent || '').trim() : '';
        const weekEndingIso = normalizeDate(rawWeekVal);

        if (weekEndingIso) {
          const DAY_OFFSETS = { tue: -8, wed: -7, thu: -6, fri: -5, sat: -4 };
          const daysToCheck = ['tue', 'wed', 'thu', 'fri', 'sat'];
          const p = weekEndingIso.split('-').map(Number);
          const weekEndingDt = new Date(p[0], p[1] - 1, p[2]);

          const validDates = daysToCheck
            .filter(day => isCheckboxChecked(doc, day))
            .map(day => {
              const dt = new Date(weekEndingDt);
              dt.setDate(weekEndingDt.getDate() + DAY_OFFSETS[day]);
              return dt;
            })
            .sort((a, b) => a - b);

          if (validDates.length > 0) {
            const first = validDates[0];
            const last = validDates[validDates.length - 1];
            const m1 = first.getMonth() + 1, d1 = first.getDate(), y1 = first.getFullYear();
            const m2 = last.getMonth() + 1, d2 = last.getDate();
            let dateStr = '';
            if (validDates.length === 1) {
              dateStr = `${m1}/${d1}/${y1}`;
            } else if (m1 === m2) {
              dateStr = `${m1}/${d1} - ${m1}/${d2}/${y1}`;
            } else {
              dateStr = `${m1}/${d1} - ${m2}/${d2}/${y1}`;
            }

            const statusHtml = exactStatus ? `<div style="margin-top:4px;">${getStatusBadge(exactStatus)}</div>` : '';
            document.getElementById('ns-insp-sched-day').innerHTML = `<div>${dateStr}</div>${statusHtml}`;
          } else if (exactStatus) {
            const currentHtml = document.getElementById('ns-insp-sched-day').innerHTML;
            const textOnlyDates = currentHtml.replace(/<div[^>]*>.*?<\/div>/gi, (match) => {
               if(match.includes('pill') || match.includes('rgba')) return '';
               return match;
            });
            document.getElementById('ns-insp-sched-day').innerHTML = `${textOnlyDates}<div style="margin-top:4px;">${getStatusBadge(exactStatus)}</div>`;
          }
        }

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
            if (clientData.companyName) {
              document.getElementById('ns-insp-full-client').textContent = clientData.companyName;
            }
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
              // STRICTLY ENFORCE SCHEDULED/CONFIRMED HERE AS WELL
              if (item.status && !/^(Scheduled|Confirmed)$/i.test(item.status)) return false;
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
                  const rawEditTarget = m.editUrl || (m.contactId ? '/app/common/entity/contact.nl?id=' + m.contactId + '&selectedtab=custom26&e=T' : '');
                  const fullEditUrl = toAbsoluteNsUrl(rawEditTarget);
                  return `
                    <div style="${idx > 0 ? 'border-top:1px solid rgba(251,191,36,0.2); padding-top:5px;' : ''}">
                      <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                        <span style="font-weight:700; color:#fff; font-size:12px;">${m.eventTitle || 'Linked Seminar'}</span>
                        <div style="display:flex; align-items:center; gap:4px;">
                          ${fullEditUrl ? `<a href="${fullEditUrl}" data-nav-url="${fullEditUrl}" target="_blank" rel="noopener noreferrer" class="pill ns-edit-event-btn" style="cursor:pointer; background:rgba(255, 255, 255, 0.12); color:rgb(244, 244, 245); border:1px solid rgba(255, 255, 255, 0.35); text-decoration:none;" title="Open Record in Edit Mode">EDIT ↗</a>` : ''}
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