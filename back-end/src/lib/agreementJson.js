function getAgreementFileNames(record) {
  if (!record) return [];
  const names = record.agreementFileNames;
  if (Array.isArray(names) && names.length > 0) {
    return names.map((n) => String(n).trim()).filter(Boolean);
  }
  const single = record.agreementFileName;
  if (single && String(single).trim()) return [String(single).trim()];
  return [];
}

function applyAgreementFileNamesToRecordData(displayNames) {
  const names = (Array.isArray(displayNames) ? displayNames : [])
    .map((n) => String(n).trim())
    .filter(Boolean);
  return {
    agreementFileName: names[0] ?? "",
    agreementFileNames: names.length > 0 ? names : null,
  };
}

module.exports = {
  getAgreementFileNames,
  applyAgreementFileNamesToRecordData,
};
