// -----------------------------
// Helpers
// -----------------------------

// Convert a raw value into a list of trimmed strings
function _to_string_list(raw) {
  if (!raw) return [];

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // Already an array? Normalize it.
  if (Array.isArray(raw)) {
    return raw.map(v => String(v).trim()).filter(Boolean);
  }

  // Anything else → wrap as string
  return [String(raw)];
}

// Convert a date string to epoch ms (ASAM format)
function _to_epoch(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d.getTime();
}


// -----------------------------
// Process XLS file
// -----------------------------

function handleFileImport(file, callback) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });

    const firstSheet = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheet];

    // Convert sheet → array of objects
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

    callback(rows);
  };

  reader.readAsArrayBuffer(file);
}


// -----------------------------
// Convert rows → JSONL
// -----------------------------

function convertToJSONL(rows) {
  const jsonlLines = [];

  rows.forEach(row => {
    const client = {};

    // Basic fields
    client.objectType = "client";
    client.clientId = row["clientId"] || "";
    client.entityType = row["entityType"] || "";
    client.status = row["status"] || "";
    client.segment = row["segment"] || "";
    client.assessmentRequired = row["assessmentRequired"] === "true" || row["assessmentRequired"] === true;

    // Personal details
    client.name = row["name"] || "";
    client.forename = row["forename"] || "";
    client.middlename = row["middlename"] || "";
    client.surname = row["surname"] || "";

    // Titles / suffixes MUST BE arrays
    const titles = _to_string_list(row["titles"]);
    if (titles.length > 0) client.titles = titles;

    const suffixes = _to_string_list(row["suffixes"]);
    if (suffixes.length > 0) client.suffixes = suffixes;

    // Gender
    if (row["gender"]) client.gender = row["gender"];

    // Dates
    const dob = _to_epoch(row["dateOfBirth"]);
    if (dob) client.dateOfBirth = row["dateOfBirth"];

    const deceased = _to_epoch(row["deceasedOn"]);
    if (deceased) client.deceasedOn = row["deceasedOn"];

    // Birth country
    if (row["birthPlaceCountryCode"])
      client.birthPlaceCountryCode = row["birthPlaceCountryCode"];

    // Occupation
    if (row["occupation"])
      client.occupation = row["occupation"];

    // Arrays
    const domicileList = _to_string_list(row["domicileCodes"]);
    if (domicileList.length > 0) client.domicileCodes = domicileList;

    const nationalityList = _to_string_list(row["nationalityCodes"]);
    if (nationalityList.length > 0) client.nationalityCodes = nationalityList;

    // Review dates
    const lastReviewed = _to_epoch(row["lastReviewed"]);
    if (lastReviewed) client.lastReviewed = lastReviewed;

    const reviewStart = _to_epoch(row["periodicReviewStartDate"]);
    if (reviewStart) client.periodicReviewStartDate = reviewStart;

    if (row["periodicReviewPeriod"])
      client.periodicReviewPeriod = row["periodicReviewPeriod"];

    // Address (only 1 for this simplified template)
    const address = {
      line1: row["address.line1"] || "",
      poBox: row["address.poBox"] || "",
      city: row["address.city"] || "",
      province: row["address.province"] || "",
      country: row["address.country"] || "",
      countryCode: row["address.countryCode"] || ""
    };

    // Only attach address if at least one value is filled
    if (Object.values(address).some(v => v.trim() !== "")) {
      client.addresses = [address];
    }

    // Aliases
    const alias1 = row["alias1"];
    const alias2 = row["alias2"];
    const alias3 = row["alias3"];

    const aliases = [];
    if (alias1) aliases.push({ name: alias1, nameType: "AKA1" });
    if (alias2) aliases.push({ name: alias2, nameType: "AKA2" });
    if (alias3) aliases.push({ name: alias3, nameType: "AKA3" });

    if (aliases.length > 0) client.aliases = aliases;

    // Convert object → JSON line
    jsonlLines.push(JSON.stringify(client));
  });

  return jsonlLines.join("\n");
}


// -----------------------------
// UI Logic (Upload + Convert Button)
// -----------------------------

let importedRows = [];

// Handle file upload
document.getElementById("fileInput").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;

  handleFileImport(file, rows => {
    importedRows = rows;
    document.getElementById("output").textContent = "File loaded. Click Convert to generate JSONL.";
  });
});


// Handle Convert button
document.getElementById("convertBtn").addEventListener("click", function () {
  if (importedRows.length === 0) {
    alert("Please upload an XLS file first.");
    return;
  }

  const jsonl = convertToJSONL(importedRows);

  // Show in <pre>
  document.getElementById("output").textContent = jsonl;

  // Enable download
  const blob = new Blob([jsonl], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const link = document.getElementById("downloadLink");
  link.href = url;
  link.download = "clients.jsonl";
  link.style.display = "inline-block";
});
