// script.js
// Browser-side XLS/XLSX -> JSONL converter adapted from Python logic.
// Requires SheetJS (xlsx.full.min.js) loaded in index.html.

(function () {
  // Utility helpers
  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'number' && isNaN(value)) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') {
      if (value instanceof Date) return isNaN(value.getTime());
      return Object.keys(value).length === 0;
    }
    return false;
  }

  function _to_string_id(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return String(value);
    if (value instanceof Date) return String(value.valueOf());
    return String(value);
  }

  function _to_string_list(value) {
    if (isEmpty(value)) return null;
    if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
    return [String(value)];
  }

  function _to_unix_timestamp_ms(value) {
    if (isEmpty(value)) return null;
    if (value instanceof Date) {
      if (isNaN(value.getTime())) return null;
      return value.getTime();
    }
    if (typeof value === 'number') {
      if (value > 1e12) return Math.floor(value);
      if (value > 1e9) return Math.floor(value * 1000);
    }
    const parsed = Date.parse(String(value));
    if (!isNaN(parsed)) return parsed;
    return null;
  }

  function normalizeKey(k) {
    if (k === undefined || k === null) return '';
    return String(k).replace(/^"+|"+$/g, '').trim();
  }

  function normalizeRowKeys(row) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      out[normalizeKey(k)] = v;
    }
    return out;
  }

  function transformRowToClientJson(rowRaw) {
    const row = normalizeRowKeys(rowRaw);
    const clientData = { objectType: 'client' };

    function addFieldIfNotEmpty(key, value) {
      if (!isEmpty(value)) clientData[key] = value;
    }

    const entityTypeUpper = row['entityType'] ? String(row['entityType']).toUpperCase() : null;

    // Primary fields
    addFieldIfNotEmpty('clientId', row['clientId']);
    addFieldIfNotEmpty('entityType', row['entityType']);
    addFieldIfNotEmpty('status', row['status']);

    // Name fields
    if (entityTypeUpper === 'ORGANISATION' || entityTypeUpper === 'ORGANIZATION') {
      addFieldIfNotEmpty('companyName', row['name']);
    } else {
      addFieldIfNotEmpty('name', row['name']);
      addFieldIfNotEmpty('forename', row['forename']);
      addFieldIfNotEmpty('middlename', row['middlename']);
      addFieldIfNotEmpty('surname', row['surname']);
    }

    // Common fields
    addFieldIfNotEmpty('titles', _to_string_list(row['titles']));
    addFieldIfNotEmpty('suffixes', _to_string_list(row['suffixes']));

    // Person-specific
    if (entityTypeUpper === 'PERSON') {
      let genderValue = row['gender'];
      if (typeof genderValue === 'string' && !isEmpty(genderValue)) genderValue = genderValue.toUpperCase();
      addFieldIfNotEmpty('gender', genderValue);
      addFieldIfNotEmpty('dateOfBirth', row['dateOfBirth'] ? String(row['dateOfBirth']) : null);
      addFieldIfNotEmpty('birthPlaceCountryCode', row['birthPlaceCountryCode']);
      addFieldIfNotEmpty('deceasedOn', row['deceasedOn'] ? String(row['deceasedOn']) : null);
      addFieldIfNotEmpty('occupation', row['occupation']);
      addFieldIfNotEmpty('domicileCodes', _to_string_list(row['domicileCodes']));
      addFieldIfNotEmpty('nationalityCodes', _to_string_list(row['nationalityCodes']));
    }

    // Organisation-specific
    if (entityTypeUpper === 'ORGANISATION' || entityTypeUpper === 'ORGANIZATION') {
      addFieldIfNotEmpty('incorporationCountryCode', row['incorporationCountryCode']);
      addFieldIfNotEmpty('dateOfIncorporation', row['dateOfIncorporation'] ? String(row['dateOfIncorporation']) : null);
    }

    // assessmentRequired boolean parsing
    const assessmentRequiredRawValue = row['assessmentRequired'];
    let assessmentRequiredBoolean = false;
    if (!isEmpty(assessmentRequiredRawValue)) {
      const rawStr = String(assessmentRequiredRawValue).toLowerCase();
      assessmentRequiredBoolean = ['true','1','1.0','t','yes','y'].includes(rawStr);
    }
    if (assessmentRequiredBoolean) addFieldIfNotEmpty('lastReviewed', _to_unix_timestamp_ms(row['lastReviewed']));
    if (!isEmpty(row['periodicReviewStartDate'])) addFieldIfNotEmpty('periodicReviewStartDate', _to_unix_timestamp_ms(row['periodicReviewStartDate']));
    addFieldIfNotEmpty('periodicReviewPeriod', row['periodicReviewPeriod'] ? String(row['periodicReviewPeriod']) : null);
    if (!isEmpty(assessmentRequiredRawValue)) addFieldIfNotEmpty('assessmentRequired', assessmentRequiredBoolean);

    // Addresses
    const currentAddress = {};
    ['Address line1','Address line2','Address line3','Address line4','poBox','city','state','province','postcode','country','countryCode']
      .forEach(k => { if (!isEmpty(row[k])) currentAddress[k==='countryCode'?k:(k==='poBox'?'poBox':k.replace(/\s+/g,'').toLowerCase())] = String(row[k]); });
    if (Object.keys(currentAddress).length > 0) addFieldIfNotEmpty('addresses', [currentAddress]);

    // identityNumbers
    const identityNumbersList = [];
    if (entityTypeUpper === 'ORGANISATION' || entityTypeUpper === 'ORGANIZATION') {
      if (!isEmpty(row['Duns Number'])) identityNumbersList.push({type:'duns', value: _to_string_id(row['Duns Number'])});
      if (!isEmpty(row['National Tax No.'])) identityNumbersList.push({type:'tax_no', value: _to_string_id(row['National Tax No.'])});
      if (!isEmpty(row['Legal Entity Identifier (LEI)'])) identityNumbersList.push({type:'lei', value: _to_string_id(row['Legal Entity Identifier (LEI)'])});
    } else if (entityTypeUpper === 'PERSON') {
      if (!isEmpty(row['National ID'])) identityNumbersList.push({type:'national_id', value: _to_string_id(row['National ID'])});
      if (!isEmpty(row['Driving Licence No.'])) identityNumbersList.push({type:'driving_licence', value: _to_string_id(row['Driving Licence No.'])});
      if (!isEmpty(row['Social Security No.'])) identityNumbersList.push({type:'ssn', value: _to_string_id(row['Social Security No.'])});
      if (!isEmpty(row['Passport No.'])) identityNumbersList.push({type:'passport_no', value: _to_string_id(row['Passport No.'])});
    }
    if (identityNumbersList.length > 0) addFieldIfNotEmpty('identityNumbers', identityNumbersList);

    // aliases
    const aliasColumns = ['aliases1','aliases2','aliases3','aliases4'];
    const aliasNameTypes = {'aliases1':'AKA1','aliases2':'AKA2','aliases3':'AKA3','aliases4':'AKA4'};
    const aliasesList = [];
    for (const col of aliasColumns) {
      const val = row[col];
      if (!isEmpty(val)) {
        const nameType = aliasNameTypes[col] || col.toUpperCase();
        if (entityTypeUpper === 'PERSON') aliasesList.push({name:String(val), nameType});
        else aliasesList.push({companyName:String(val), nameType});
      }
    }
    if (aliasesList.length > 0) addFieldIfNotEmpty('aliases', aliasesList);

    // security object
    const securityEnabled = row['Security Enabled'];
    if (!isEmpty(securityEnabled) && ['true','t','1','yes','y'].includes(String(securityEnabled).toLowerCase())) {
      const securityTags = {};
      if (!isEmpty(row['Tag 1'])) securityTags.orTags1 = row['Tag 1'];
      if (!isEmpty(row['Tag 2'])) securityTags.orTags2 = row['Tag 2'];
      if (!isEmpty(row['Tag 3'])) securityTags.orTags3 = row['Tag 3'];
      clientData.security = securityTags;
    }

    return clientData;
  }

  function init() {
    const fileInput = document.getElementById('fileInput');
    const convertBtn = document.getElementById('convertBtn');
    const outputEl = document.getElementById('output');
    const downloadLink = document.getElementById('downloadLink');

    convertBtn.addEventListener('click', () => {
      if (!fileInput.files || fileInput.files.length === 0) {
        alert('Please choose an XLS/XLSX file first.');
        return;
      }

      const file = fileInput.files[0];
      const reader = new FileReader();

      reader.onload = function (e) {
        const data = e.target.result;
        const workbook = XLSX.read(data, {type: 'array', cellDates: true});
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        const rows = XLSX.utils.sheet_to_json(sheet, {defval: null, raw: false});
        const transformedRaw = rows.map(transformRowToClientJson);

        // Filter valid rows
        const transformed = transformedRaw.filter(record => {
          const hasEntityType = record.entityType && !isEmpty(record.entityType);
          const hasNameInfo = ['name','forename','surname','companyName'].some(k => record[k] && !isEmpty(record[k]));
          return hasEntityType || hasNameInfo;
        });

        if (transformed.length === 0) {
          outputEl.textContent = 'No valid rows found for conversion.';
          downloadLink.style.display = 'none';
          return;
        }

        const jsonlLines = transformed.map(rec => JSON.stringify(rec));
        const jsonlContent = jsonlLines.join('\n');

        outputEl.textContent = jsonlContent.slice(0,4000) + (jsonlContent.length>4000?'\n\n...preview truncated...':'');
        const blob = new Blob([jsonlContent], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        downloadLink.href = url;
        downloadLink.download = file.name.replace(/\.[^/.]+$/, '') + '.jsonl';
        downloadLink.style.display = 'inline-block';
        downloadLink.textContent = 'Download JSONL file';
      };

      reader.readAsArrayBuffer(file);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
