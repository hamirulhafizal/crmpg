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

function extractCustomerIdFromHref(href) {
  if (!href) return '';
  try {
    var u = new URL(href, window.location.origin);
    var id = u.searchParams.get('customer_id') || u.searchParams.get('filter_customer_id');
    return id && String(id).trim() ? String(id).trim() : '';
  } catch (e) {
    return '';
  }
}

function resolveCurrentCustomerId(root) {
  root = root || document;

  var input = root.querySelector('input[name="current-customer-id"]');
  if (input && input.value && String(input.value).trim()) {
    return String(input.value).trim();
  }

  try {
    var currentUrl = new URL(window.location.href);
    var fromUrl =
      currentUrl.searchParams.get('customer_id') ||
      currentUrl.searchParams.get('filter_customer_id');
    if (fromUrl && String(fromUrl).trim()) return String(fromUrl).trim();
  } catch (e) { /* ignore */ }

  var links = root.querySelectorAll('a[href*="customer_id="], a[href*="filter_customer_id="]');
  for (var i = 0; i < links.length; i++) {
    var fromLink = extractCustomerIdFromHref(links[i].getAttribute('href') || '');
    if (fromLink) return fromLink;
  }

  var headers = root.querySelectorAll('th[onclick*="viewDownline("]');
  for (var j = 0; j < headers.length; j++) {
    var onclick = headers[j].getAttribute('onclick') || '';
    var match = /viewDownline\s*\(\s*['"]([^'"]+)['"]/.exec(onclick);
    if (match && match[1] && String(match[1]).trim()) return String(match[1]).trim();
  }

  return '';
}

function getVisibleGroupDetailTable(root) {
  root = root || document;
  var inContainer = root.querySelector('#group_detail_info_table table.business-center-data-table');
  if (inContainer) return inContainer;

  var tables = root.querySelectorAll('.business-center-data-table');
  if (tables.length > 1) return tables[1];
  if (tables.length === 1) return tables[0];
  return null;
}

function readVisibleGroupDetailRows() {
  return parseGroupDetailTableRows(getVisibleGroupDetailTable(document));
}

function getDownlineSyncContext() {
  return {
    customerId: resolveCurrentCustomerId(document),
    visibleRowCount: readVisibleGroupDetailRows().length
  };
}
