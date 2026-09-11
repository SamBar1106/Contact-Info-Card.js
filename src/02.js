      } else if (s.includes('attend') || s.includes('complet') || s.includes('present')) {
        bg = 'rgba(59, 130, 246, 0.2)'; color = 'rgb(96, 165, 250)'; border = 'rgba(59, 130, 246, 0.4)';
      } else if (s.includes('wait')) {
        bg = 'rgba(168, 85, 247, 0.2)'; color = 'rgb(192, 132, 252)'; border = 'rgba(168, 85, 247, 0.4)';
      } else if (s.includes('sched')) {
        bg = 'rgba(245, 158, 11, 0.2)'; color = 'rgb(251, 191, 36)'; border = 'rgba(245, 158, 11, 0.4)';
      } else if (s.includes('reg') || s.includes('enroll')) {
        bg = 'rgba(20, 184, 166, 0.2)'; color = 'rgb(45, 212, 191)'; border = 'rgba(20, 184, 166, 0.4)';
      } else if (s.includes('pend') || s.includes('tentat') || s.includes('standby') || s.includes('invited')) {
        bg = 'rgba(6, 182, 212, 0.2)'; color = 'rgb(103, 232, 249)'; border = 'rgba(6, 182, 212, 0.4)';
      } else if (s.includes('declin') || s.includes('refus')) {
        bg = 'rgba(156, 163, 175, 0.2)'; color = 'rgb(209, 213, 219)'; border = 'rgba(156, 163, 175, 0.4)';
      }

      return `<span class="pill" style="background:${bg}; color:${color}; border:1px solid ${border}; font-size:10px; font-weight:700;">${status}</span>`;
    }

    /* Standalone 30-Day Office Outlook Window Scanner */
    btnScan60d.onclick = async () => {
      if (!activeClientInternalId) {
        alert('Please click on an attendee or client on the board first.');
        return;
      }

      const scanClientId = activeClientInternalId;
      const scanClientName = activeClientName || 'Selected Client';
      const scanContactId = activeContactId;
      const scanContactName = activeContactName;

      const outWidth = 920;
      const outHeight = 670;
      const currX = window.screenX !== undefined ? window.screenX : window.screenLeft;
      const currY = window.screenY !== undefined ? window.screenY : window.screenTop;
      const outLeft = Math.max(10, currX - outWidth - 15 >= 0 ? currX - outWidth - 15 : 20);
      const outTop = Math.max(20, currY);

      if (outlookWindow && !outlookWindow.closed) {
        outlookWindow.focus();
      } else {
        outlookWindow = window.open('', 'NSOutlook60DayWindow', `popup=1,width=${outWidth},height=${outHeight},left=${outLeft},top=${outTop},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=no`);
      }

      if (!outlookWindow) {
        alert('Pop-up Blocked! Please allow pop-ups to view the 30-Day Office Outlook.');
        return;
      }

      const outDoc = outlookWindow.document;
      outDoc.open();
      outDoc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>30-Day Outlook • ${scanClientName}</title>
          <style>
            * { box-sizing: border-box; }
            html, body {
              margin: 0; padding: 0; width: 100%; height: 100%;
              overflow: hidden; background: rgb(18, 18, 20);
              font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
              font-size: 13px; color: rgb(244, 244, 245);
              user-select: text; -webkit-user-select: text;
              display: flex; flex-direction: column;
            }
            ::-webkit-scrollbar { width: 6px; height: 6px; }
            ::-webkit-scrollbar-track { background: transparent; }
            ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

            .nav-bar {
              display: flex; justify-content: space-between; align-items: center;
              padding: 10px 14px; background: rgba(24, 24, 27, 0.98);
              border-bottom: 1px solid rgba(255, 255, 255, 0.12); flex-shrink: 0;
            }
            .btn {
              padding: 5px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;
              border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.08);
              color: rgb(250, 250, 250); text-decoration: none; transition: all 0.2s ease;
            }
            .btn:hover { background: rgba(255, 255, 255, 0.15); }
            .pill {
              display: inline-block; padding: 3px 8px; border-radius: 999px;
              font-size: 10px; font-weight: 700; text-transform: uppercase;
              letter-spacing: 0.5px; white-space: nowrap;
            }
            .contact-link {
              font-weight: 700; color: white; text-decoration: none; cursor: pointer;
              transition: color 0.15s ease;
            }
            .contact-link:hover {
              color: #38bdf8; text-decoration: underline;
            }
            .status-edit-link {
              display: inline-block; cursor: pointer; text-decoration: none !important;
            }
            .status-edit-link .pill {
              cursor: pointer !important; transition: transform 0.15s ease, filter 0.15s ease;
            }
            .status-edit-link:hover .pill {
              transform: scale(1.05); filter: brightness(1.25);
            }
            .table-wrap { flex: 1; overflow-y: auto; padding: 12px; }
            .table-60d { width: 100%; border-collapse: collapse; font-size: 12px; }
            .table-60d th {
              position: sticky; top: 0; background: rgb(24, 24, 27); z-index: 10;
              padding: 10px 8px; text-align: left; color: rgb(161, 161, 170);
              font-weight: 700; border-bottom: 2px solid rgba(255, 255, 255, 0.14);
            }
            .table-60d td {
              padding: 9px 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);
              vertical-align: middle; color: rgb(244, 244, 245);
            }
            .table-60d tr:hover { background: rgba(255, 255, 255, 0.035); }
          </style>
        </head>
        <body>
          <div class="nav-bar">
            <div>
              <div style="font-weight:700; font-size:14px; color:#38bdf8;">📅 Office 30-Day Attendance Outlook</div>
              <div id="out-client-header" style="font-size:11px; color:rgb(161,161,170); margin-top:2px;">Client: ${scanClientName}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button id="out-btn-copy-sched" class="btn" style="background:rgba(251,191,36,0.15); color:#fbbf24; border:1px solid rgba(251,191,36,0.4);" title="Copy grouped Scheduled contacts and dates">📋 Copy Scheduled</button>
              <button id="out-btn-close" class="btn">✕ Close</button>
            </div>
          </div>

          <div id="out-progress-box" style="padding:8px 14px; font-size:11px; color:rgb(251,191,36); background:rgba(251,191,36,0.08); border-bottom:1px solid rgba(251,191,36,0.2); display:flex; align-items:center; gap:8px;">
            <span>Resolving contact schedules and statuses: </span>
            <strong id="out-progress-count">0 / 0</strong>
          </div>

          <div class="table-wrap">
            <table class="table-60d">
              <thead>
                <tr>
                  <th style="width:25%;">Attendee</th>
                  <th style="width:30%;">Course / Seminar</th>
                  <th style="width:16%;">Date</th>
                  <th style="width:12%;">Status</th>
                  <th style="width:9%;">Timeline</th>
                  <th style="width:8%;">Actions</th>
                </tr>
              </thead>
              <tbody id="out-tbody">
                <tr><td colspan="6" style="text-align:center; color:rgb(161,161,170); padding:30px;">Discovering office contacts (Relationships subtab)...</td></tr>
              </tbody>
            </table>
          </div>
        </body>
        </html>
      `);
      outDoc.close();

      const outCloseBtn = outDoc.getElementById('out-btn-close');
      if (outCloseBtn) outCloseBtn.onclick = () => { outlookWindow.close(); };

      const outCopySchedBtn = outDoc.getElementById('out-btn-copy-sched');
      const progressBox = outDoc.getElementById('out-progress-box');
      const progressCount = outDoc.getElementById('out-progress-count');
      const tbody = outDoc.getElementById('out-tbody');

      let currentUpcomingEvents = [];

      function copyToClipboard(textToCopy) {
        if (outlookWindow.navigator && outlookWindow.navigator.clipboard && outlookWindow.navigator.clipboard.writeText) {
          return outlookWindow.navigator.clipboard.writeText(textToCopy).catch(() => fallbackCopy(textToCopy));
        }
        return fallbackCopy(textToCopy);
      }

      function fallbackCopy(textToCopy) {
        try {
          const ta = outDoc.createElement('textarea');
          ta.value = textToCopy;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          outDoc.body.appendChild(ta);
          ta.select();
          outDoc.execCommand('copy');
          ta.remove();
          return Promise.resolve();
        } catch (e) {
          return Promise.reject(e);
        }
      }

      if (outCopySchedBtn) {
        outCopySchedBtn.onclick = async () => {
          const scheduledOnly = currentUpcomingEvents.filter(ev => {
            const s = (ev.status || '').trim().toLowerCase();
            const t = (ev.title || '').trim().toLowerCase();

            if (s.includes('change') || s.includes('resched') || t.includes('schedule change') || t.includes('sched change')) {
              return false;
            }

            return s === 'scheduled' || (s.startsWith('sched') && !s.includes('change'));
          });

          if (!scheduledOnly.length) {
            const orig = outCopySchedBtn.textContent;
            outCopySchedBtn.textContent = 'None Scheduled';
            setTimeout(() => { outCopySchedBtn.textContent = orig; }, 2000);
            return;
          }

          const courseGroups = new Map();
          scheduledOnly.forEach(ev => {
            const courseTitle = ev.title || 'Scheduled Seminar';
            if (!courseGroups.has(courseTitle)) {
              courseGroups.set(courseTitle, []);
            }
            courseGroups.get(courseTitle).push(`${ev.contactName} - ${ev.dateStr}`);
          });

          const outputBlocks = [];
          for (const [courseTitle, attendees] of courseGroups.entries()) {
            outputBlocks.push(`${courseTitle}\n` + attendees.join('\n'));
          }
          const exportText = outputBlocks.join('\n\n');

          try {
            await copyToClipboard(exportText);
            const orig = outCopySchedBtn.textContent;
            outCopySchedBtn.textContent = `✓ Copied (${scheduledOnly.length})!`;
            outCopySchedBtn.style.color = '#4ade80';
            outCopySchedBtn.style.borderColor = 'rgba(74, 222, 128, 0.5)';
            setTimeout(() => {
              outCopySchedBtn.textContent = orig;
              outCopySchedBtn.style.color = '#fbbf24';
              outCopySchedBtn.style.borderColor = 'rgba(251, 191, 36, 0.4)';
            }, 2500);
          } catch (err) {
            alert('Failed to copy to clipboard:\n\n' + exportText);
          }
        };
      }

      try {
        const [contacts, clientAttendance] = await Promise.all([
          getAllClientContacts(scanClientId),
          getAllAttendance(scanClientId).catch(() => [])
        ]);

        if (scanContactId && !contacts.some(c => c.id === scanContactId)) {
          contacts.push({ id: scanContactId, name: scanContactName || 'Selected Attendee', position: '' });
        }

        if (outlookWindow.closed) return;

        if (!contacts.length) {
          progressBox.style.display = 'none';
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:rgb(248,113,113); padding:30px;">No registered contacts found under Relationships tab.</td></tr>';
          return;
        }

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const thirtyDaysOut = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000));

        const upcomingEvents = [];
        let processedCount = 0;
        progressCount.textContent = `0 / ${contacts.length}`;

        const chunkSize = 2;
        for (let i = 0; i < contacts.length; i += chunkSize) {
          if (outlookWindow.closed) return;
          const chunk = contacts.slice(i, i + chunkSize);

          await Promise.all(chunk.map(async (contact) => {
            const pdfUrl = `/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=${contact.id}`;
            
            const [schedRecords, pdfLines] = await Promise.all([
              getContactSchedulingRecords(contact.id).catch(() => []),
              extractLinesFromPdf(pdfUrl).catch(() => [])
            ]);

            // 1. Process records discovered directly from contact scheduling subtabs
            schedRecords.forEach(rec => {
              if (rec.iso) {
                const p = rec.iso.split('-').map(Number);
                const dt = new Date(p[0], p[1] - 1, p[2]);

                if (!isNaN(dt.getTime()) && dt >= now && dt <= thirtyDaysOut) {
                  const diffDays = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
                  const k = `${contact.id}_${rec.title}_${rec.iso}`;

                  if (!upcomingEvents.some(x => x.key === k)) {
                    upcomingEvents.push({
                      key: k,
                      contactName: contact.name,
                      contactId: contact.id,
                      position: contact.position || 'Contact',
                      title: rec.title,
                      dateStr: rec.rawDate,
                      iso: rec.iso,
                      status: rec.status || 'Scheduled',
                      editUrl: rec.editUrl || '',
                      timestamp: dt.getTime(),
                      diffDays,
                      pdfUrl
                    });
                  }
                }
              }
            });

            // 2. Correlate with PDF text extract layer and enrich missing edit links
            for (let lineIdx = 0; lineIdx < pdfLines.length; lineIdx++) {
              const line = pdfLines[lineIdx];
              const dateInfo = extractDateFromLine(line);

              if (dateInfo && dateInfo.iso) {
                const p = dateInfo.iso.split('-').map(Number);
                const dt = new Date(p[0], p[1] - 1, p[2]);

                if (!isNaN(dt.getTime()) && dt >= now && dt <= thirtyDaysOut) {
                  const diffDays = Math.ceil((dt - now) / (1000 * 60 * 60 * 24));
                  let cleanTitle = line.replace(dateInfo.rawDate, '')
                                       .replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled|schedule\s*change|the|on|dates?)\b/gi, '')
                                       .replace(/[^a-zA-Z0-9\s&/'"-]/g, ' ')
                                       .replace(/\s+/g, ' ')
                                       .trim();

                  if (cleanTitle.length < 4) {
                    const prevLine = lineIdx > 0 ? pdfLines[lineIdx - 1] : '';
                    const nextLine = lineIdx + 1 < pdfLines.length ? pdfLines[lineIdx + 1] : '';

                    if (prevLine && !extractDateFromLine(prevLine)) {
                      cleanTitle = prevLine.replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled)\b/gi, '').trim();
                    } else if (nextLine && !extractDateFromLine(nextLine)) {
                      cleanTitle = nextLine.replace(/\b(edit|view|scheduled|confirmed|completed|rescheduled)\b/gi, '').trim();
                    } else {
                      cleanTitle = 'Scheduled Seminar';
                    }
                  }

                  const matchedSchedule = schedRecords.find(sr => 
                    (sr.iso && sr.iso === dateInfo.iso) || 
                    areDatesSameWeek(sr.iso, dateInfo.iso) ||
                    (sr.title && cleanTitle && (sr.title.toLowerCase().includes(cleanTitle.toLowerCase()) || cleanTitle.toLowerCase().includes(sr.title.toLowerCase())))
                  );

                  const matchedClientAtt = clientAttendance.find(ca =>
                    (ca.contactId === contact.id || (ca.contactName && ca.contactName.toLowerCase().includes(contact.name.toLowerCase()))) &&
                    ((ca.date && dateInfo.rawDate && ca.date.includes(dateInfo.rawDate)) || areDatesSameWeek(normalizeDate(ca.date), dateInfo.iso) ||
                     (ca.eventTitle && cleanTitle && (ca.eventTitle.toLowerCase().includes(cleanTitle.toLowerCase()) || cleanTitle.toLowerCase().includes(ca.eventTitle.toLowerCase()))))
                  );

                  const resolvedEdit = matchedSchedule?.editUrl || matchedClientAtt?.editUrl || '';
                  const resolvedStatus = matchedSchedule?.status || matchedClientAtt?.status || 'Scheduled';

                  const k = `${contact.id}_${cleanTitle}_${dateInfo.iso}`;
                  const existingIdx = upcomingEvents.findIndex(x => x.key === k || (x.contactId === contact.id && (x.iso === dateInfo.iso || areDatesSameWeek(x.iso, dateInfo.iso))));

                  if (existingIdx !== -1) {
                    if (resolvedStatus && (!upcomingEvents[existingIdx].status || upcomingEvents[existingIdx].status === 'Scheduled')) {
                      upcomingEvents[existingIdx].status = resolvedStatus;
                    }
                    if (resolvedEdit && !upcomingEvents[existingIdx].editUrl) {
                      upcomingEvents[existingIdx].editUrl = resolvedEdit;
                    }
                  } else {
                    upcomingEvents.push({
                      key: k,
                      contactName: contact.name,
                      contactId: contact.id,
                      position: contact.position || 'Contact',
                      title: cleanTitle,
                      dateStr: dateInfo.rawDate,
                      iso: dateInfo.iso,
                      status: resolvedStatus,
                      editUrl: resolvedEdit,
                      timestamp: dt.getTime(),
                      diffDays,
                      pdfUrl
                    });
                  }
                }
              }
            }

            processedCount++;
            if (!outlookWindow.closed) {
              progressCount.textContent = `${processedCount} / ${contacts.length}`;
            }
          }));
        }

        if (outlookWindow.closed) return;
        progressBox.style.display = 'none';

        if (!upcomingEvents.length) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:rgb(161,161,170); padding:30px;">No upcoming sessions scheduled in the next 60 days for this office.</td></tr>';
          return;
        }

        upcomingEvents.sort((a, b) => a.timestamp - b.timestamp);
        currentUpcomingEvents = upcomingEvents;

        tbody.innerHTML = upcomingEvents.map(ev => {
          let badge = `<span class="pill" style="background:rgba(56,189,248,0.2); color:#38bdf8; border:1px solid rgba(56,189,248,0.4);">In ${ev.diffDays} day(s)</span>`;
          if (ev.diffDays === 0) badge = `<span class="pill" style="background:rgba(34,197,94,0.25); color:#4ade80; border:1px solid rgba(34,197,94,0.6);">Today</span>`;
          else if (ev.diffDays === 1) badge = `<span class="pill" style="background:rgba(251,191,36,0.2); color:#fbbf24; border:1px solid rgba(251,191,36,0.4);">Tomorrow</span>`;

          const fullPdfUrl = toAbsoluteNsUrl(ev.pdfUrl);
          const fullContactUrl = toAbsoluteNsUrl('/app/common/entity/contact.nl?id=' + ev.contactId);
          
          let rawEdit = ev.editUrl;
          if (!rawEdit && ev.contactId) {
            rawEdit = `/app/common/entity/contact.nl?id=${ev.contactId}&selectedtab=custom26&e=T`;
          }
          const fullEditUrl = toAbsoluteNsUrl(rawEdit);

          return `
            <tr>
              <td>
                <a href="${fullContactUrl}" target="_blank" class="contact-link" title="Open Contact File">${ev.contactName} ↗</a>
                <div style="font-size:10px; color:rgb(161,161,170);">${ev.position}</div>
              </td>
              <td style="font-weight:600; color:#fbbf24;">${ev.title}</td>
              <td style="white-space:nowrap;">${ev.dateStr}</td>
              <td style="white-space:nowrap;">
                <a href="${fullEditUrl}" data-action-edit="${fullEditUrl}" target="_blank" class="status-edit-link" title="Click to open Edit record">
                  ${getStatusBadge(ev.status || 'Scheduled')}
                </a>
              </td>
              <td style="white-space:nowrap;">${badge}</td>
              <td style="white-space:nowrap;">
                <button class="pill" style="cursor:pointer; background:rgba(192,132,252,0.2); color:rgb(192,132,252); border:1px solid rgba(192,132,252,0.4);" data-action-pdf="${fullPdfUrl}" data-action-name="${ev.contactName}">📄 PDF</button>
              </td>
            </tr>
          `;
        }).join('');

        tbody.querySelectorAll('.status-edit-link').forEach(link => {
          link.onclick = (e) => {
            const editUrl = link.getAttribute('data-action-edit') || link.getAttribute('href');
            if (!editUrl) return;

            const curX = outlookWindow.screenX !== undefined ? outlookWindow.screenX : outlookWindow.screenLeft;
            const curY = outlookWindow.screenY !== undefined ? outlookWindow.screenY : outlookWindow.screenTop;
            const curW = outlookWindow.outerWidth || 920;

            let targetLeft = curX + curW + 15;
            if (targetLeft + 860 > (window.screen.availWidth || 1920)) {
              targetLeft = Math.max(10, curX - 875);
              if (targetLeft <= 10) targetLeft = Math.max(20, curX + 30);
            }
            const targetTop = Math.max(20, curY);

            const winFeatures = `popup=1,width=860,height=820,left=${targetLeft},top=${targetTop},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;

            try {
              const editWin = outlookWindow.open(editUrl, 'NSEditRecordWindow_' + Date.now(), winFeatures);
              if (editWin && !editWin.closed) {
                editWin.focus();
                e.preventDefault();
                return;
              }
            } catch (err) {}

            try {
              const rootWin = window.opener || window;
              const editWin = rootWin.open(editUrl, 'NSEditRecordWindow_' + Date.now(), winFeatures);
              if (editWin && !editWin.closed) {
                editWin.focus();
                e.preventDefault();
                return;
              }
            } catch (err) {}
          };
        });

        tbody.querySelectorAll('[data-action-pdf]').forEach(btn => {
          btn.onclick = () => {
            activePdfUrl = btn.getAttribute('data-action-pdf');
            activeContactName = btn.getAttribute('data-action-name');
            openPdfPiP();
          };
        });

      } catch (err) {
        if (!outlookWindow.closed) {
          progressBox.style.display = 'none';
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:rgb(248,113,113); padding:30px;">Scan failed: ${err.message}</td></tr>`;
        }
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

    async function getSeminarPiPWindow() {
      if (seminarPipWin && !seminarPipWin.closed) {
        seminarPipWin.focus();
        return seminarPipWin;
      }

      const pipApi = window.opener?.documentPictureInPicture || window.documentPictureInPicture;
      if (!pipApi) {
        console.warn('Chrome Document Picture-in-Picture is not supported in this browser.');
        return null;
      }

      try {
        seminarPipWin = await pipApi.requestWindow({ width: 440, height: 500 });
        const pipDoc = seminarPipWin.document;
        pipDoc.title = 'Seminar Attendees (Always-on-Top)';

        const origin = getNsOrigin();
        if (origin && !pipDoc.querySelector('base')) {
          const baseEl = pipDoc.createElement('base');
          baseEl.href = origin + '/';
          pipDoc.head.appendChild(baseEl);
        }

        const s = pipDoc.createElement('style');
        s.textContent = `
          * { box-sizing: border-box; }
          html, body {
            margin: 0; padding: 0; width: 100%; height: 100%;
            overflow: hidden; background: rgb(18, 18, 20);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
            font-size: 13px; color: rgb(244, 244, 245);
            user-select: text !important; -webkit-user-select: text !important;
          }
          ::-webkit-scrollbar { width: 5px; height: 5px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 999px; }

          .pip-nav {
            display: flex; justify-content: space-between; align-items: center;
            padding: 8px 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);
            background: rgba(24, 24, 27, 0.98); flex-shrink: 0;
            user-select: none; -webkit-user-select: none;
          }
          .pip-body {
            padding: 12px; height: calc(100% - 45px); overflow-y: auto;
            display: flex; flex-direction: column; gap: 10px;
          }
          .glass-card {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px; padding: 10px 12px;
            user-select: text !important; -webkit-user-select: text !important;
          }
          .card-contact { border-left: 3px solid rgb(129, 140, 248); }
          .pill {
            display: inline-block; padding: 2px 7px; border-radius: 999px;
            font-size: 10px; font-weight: 700; text-transform: uppercase;
            background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.18);
            color: rgb(228, 228, 231); letter-spacing: 0.5px; white-space: nowrap;
            user-select: none; -webkit-user-select: none;
          }
          .field-label {
            font-size: 10px; text-transform: uppercase; font-weight: 700;
            color: rgb(161, 161, 170); letter-spacing: 0.6px; margin-bottom: 2px;
            user-select: text !important; -webkit-user-select: text !important;
          }
          .field-value {
            font-size: 12px; color: rgb(250, 250, 250); font-weight: 500; word-break: break-word;
            user-select: text !important; -webkit-user-select: text !important; cursor: text;
          }
          .contact-card-info {
            user-select: text !important; -webkit-user-select: text !important; cursor: text;
          }
          a { color: rgb(250, 250, 250); text-decoration: none; cursor: pointer; }
          a:hover { color: rgb(56, 189, 248); }
        `;
        pipDoc.head.appendChild(s);

        pipDoc.body.innerHTML = `
          <div class="pip-nav">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-weight:700; color:rgb(251, 191, 36); font-size:12px;">📅 Seminar Attendees</span>
              <span id="pip-contacts-count" class="pill" style="background:rgba(251, 191, 36, 0.2); color:rgb(251, 191, 36);">-</span>
            </div>
            <span class="pill" style="background:rgba(34, 197, 94, 0.2); color:rgb(74, 222, 128); border-color:rgba(34, 197, 94, 0.4);">● Pin</span>
          </div>
          <div class="pip-body">
            <div class="glass-card" style="border-left: 3px solid rgb(251, 191, 36);">
              <div class="field-label" style="color:rgb(251, 191, 36);">Scheduled Seminar</div>
              <div id="pip-event-title" class="field-value" style="font-size:13px; font-weight:700;">Loading...</div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px; padding-top:6px; border-top:1px solid rgba(255, 255, 255, 0.08);">
                <span style="font-size:11px; color:rgb(161, 161, 170);" id="pip-event-client">Client: -</span>
                <span style="font-size:11px; color:rgb(228, 228, 231);" id="pip-event-dates">-</span>
              </div>
            </div>
            <div class="field-label" style="color:rgb(255, 255, 255); margin-top:4px;">Attending Contacts</div>
            <div id="pip-event-contacts-list" style="display:flex; flex-direction:column; gap:8px;">
              <div style="color:rgb(161, 161, 170);">Querying records...</div>
            </div>
          </div>
        `;

        seminarPipWin.addEventListener('pagehide', () => { seminarPipWin = null; });
        return seminarPipWin;
      } catch (err) {
        console.error('Failed to open Document Picture-in-Picture window:', err);
        return null;
      }
    }

    function closeSeminarPiP() {
      if (seminarPipWin && !seminarPipWin.closed) {
        seminarPipWin.close();
        seminarPipWin = null;
      }
    }

    async function renderSeminarInPiP(list, title, clientName, dates) {
      const win = await getSeminarPiPWindow();
      if (!win) return;
      const d = win.document;

      d.getElementById('pip-event-title').textContent = title;
      d.getElementById('pip-event-client').textContent = 'Client: ' + clientName;
      d.getElementById('pip-event-dates').innerHTML = dates;
      d.getElementById('pip-contacts-count').textContent = list.length + ' attendee(s)';

      const listContainer = d.getElementById('pip-event-contacts-list');
      if (!list.length) {
        listContainer.innerHTML = '<div style="color:rgb(161, 161, 170);">No matching contacts recorded.</div>';
        return;
      }

      listContainer.innerHTML = list.map(item => {
        const s = (item.status || '').toLowerCase();
        let cardBorder = '';
        if (s.includes('noshow') || s.includes('no show') || s.includes('no-show') || s === 'ns' || s.includes('did not attend') || s.includes('absent')) {
          cardBorder = 'border-left: 3px solid rgb(248, 113, 113) !important;';
        } else if (s.includes('resched') || s.includes('re-sched') || s.includes('schedule change') || s.includes('sched change')) {
          cardBorder = 'border-left: 3px solid rgb(251, 146, 60) !important;';
        } else if (s.includes('cancel') || s.includes('cxl')) {
          cardBorder = 'border-left: 3px solid rgb(239, 68, 68) !important;';
        } else if (s.includes('confirm')) {
          cardBorder = 'border-left: 3px solid rgb(74, 222, 128) !important;';
        } else if (s.includes('attend') || s.includes('complet') || s.includes('present')) {
          cardBorder = 'border-left: 3px solid rgb(96, 165, 250) !important;';
        } else if (s.includes('wait')) {
          cardBorder = 'border-left: 3px solid rgb(192, 132, 252) !important;';
        }

        const rawEditTarget = item.editUrl || (item.contactId ? '/app/common/entity/contact.nl?id=' + item.contactId + '&selectedtab=custom26&e=T' : '');
        const fullEditUrl = toAbsoluteNsUrl(rawEditTarget);
        const fullContactUrl = toAbsoluteNsUrl(item.contactId ? '/app/common/entity/contact.nl?id=' + item.contactId : '');

        return `
          <div class="glass-card card-contact" style="padding:10px 12px; ${cardBorder}" data-event-card="${item.contactId || item.contactName}">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <a href="${fullContactUrl || 'javascript:void(0)'}" data-nav-url="${fullContactUrl}" target="_blank" rel="noopener noreferrer" style="font-weight:700; font-size:14px; color:white;">${item.contactName}</a>
              <div style="display:flex; align-items:center; gap:4px;">
                ${item.contactId ? `<span class="pill" style="cursor:pointer; background:rgba(192,132,252,0.2); color:rgb(192,132,252); border:1px solid rgba(192,132,252,0.4);" data-pdf-contact="${item.contactId}" data-pdf-name="${item.contactName}">📄 PDF</span>` : ''}
                ${fullEditUrl ? `<a href="${fullEditUrl}" data-nav-url="${fullEditUrl}" target="_blank" rel="noopener noreferrer" class="pill ns-pip-action-link" style="cursor:pointer; background:rgba(255, 255, 255, 0.12); color:rgb(244, 244, 245); border:1px solid rgba(255, 255, 255, 0.35); text-decoration:none;" title="Open Record in Edit Mode">EDIT ↗</a>` : ''}
                ${getStatusBadge(item.status || 'Status Unknown')}
              </div>
            </div>
            <div style="font-size:12px; font-weight:600; color:rgb(251, 191, 36); margin-top:2px;">${item.eventTitle || title}</div>
            <div class="contact-card-info" style="font-size:11px; margin-top:4px; border-top:1px solid rgba(255,255,255,0.06); padding-top:4px;">Loading contact details...</div>
          </div>
        `;
      }).join('');

      listContainer.querySelectorAll('[data-pdf-contact]').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const cId = btn.getAttribute('data-pdf-contact');
          const cNm = btn.getAttribute('data-pdf-name');
          if (cId) {
            activeContactId = cId;
            activeContactName = cNm;
            activePdfUrl = toAbsoluteNsUrl('/app/site/hosting/scriptlet.nl?script=customscript_scs_contact_sched_20_pdf_sl&deploy=customdeploy_scs_contact_sched_20_pdf_sl&contactId=' + cId);
            openPdfPiP();
          }
        };
      });

      listContainer.querySelectorAll('.ns-pip-action-link, a[data-nav-url]').forEach(a => {
        a.onclick = (e) => {
          const targetUrl = a.getAttribute('data-nav-url') || a.getAttribute('href');
          if (!targetUrl || targetUrl === 'javascript:void(0)' || targetUrl.startsWith('#')) return;

          try {
            const rootWin = window.opener?.opener || window.opener || window;
            if (rootWin && !rootWin.closed) {
              rootWin.open(targetUrl, '_blank');
              e.preventDefault();
              return;
            }
          } catch (err) {}
        };
      });

      list.forEach(item => {
        if (!item.contactId) return;
        getContactData(item.contactId).then(cData => {
          const card = listContainer.querySelector(`[data-event-card="${item.contactId || item.contactName}"] .contact-card-info`);
          if (card) {
            const phoneStr = cData.phone ? `<a href="tel:${cData.phone}">${cData.phone}</a>` : '-';
            const emailStr = cData.email ? `<a href="mailto:${cData.email}">${cData.email}</a>` : '-';
            card.innerHTML = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;"><div>Phone: ${phoneStr}</div><div>Email: ${emailStr}</div></div>`;
          }
        });
      });
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

