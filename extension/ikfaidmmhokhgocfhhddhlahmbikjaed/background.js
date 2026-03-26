// ================= BUTTONS =================
const downloadCustomer = document.getElementById("btn-download-customer");
const downloadSales = document.getElementById("btn-download-sales");
const downloadGroupSales = document.getElementById("btn-download-group-sales");
const downloadPgmall = document.getElementById("btn-download-pgmall");
const downloadAutodebit = document.getElementById("btn-download-autodebit");

// ================= COMMON XLSX HELPER =================
function exportXLSX(data, filename, textCols = []) {
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Force TEXT type for selected columns
    textCols.forEach(col => {
        const colLetter = XLSX.utils.encode_col(col);
        Object.keys(ws).forEach(cell => {
            if (cell.startsWith(colLetter)) {
                ws[cell].t = 's';
            }
        });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, filename);
}

// ================= CHROME SCRIPT EXEC =================
async function runInActiveTab(fn) {
    let [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    chrome.scripting.executeScript({
        target: {tabId: tab.id},
        function: fn
    });
}

/** Run a function in the active tab and return its result (for sync). */
function runInActiveTabWithResult(fn) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs || !tabs[0]) {
                reject(new Error('No active tab'));
                return;
            }
            chrome.scripting.executeScript({
                target: {tabId: tabs[0].id},
                function: fn
            }, (results) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (results && results[0] && results[0].result !== undefined) {
                    resolve(results[0].result);
                } else {
                    reject(new Error('No data from page'));
                }
            });
        });
    });
}

/** Injected into pgmall.my to return customer rows as array of objects for sync. */
function getCustomerRowsForSync() {
    function toTitleCase(s) {
        if (!s || typeof s !== 'string') return s;
        return s.trim().split(/\s+/).map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }).join(' ');
    }
    const company = document.querySelector('#company_select') && document.querySelector('#company_select').value;
    const tables = document.querySelectorAll('.business-center-data-table');
    const table = tables[1];
    if (!table) return [];
    const tbody = table.querySelector('tbody');
    if (!tbody) return [];
    const trs = tbody.querySelectorAll('tr');
    const rows = [];
    const isCompany1 = company === '1';
    for (let i = 0; i < trs.length; i++) {
        const td = trs[i].querySelectorAll('td');
        if (td.length < 5) continue;
        const get = (idx) => (td[idx] && td[idx].textContent && td[idx].textContent.replace(/\s{2,}/g, ' ').trim()) || '';
        if (isCompany1) {
            rows.push({
                PGCode: get(1),
                Email: get(2),
                'Profile Verified': get(3),
                Name: toTitleCase(get(4)),
                'Parent Name': toTitleCase(get(5)),
                'D.O.B.': get(6),
                Rank: get(7),
                Branch: get(8),
                Telephone: get(9),
                'Total Frontline': get(10),
                'Empire Size': get(11),
                'Date Register': get(12),
                'Last Purchase Date': get(13)
            });
        } else {
            rows.push({
                PGCode: get(1),
                Email: get(2),
                Name: toTitleCase(get(3)),
                'D.O.B.': get(4),
                Rank: get(5),
                Telephone: get(6),
                'Total Frontline': get(7),
                'Empire Size': get(8),
                'Date Register': get(9),
                'Last Purchase Date': get(10)
            });
        }
    }
    return rows;
}

// ================= POPUP COMM =================
document.addEventListener('DOMContentLoaded', function () {
    const port = chrome.runtime.connect();
    document.getElementById('popupBtn')?.addEventListener('click', () => {
        port.postMessage({from: 'popup', start: 'Y'});
    });
});

// ================= DOWNLOAD CUSTOMER =================
downloadCustomer.addEventListener("click", () => runInActiveTab(() => {

    const company = $('#company_select').val();
    const tables = $('.business-center-data-table');
    const table = tables.eq(1);
    const data = [];

    if (company === '1') {
        data.push([
            'PGCode', 'Email', 'Profile Verified', 'Name', 'Parent Name',
            'D.O.B.', 'Rank', 'Branch', 'Telephone',
            'Total Frontline', 'Empire Size', 'Date Register',
            'Last Purchase Date', 'Autodebit', 'Amount', 'Date'
        ]);

        table.find("tbody>tr").each((_, tr) => {

            let auto = $(tr).find("td:eq(14)").text();
            let isAuto = 'No', amount = '', date = '';

            if (!auto.includes('No')) {
                const lines = auto.split(/\r?\n/);
                if (lines.length > 11) {
                    isAuto = 'Yes';
                    amount = lines[8].replace('RM', '').replace(',', '').trim();
                    date = lines[11].trim();
                }
            }

            data.push([
                $(tr).find("td:eq(1)").text(),
                $(tr).find("td:eq(2)").text(),
                $(tr).find("td:eq(3)").text(),
                $(tr).find("td:eq(4)").text(),
                $(tr).find("td:eq(5)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(6)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(7)").text(),
                $(tr).find("td:eq(8)").text().replace(/\s{2,}/g, '').replace(',', ''),
                $(tr).find("td:eq(9)").text().replace(/\s{2,}/g, '').trim(),
                $(tr).find("td:eq(10)").text(),
                $(tr).find("td:eq(11)").text(),
                $(tr).find("td:eq(12)").text(),
                $(tr).find("td:eq(13)").text(),
                isAuto,
                amount,
                date
            ]);
        });

        exportXLSX(data, 'customer.xlsx', [0, 8]);

    } else {
        data.push([
            'PGCode', 'Email', 'Name', 'D.O.B.', 'Rank',
            'Telephone', 'Total Frontline', 'Empire Size',
            'Date Register', 'Last Purchase Date'
        ]);

        table.find("tbody>tr").each((_, tr) => {
            data.push([
                $(tr).find("td:eq(1)").text(),
                $(tr).find("td:eq(2)").text(),
                $(tr).find("td:eq(3)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(4)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(5)").text(),
                $(tr).find("td:eq(6)").text().replace(/\s{2,}/g, '').trim(),
                $(tr).find("td:eq(7)").text().replace(/\s{2,}/g, ''),
                $(tr).find("td:eq(8)").text(),
                $(tr).find("td:eq(9)").text(),
                $(tr).find("td:eq(10)").text()
            ]);
        });

        exportXLSX(data, 'customer.xlsx', [0, 5]);
    }
}));

// ================= DOWNLOAD SALES =================
downloadSales.addEventListener("click", () => runInActiveTab(() => {

    const data = [];

    $("#personal_sales_table>tbody>tr").each((_, tr) => {
        let split = $(tr).find("td:eq(3)").text().split('(');
        data.push([
            $(tr).find("td:eq(0)").text(),
            $(tr).find("td:eq(1)").text(),
            $(tr).find("td:eq(2)").text(),
            split[0].trim(),
            split[1]?.replace(')', '').trim(),
            $(tr).find("td:eq(4)").text().replace(/\s{2,}/g, '').trim(),
            $(tr).find("td:eq(5)").text().replace(/\s{2,}/g, '').replace(',', '')
        ]);
    });

    exportXLSX(data, 'sales.xlsx', [5]);
}));

// ================= DOWNLOAD GROUP SALES =================
downloadGroupSales.addEventListener("click", () => runInActiveTab(() => {

    const data = [];

    $("#group_sales_table>tbody>tr").each((_, tr) => {
        let split = $(tr).find("td:eq(0)").text().split('(');
        data.push([
            split[0].trim(),
            split[1]?.replace(')', '').trim(),
            $(tr).find("td:eq(1)").text(),
            $(tr).find("td:eq(2)").text().replace(/\s{2,}/g, '').replace(',', '')
        ]);
    });

    exportXLSX(data, 'group_sales.xlsx', [1]);
}));

// ================= DOWNLOAD PGMALL =================
downloadPgmall.addEventListener("click", () => runInActiveTab(() => {

    const data = [];

    $("#personal_sales_active_ratio_table>tbody>tr").each((_, tr) => {
        data.push([
            $(tr).find("td:eq(1)").text().trim(),
            $(tr).find("td:eq(2)").text().trim(),
            $(tr).find("td:eq(3)").text(),
            $(tr).find("td:eq(4)").text(),
            $(tr).find("td:eq(5)").text(),
            $(tr).find("td:eq(6)").text(),
            $(tr).find("td:eq(7)").text().replace(',', ''),
            $(tr).find("td:eq(8)").text().replace(',', ''),
            $(tr).find("td:eq(9)").text()
        ]);
    });

    exportXLSX(data, 'pgmall.xlsx');
}));

// ================= DOWNLOAD AUTODEBIT =================
downloadAutodebit.addEventListener("click", () => runInActiveTab(() => {

    const data = [
        ['PGCode', 'Name', 'Telephone', 'Autodebit', 'Amount', 'Date']
    ];

    $("#gsap_direct_debit_table>tbody>tr").each((_, tr) => {
        let split = $(tr).find("td:eq(0)").text().split('(');
        data.push([
            split[0].trim(),
            split[1]?.replace(')', '').trim(),
            $(tr).find("td:eq(1)").text().replace(/\s{2,}/g, '').trim(),
            $(tr).find("td:eq(3)").text(),
            $(tr).find("td:eq(5)").text().replace(',', ''),
            $(tr).find("td:eq(2)").text()
        ]);
    });

    exportXLSX(data, 'autodebit.xlsx', [1, 2]);
}));

// ================= SYNC TO SUPABASE =================
(function () {
    const btnSync = document.getElementById('btn-sync-supabase');
    const syncProgress = document.getElementById('syncProgress');
    const syncProgressFill = document.getElementById('syncProgressFill');
    const syncProgressText = document.getElementById('syncProgressText');

    if (!btnSync || !syncProgress) return;

    function setProgress(pct, text) {
        if (syncProgressFill) syncProgressFill.style.width = (pct || 0) + '%';
        if (syncProgressText) syncProgressText.textContent = text || '';
    }

    function parseDate(val) {
        if (!val) return null;
        if (typeof val !== 'string') val = String(val).trim();
        else val = val.trim();
        if (!val) return null;
        var iso = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return val;
        // Example: "Mar 26, 2025"
        var mon = val.match(/^([A-Za-z]{3,})\s+(\d{1,2}),\s+(\d{4})$/);
        if (mon) {
            var monthName = String(mon[1]).toLowerCase();
            var day = parseInt(mon[2], 10);
            var year = parseInt(mon[3], 10);
            var monthMap = {
                jan: 1, january: 1,
                feb: 2, february: 2,
                mar: 3, march: 3,
                apr: 4, april: 4,
                may: 5,
                jun: 6, june: 6,
                jul: 7, july: 7,
                aug: 8, august: 8,
                sep: 9, sept: 9, september: 9,
                oct: 10, october: 10,
                nov: 11, november: 11,
                dec: 12, december: 12
            };
            var mNum = monthMap[monthName];
            if (mNum) {
                return year + '-' + String(mNum).padStart(2, '0') + '-' + String(day).padStart(2, '0');
            }
        }
        var slash = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (slash) {
            var d = parseInt(slash[1], 10);
            var m = parseInt(slash[2], 10);
            var y = parseInt(slash[3], 10);
            if (m > 12) { d = slash[2]; m = slash[1]; }
            return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        }
        return null;
    }

    /**
     * True when last purchase YYYY-MM-DD falls in the current calendar month (Malaysia),
     * matching app logic for Active / monthly buyer.
     */
    function isLastPurchaseInCurrentMalaysiaMonth(isoDateStr) {
        if (!isoDateStr || typeof isoDateStr !== 'string') return false;
        var match = isoDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!match) return false;
        var ly = parseInt(match[1], 10);
        var lm = parseInt(match[2], 10);
        var fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: 'numeric' });
        var parts = fmt.formatToParts(new Date());
        var cy = parseInt(parts.find(function (p) { return p.type === 'year'; }).value, 10);
        var cm = parseInt(parts.find(function (p) { return p.type === 'month'; }).value, 10);
        return ly === cy && lm === cm;
    }

    function buildCustomerPayload(row, processed, userId) {
        var name = row.Name || row.name || null;
        var dob = row['D.O.B.'] || row['D.O.B'] || row.DOB || row.dob || null;
        var pgCode = row.PGCode || row.pg_code || null;
        var email = row.Email || row.email || null;
        var phone = row.Telephone || row.phone || null;
        var mainFields = ['name', 'dob', 'email', 'phone', 'location', 'gender', 'ethnicity', 'age', 'prefix', 'first_name', 'sender_name', 'save_name', 'pg_code', 'Name', 'Email', 'Telephone', 'D.O.B.', 'PGCode', 'Gender', 'Ethnicity', 'Age', 'Prefix', 'FirstName', 'SenderName', 'SaveName', 'Location'];
        var originalData = {};
        Object.keys(row).forEach(function (k) {
            if (mainFields.indexOf(k) === -1 && k !== 'id' && k !== 'user_id') originalData[k] = row[k];
        });
        var lastPurchaseIso = parseDate(row['Last Purchase Date'] || row['last_purchase_date'] || null);
        var payload = {
            user_id: userId,
            name: name,
            dob: parseDate(dob),
            email: email,
            phone: phone,
            location: row.Location || row.location || null,
            gender: (processed && processed.Gender) || row.Gender || null,
            ethnicity: (processed && processed.Ethnicity) || row.Ethnicity || null,
            age: (processed && processed.Age) != null ? processed.Age : (row.Age != null ? row.Age : null),
            prefix: (processed && processed.Prefix) || row.Prefix || null,
            first_name: (processed && processed.FirstName) || row.FirstName || null,
            sender_name: (processed && processed.SenderName) || row.SenderName || null,
            save_name: (processed && processed.SaveName) || row.SaveName || null,
            pg_code: pgCode,
            last_purchase_at: lastPurchaseIso,
            is_monthly_buyer: isLastPurchaseInCurrentMalaysiaMonth(lastPurchaseIso),
            original_data: Object.keys(originalData).length ? originalData : null
        };
        return payload;
    }

    btnSync.addEventListener('click', async function () {
        var config = typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG : {};
        var supabaseUrl = config.SUPABASE_URL;
        var anonKey = config.SUPABASE_ANON_KEY;
        var webappOrigin = (config.WEBAPP_ORIGIN || '').replace(/\/$/, '');
        if (!supabaseUrl || !anonKey || !webappOrigin) {
            alert('Extension config missing: set SUPABASE_URL, SUPABASE_ANON_KEY and WEBAPP_ORIGIN in config.js');
            return;
        }

        var session = await new Promise(function (resolve) {
            chrome.storage.local.get('supabase_session', function (data) {
                resolve(data.supabase_session || null);
            });
        });
        if (!session || !session.access_token || !session.user || !session.user.id) {
            alert('Please sign in first.');
            return;
        }

        var userId = session.user.id;
        var accessToken = session.access_token;

        btnSync.disabled = true;
        syncProgress.style.display = 'block';
        setProgress(0, 'Reading page...');

        var rows;
        try {
            rows = await runInActiveTabWithResult(getCustomerRowsForSync);
        } catch (e) {
            syncProgress.style.display = 'none';
            btnSync.disabled = false;
            alert('Could not read customer data. Open the PG Mall business center page and try again.');
            return;
        }

        if (!rows || rows.length === 0) {
            setProgress(100, 'No rows found.');
            syncProgress.style.display = 'none';
            btnSync.disabled = false;
            return;
        }

        var total = rows.length;
        var processed = 0;
        var inserted = 0;
        var updated = 0;

        var pgCodes = rows.map(function (r) { return (r.PGCode || r.pg_code || '').trim(); }).filter(Boolean);
        var existingMap = {};
        if (pgCodes.length > 0) {
            setProgress(2, 'Checking existing...');
            var url = supabaseUrl + '/rest/v1/customers?user_id=eq.' + userId + '&select=id,pg_code';
            var headers = { apikey: anonKey, Authorization: 'Bearer ' + accessToken };
            if (pgCodes.length <= 100) {
                url += '&pg_code=in.(' + pgCodes.map(function (c) { return '"' + c.replace(/"/g, '""') + '"'; }).join(',') + ')';
            }
            try {
                var res = await fetch(url, { headers: headers });
                if (res.ok) {
                    var list = await res.json();
                    (list || []).forEach(function (c) {
                        if (c.pg_code) existingMap[c.pg_code] = c.id;
                    });
                }
            } catch (e) { /* ignore */ }
            if (pgCodes.length > 100) {
                for (var b = 0; b < pgCodes.length; b += 100) {
                    var batch = pgCodes.slice(b, b + 100);
                    var batchUrl = supabaseUrl + '/rest/v1/customers?user_id=eq.' + userId + '&pg_code=in.(' + batch.map(function (c) { return '"' + c.replace(/"/g, '""') + '"'; }).join(',') + ')&select=id,pg_code';
                    var r = await fetch(batchUrl, { headers: headers });
                    if (r.ok) {
                        var arr = await r.json();
                        (arr || []).forEach(function (c) { if (c.pg_code) existingMap[c.pg_code] = c.id; });
                    }
                }
            }
        }

        for (var i = 0; i < rows.length; i++) {
            var pct = 5 + Math.round((85 * (i + 1)) / total);
            setProgress(pct, 'Processing row ' + (i + 1) + ' of ' + total + '...');

            var row = rows[i];
            var processResult = null;
            try {
                var pr = await fetch(webappOrigin + '/api/openai/process-row', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rowData: row, rowNumber: i + 1 })
                });
                var data = await pr.json();
                if (pr.ok && data && data.result) {
                    processResult = data.result;
                }
            } catch (e) { /* use row only */ }

            var payload = buildCustomerPayload(row, processResult, userId);
            var pgCode = (payload.pg_code || '').trim();
            var existingId = pgCode ? existingMap[pgCode] : null;

            try {
                if (existingId) {
                    var patchRes = await fetch(supabaseUrl + '/rest/v1/customers?id=eq.' + existingId, {
                        method: 'PATCH',
                        headers: {
                            apikey: anonKey,
                            Authorization: 'Bearer ' + accessToken,
                            'Content-Type': 'application/json',
                            Prefer: 'return=minimal'
                        },
                        body: JSON.stringify(payload)
                    });
                    if (patchRes.ok) updated++;
                } else {
                    var postRes = await fetch(supabaseUrl + '/rest/v1/customers', {
                        method: 'POST',
                        headers: {
                            apikey: anonKey,
                            Authorization: 'Bearer ' + accessToken,
                            'Content-Type': 'application/json',
                            Prefer: 'return=representation'
                        },
                        body: JSON.stringify(payload)
                    });
                    if (postRes.ok) {
                        var created = await postRes.json();
                        if (created && created[0] && created[0].id) {
                            inserted++;
                            if (pgCode) existingMap[pgCode] = created[0].id;
                        }
                    }
                }
            } catch (e) { /* skip row */ }
            processed++;
            await new Promise(function (r) { setTimeout(r, 80); });
        }

        setProgress(100, 'Done: ' + inserted + ' added, ' + updated + ' updated.');
        triggerConfetti();
        setTimeout(function () {
            syncProgress.style.display = 'none';
        }, 3000);
    });

    function triggerConfetti() {
        if (typeof JSConfetti === 'undefined') return;
        try {
            var jsConfetti = window._syncConfetti || (window._syncConfetti = new JSConfetti());
            jsConfetti.addConfetti({
                // emojis: ['🎊', '👏', '🥳', '🎉', '🚀'],
                confettiColors: ['#0ea5e9', '#0284c7', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#ec4899'],
                confettiNumber: 120
            });
        } catch (e) {}
    }

    var btnTestConfetti = document.getElementById('btn-test-confetti');
    if (btnTestConfetti) {
        btnTestConfetti.addEventListener('click', triggerConfetti);
    }
})();
