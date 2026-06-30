/**
 * Shared PG Mall Group Details table parser.
 * Injected before sync executeScript calls so column mapping follows thead headers.
 */
function normalizeHeader(text) {
  return String(text || '').replace(/\s{2,}/g, ' ').trim().toLowerCase();
}

function toTitleCase(s) {
  if (!s || typeof s !== 'string') return s;
  return s.trim().split(/\s+/).map(function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function parseDirectDebitInfo(rawText) {
  var text = String(rawText || '').replace(/\s{2,}/g, ' ').trim();
  if (!text || /^no$/i.test(text)) {
    return {
      status: 'No',
      amount: null,
      date: null
    };
  }
  var amountMatch = text.match(/rm\s*([\d,]+(?:\.\d+)?)/i);
  var dateMatch = text.match(/(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/);
  return {
    status: 'Yes',
    amount: amountMatch ? amountMatch[1].replace(/,/g, '') : null,
    date: dateMatch ? dateMatch[1] : null
  };
}

function sanitizeTelephone(value) {
  var v = String(value || '').replace(/\s{2,}/g, ' ').trim();
  if (!v || v === '-') return '';
  var digits = v.replace(/\D/g, '');
  if (digits.length < 7) return '';
  return v;
}

function buildColumnIndexMap(table) {
  var map = {};
  var ths = table.querySelectorAll('thead th');
  for (var i = 0; i < ths.length; i++) {
    var key = normalizeHeader(ths[i].textContent);
    if (key) map[key] = i;
  }
  return map;
}

function cellText(cells, idx) {
  if (idx == null || idx < 0 || !cells[idx]) return '';
  return (cells[idx].textContent || '').replace(/\s{2,}/g, ' ').trim();
}

function col(map, cells, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var idx = map[aliases[i]];
    if (idx != null) return cellText(cells, idx);
  }
  return '';
}

function parseGroupDetailTableRows(table) {
  if (!table) return [];
  var tbody = table.querySelector('tbody');
  if (!tbody) return [];

  var columnMap = buildColumnIndexMap(table);
  var trs = tbody.querySelectorAll('tr');
  var rows = [];

  for (var i = 0; i < trs.length; i++) {
    var cells = trs[i].querySelectorAll('td');
    if (cells.length < 5) continue;

    var directDebitRaw = col(columnMap, cells, ['direct debit subscription']);
    var directDebit = parseDirectDebitInfo(directDebitRaw);
    var telephone = sanitizeTelephone(col(columnMap, cells, ['telephone', 'phone']));

    var row = {
      PGCode: col(columnMap, cells, ['pgcode']),
      Email: col(columnMap, cells, ['email']),
      Name: toTitleCase(col(columnMap, cells, ['name'])),
      'D.O.B.': col(columnMap, cells, ['d.o.b.', 'dob']),
      Rank: col(columnMap, cells, ['rank']),
      Telephone: telephone,
      'Total Frontline': col(columnMap, cells, ['total frontline']),
      'Empire Size': col(columnMap, cells, ['empire size']),
      'Date Register': col(columnMap, cells, ['date register']),
      'Last Purchase Date': col(columnMap, cells, ['last purchase date'])
    };

    var profileVerified = col(columnMap, cells, ['profile verified status', 'profile verified']);
    if (profileVerified) row['Profile Verified'] = profileVerified;

    var parentName = col(columnMap, cells, ['parent name']);
    if (parentName) row['Parent Name'] = toTitleCase(parentName);

    var branch = col(columnMap, cells, ['branch']);
    if (branch) row.Branch = branch;

    var nationality = col(columnMap, cells, ['nationality']);
    if (nationality) row.Nationality = nationality;

    if (directDebitRaw || columnMap['direct debit subscription'] != null) {
      row['Direct Debit Subscription'] = directDebit.status;
      row['Direct Debit Amount'] = directDebit.amount;
      row['Direct Debit Date'] = directDebit.date;
    }

    rows.push(row);
  }

  return rows;
}
