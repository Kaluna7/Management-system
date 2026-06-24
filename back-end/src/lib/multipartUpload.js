const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

function multerErrorMessage(err, maxCount, fileLabel) {
  if (err.code === "LIMIT_FILE_SIZE") {
    return "File too large (max 30 MB per file).";
  }
  if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
    return `Maximum ${maxCount} ${fileLabel} allowed per upload.`;
  }
  return err.message || "Upload failed.";
}

/**
 * Accept multipart uploads for one or more field names (e.g. agreementFiles + legacy agreementFile).
 * Avoids multer LIMIT_UNEXPECTED_FILE when exactly maxCount files are sent.
 */
function createBoundedUploadMiddleware({ fieldNames, maxCount, assignKey, fileLabel }) {
  const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
  const nameSet = new Set(names);

  return (req, res, next) => {
    upload.any()(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          message: multerErrorMessage(err, maxCount, fileLabel),
        });
      }

      const all = Array.isArray(req.files) ? req.files : [];
      const uploads = all.filter((f) => nameSet.has(f.fieldname));
      const unexpected = all.filter((f) => !nameSet.has(f.fieldname));

      if (unexpected.length > 0) {
        return res.status(400).json({
          message: `Unexpected file field: ${unexpected[0].fieldname}`,
        });
      }
      if (uploads.length > maxCount) {
        return res.status(400).json({
          message: `Maximum ${maxCount} ${fileLabel} allowed per upload.`,
        });
      }

      req[assignKey] = uploads;
      next();
    });
  };
}

const agreementUploadMiddleware = createBoundedUploadMiddleware({
  fieldNames: ["agreementFiles", "agreementFile"],
  maxCount: 5,
  assignKey: "agreementUploads",
  fileLabel: "agreement files",
});

const formulaFormUploadMiddleware = createBoundedUploadMiddleware({
  fieldNames: ["formulaFormFiles", "formulaFormFile"],
  maxCount: 5,
  assignKey: "formulaFormUploads",
  fileLabel: "formula form files",
});

module.exports = {
  agreementUploadMiddleware,
  formulaFormUploadMiddleware,
};
