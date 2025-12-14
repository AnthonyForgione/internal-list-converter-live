/* =========================
   DOM READY
========================= */

document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const convertBtn = document.getElementById("convertBtn");
  const output = document.getElementById("output");
  const downloadLink = document.getElementById("downloadLink");

  convertBtn.addEventListener("click", () => {
    if (!fileInput.files.length) {
      output.textContent = "❌ Please select an Excel file first.";
      return;
    }

    processExcel(fileInput.files[0]);
  });

  /* =========================
     Utilities
  ========================== */

  function isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === "number" && isNaN(value)) return true;
    if (typeof value === "string") {
      const v = value.trim().toLowerCase();
      return v === "" || v === "nan";
    }
    if (Array.isArray(value)) return value.length === 0;
    return false;
  }

  function parsePartialDate(value) {
    if (isEmpty(value)) return null;
    const str = String(value).trim();
    // Match YYYY or YYYY-MM or YYYY-MM-DD
    const match = str.match(/^(\d{4})(?:[-\/](\d{1,2}))?(?:[-\/](\d{1,2}))?$/);
    if (!match) return str; // not a date, return as-is
    const year = match[1];
    const month = match[2] ? match[2].padStart(2,'0') : null;
    const day = match[3] ? match[3].padStart(2,'0') : null;
    return [year, month, day].filter(Boolean).join('-');
  }

  function cleanAndSplit(value) {
    if (isEmpty(value)) return [];
    if (typeof value === "string") {
      if (value.includes(",")) return value.split(",").map(v => v.trim()).filter(Boolean);
      if (value.includes(";")) return value.split(";").map(v => v.trim()).filter(Boolean);
      return [value.trim()];
    }
    return [String(value)];
  }

  function addIfNotEmpty(obj, key, val) {
    if (val !== null && val !== undefined && val !== "" && !(Array.isArray(val) && !val.length)) {
      obj[key] = val;
    }
  }

  /* =========================
     Row transformation
  ========================== */

  function transformRow(row, aliasCols, dateCols) {
    const o = {};

    const getVal = c => {
      if (isEmpty(row[c])) return null;
      // profileId should remain text, dateCols use parsePartialDate
      if (c === "profileId") return String(row[c]).trim();
      if (dateCols.has(c)) return parsePartialDate(row[c]);
      return String(row[c]).trim();
    };

    const getArr = c => cleanAndSplit(row[c]);

    // Simple fields
    [
      "type","profileId","action","activeStatus","name","suffix","gender",
      "profileNotes"
    ].forEach(f => addIfNotEmpty(o, f, getVal(f)));

    // Array fields
    [
      "countryOfRegistrationCode","countryOfAffiliationCode",
      "formerlySanctionedRegionCode","sanctionedRegionCode","enhancedRiskCountryCode",
      "dateOfRegistrationArray","dateOfBirthArray","residentOfCode","citizenshipCode",
      "sources","companyUrls"
    ].forEach(f => addIfNotEmpty(o, f, getArr(f)));

    // Identity numbers
    const ids = [];
    const type = String(o.type || "").toUpperCase();

    const tax = getVal("National Tax No.");
    if (!isEmpty(tax)) ids.push({ type: "tax_no", value: String(tax) });

    if (type === "COMPANY") {
      const duns = getVal("Duns Number");
      const lei = getVal("Legal Entity Identifier (LEI)");
      if (!isEmpty(duns)) ids.push({ type: "duns", value: String(duns) });
      if (!isEmpty(lei)) ids.push({ type: "lei", value: String(lei) });
    }

    if (type === "PERSON") {
      [["National ID","national_id"],
       ["Driving Licence No.","driving_licence"],
       ["Social Security No.","ssn"],
       ["Passport No.","passport_no"]
      ].forEach(([c,t]) => {
        const v = getVal(c);
        if (!isEmpty(v)) ids.push({ type: t, value: String(v) });
      });
    }
    addIfNotEmpty(o, "identityNumbers", ids);

    // Address
    const addr = {};
    if (!isEmpty(row["Address Line"])) addr.line = String(row["Address Line"]);
    if (!isEmpty(row.city)) addr.city = String(row.city);
    if (!isEmpty(row.province)) addr.province = String(row.province);
    if (!isEmpty(row.postCode)) addr.postCode = String(row.postCode).replace(/\.0$/, "");
    if (!isEmpty(row.countryCode)) addr.countryCode = String(row.countryCode).toUpperCase().slice(0,2);
    if (Object.keys(addr).length) o.addresses = [addr];

    // Aliases
    const aliases = [];
    aliasCols.forEach(c => {
      if (!isEmpty(row[c])) aliases.push({ name: String(row[c]), type: "Also Known As" });
    });
    addIfNotEmpty(o, "aliases", aliases);

    // Lists
    const lists = [];
    for (let i=1;i<=4;i++) {
      if (isEmpty(row[`List ${i}`])) continue;
      const e = {};
      const v = getVal(`List ${i}`);
      addIfNotEmpty(e,"id",v);
      addIfNotEmpty(e,"name",v);
      const active = String(row[`Active List ${i}`]).toLowerCase()==="true";
      e.active = active;
      e.listActive = active;
      if (!isEmpty(v)) e.hierarchy=[{id:v,name:v}];
      addIfNotEmpty(e,"since",getVal(`Since List ${i}`));
      addIfNotEmpty(e,"to",getVal(`To List ${i}`));
      lists.push(e);
    }
    addIfNotEmpty(o,"lists",lists);

    return o;
  }

  /* =========================
     File processing
  ========================== */

  async function processExcel(file) {
    try {
      output.textContent = "⏳ Processing file...";
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw:false });

      if (!rows.length) {
        output.textContent = "❌ No rows found in the Excel file.";
        downloadLink.style.display = "none";
        return;
      }

      // Identify alias columns dynamically
      const aliasCols = Object.keys(rows[0]).filter(c => c.toLowerCase().startsWith("aliases") || c.toLowerCase().startsWith("alias"));

      // Identify date columns (partial dates)
      const dateCols = new Set(Object.keys(rows[0]).filter(c => /date/i.test(c)));

      const records = rows.map(r => transformRow(r, aliasCols, dateCols));
      const jsonl = records.map(r => JSON.stringify(r)).join("\n");

      const blob = new Blob([jsonl], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      downloadLink.href = url;
      downloadLink.download = "output.jsonl";
      downloadLink.style.display = "block";
      downloadLink.textContent = "Download JSONL";

      // Preview first 4000 chars
      output.textContent = jsonl.slice(0,4000) + (jsonl.length > 4000 ? "\n\n...preview truncated..." : "");
    } catch (err) {
      output.textContent = "❌ Error: " + err.message;
      console.error(err);
    }
  }
});
