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

      // NEW: Extract .uir-record-id from the client page and use it if it exists
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
      
      // ==== EXACT DOM EXTRACTION FOR CLIENT ATTENDANCE ====
      for (const rec of results) {
        if (rec.editUrl && rec.editUrl.includes('rectype=56')) {
          try {
            const req = await fetch(rec.editUrl);
            if (!req.ok) continue;
            const text = await req.text();
            const recDoc = new DOMParser().parseFromString(text, 'text/html');

            const exactStatus = extractAttendeeStatus(recDoc);
            if (exactStatus) rec.status = exactStatus;

            // 2. Read Week-Ending Date
            let weekEndingDate = null;
            const weekEndingEl = recDoc.querySelector('#custrecord_crs_attendee_week_ending_display');
            if (weekEndingEl && weekEndingEl.value) {
              weekEndingDate = new Date(weekEndingEl.value);
            }

            // 3. Date Math
            if (weekEndingDate && !isNaN(weekEndingDate.getTime())) {
              const dayOffsets = { 'tue': -8, 'wed': -7, 'thu': -6, 'fri': -5, 'sat': -4 };
              const daysToCheck = ['tue', 'wed', 'thu', 'fri', 'sat'];
              const validDates = [];

              daysToCheck.forEach(day => {
                const checkbox = recDoc.querySelector(`#custrecord_crs_attendee_${day}_fs_inp`);
                if (checkbox && checkbox.checked) {
                  const calcDate = new Date(weekEndingDate);
                  calcDate.setDate(weekEndingDate.getDate() + dayOffsets[day]);
                  validDates.push(calcDate);
                }
              });

              if (validDates.length > 0) {
                validDates.sort((a,b) => a - b);
                const first = validDates[0];
                const last = validDates[validDates.length - 1];
                
                rec.iso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}-${String(first.getDate()).padStart(2, '0')}`;
                
                const m1 = first.getMonth() + 1, d1 = first.getDate(), y1 = first.getFullYear();
                const m2 = last.getMonth() + 1, d2 = last.getDate();

                if (validDates.length === 1) {
                  rec.date = `${m1}/${d1}/${y1}`;
                } else if (m1 === m2) {
                  rec.date = `${m1}/${d1} - ${m1}/${d2}/${y1}`;
                } else {
                  rec.date = `${m1}/${d1} - ${m2}/${d2}/${y1}`;
                }
              }
            }
          } catch(e) {}
        }
      }

      cache.eventAttendance.set(clientId, results);
      return results;
    }

    async function fetchAttendeeRecord(attendee) {
      const attendeeId = attendee.id;
      try {
        const res = await fetch('/app/common/custom/custrecordentry.nl?rectype=56&id=' + attendeeId);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        // ==== EXACT DOM EXTRACTION FOR COURSE ATTENDEES (INSPECTOR PANEL) ====
        const exactStatus = extractAttendeeStatus(doc);

        let weekEndingDate = null;
        const weekEndingEl = doc.querySelector('#custrecord_crs_attendee_week_ending_display');
        if (weekEndingEl && weekEndingEl.value) {
          weekEndingDate = new Date(weekEndingEl.value);
        }

        if (weekEndingDate && !isNaN(weekEndingDate.getTime())) {
          const dayOffsets = { 'tue': -8, 'wed': -7, 'thu': -6, 'fri': -5, 'sat': -4 };
          const daysToCheck = ['tue', 'wed', 'thu', 'fri', 'sat'];
          const validDates = [];

          daysToCheck.forEach(day => {
            const checkbox = doc.querySelector(`#custrecord_crs_attendee_${day}_fs_inp`);
            if (checkbox && checkbox.checked) {
              const calcDate = new Date(weekEndingDate);
              calcDate.setDate(weekEndingDate.getDate() + dayOffsets[day]);
              validDates.push(calcDate);
            }
          });

          if (validDates.length > 0) {
            validDates.sort((a,b) => a - b);
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
        // ==== END EXACT DOM EXTRACTION ====

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
            // NEW: Update the display name with the fetched uir-record-id
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
              editUrl: detectedContactId ? `/app/common/entity/contact.nl?id=${detectedContactId}&selectedtab=custom26&e=T` : ''
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
            editUrl: detectedContactId ? `/app/common/entity/contact.nl?id=${detectedContactId}&selectedtab=custom26&e=T` : ''
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

    /* Active Delegator Rehook Mechanism */
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
