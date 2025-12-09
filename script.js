// Helper: check for empty value
function isEmpty(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

// Helper: convert value to array of strings
function _to_string_list(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map(v => String(v).trim()).filter(v => v !== '');
  if (typeof value === 'string') {
    if (value.includes(',')) {
      return value
        .split(',')
        .map(v => v.trim())
        .filter(v => v !== '');
    }
    return [value.trim()];
  }
  return [String(value).trim()];
}

// Transform each row from XLS into JSON object
function transformRowToClientJson(row) {
  const clientData = {};

  const addFieldIfNotEmpty = (key, value) => {
    if (!isEmpty(value)) clientData[key] = value;
  };

  // Mandatory fields
  clientData.objectType = "client";
  clientData.clientId = row["clientId"];

  // Add fields common to client
  addFieldIfNotEmpty("entityType", row["entityType"]);
  addFieldIfNotEmpty("status", row["status"]);
  addFieldIfNotEmpty("name", row["name"]);
  addFieldIfNotEmpty("forename", row["forename"]);
  addFieldIfNotEmpty("middlename", row["middlename"]);
  addFieldIfNotEmpty("surname", row["surname"]);

  // FIXED: Convert to arrays
  addFieldIfNotEmpty("titles", _to_string_list(row["titles"]));
  addFieldIfNotEmpty("suffixes", _to_string_list(row["suffixes"]));

  addFieldIfNotEmpty("gender", row["gender"]);
  addFieldIfNotEmpty("dateOfBirth", row["dateOfBirth"]);
  addFieldIfNotEmpty("birthPlaceCountryCode", row["birthPlaceCountryCode"]);
  addFieldIfNotEmpty("deceasedOn", row["deceasedOn"]);
  addFieldIfNotEmpty("occupation", row["occupation"]);

  // FIXED: Lists
  addFieldIfNotEmpty("domicileCodes", _to_string_list(row["domicileCodes"]));
  addFieldIfNotEmpty("nationalityCodes", _to_string_list(row["nationalityCodes"]));

  // Dates
  if (!isEmpty(row["lastReviewed"])) {
    clientData.lastReviewed = new Date(row["lastReviewed"]).getTime();
  }
  if (!isEmpty(row["periodicReviewStartDate"])) {
    clientData.periodicReviewStartDate = new Date(row["periodicReviewStartDate"]).getTime();
  }

  addFieldIfNotEmpty("periodicReviewPeriod", row["periodicReviewPeriod"]);
  addFieldIfNotEmpty("segment", row["segment"]);
  addFieldIfNotEmpty("assessmentRequired", row["assessmentRequired"]);

  // Addresses (object)
  if (
    row["address_line1"] ||
    row["address_poBox"] ||
    row["address_city"] ||
    row["address_province"] ||
    row["address_country"] ||
    row["address_countryCode"]
  ) {
    clientData.addresses = [
      {
        line1: row["address_line1"],
        poBox: row["address_poBox"],
        city: row["address_city"],
        province: row["address_province"],
        country: row["address_country"],
        countryCode: row["address_countryCode"]
      }
    ];
  }

  // Aliases list
  const aliasNames = _to_string_list(row["aliases"]);
  if (aliasNames.length > 0) {
    clientData.aliases = aliasNames.map((alias, index) => ({
      name: alias,
      nameType: `AKA${index + 1}`
    }));
  }

  return clientData;
}

// Convert XLS rows to JSONL text
function convertToJSONL(rows) {
  return rows
    .map(row => JSON.stringify(transformRowToClientJson(row)))
    .join("\n");
}

// Parse XLSX file with SheetJS
function handleFileImport(file, callback) {
  const reader = new FileReader();
  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    callback(rows);
  };
  reader.readAsArrayBuffer(file);
}

// Main handler for file upload
document.getElementById("fileInput").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) {
    handleFileImport(file, rows => {
      const jsonl = convertToJSONL(rows);
      document.getElementById("output").value = jsonl;
    });
  }
});
