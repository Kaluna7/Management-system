const ADMIN_BUYER_ROLES = new Set(["buyers"]);
const ADMIN_FINANCE_ROLES = new Set(["finance_admin"]);

/** Portal task page: invoice saved, stamped paper upload pending. */
const ADMIN_TASK_STATUS = "document_generated";

function effectiveCreatedByRole(record) {
  if (record?.createdByRole) return String(record.createdByRole);
  if (record?.createdByAdmin) return "buyers_admin";
  return "buyers";
}

function isRecordInAdminTask(record) {
  return record?.status === ADMIN_TASK_STATUS;
}

function isAdminCreatedRecord(record) {
  return record?.createdByAdmin === true;
}

function isBuyersPortalTaskRecord(record) {
  return (
    !record?.createdByAdmin &&
    effectiveCreatedByRole(record) === "buyers" &&
    isRecordInAdminTask(record)
  );
}

function isBuyersAdminOwnedRecord(record) {
  return isAdminCreatedRecord(record) && effectiveCreatedByRole(record) === "buyers_admin";
}

function isRecordLockedForEdit(record) {
  if (record.status === "history" || record.publishedAt) return true;
  if (record.status === "archived") return true;
  return false;
}

function isRecordVisibleToAdminRole(record, adminRole) {
  if (adminRole === "finance_admin") {
    return isRecordInAdminTask(record);
  }
  if (adminRole === "buyers_admin") {
    return isBuyersPortalTaskRecord(record) || isBuyersAdminOwnedRecord(record);
  }
  return false;
}

function canAdminMutateRecord(record, adminRole) {
  if (isRecordLockedForEdit(record)) return false;
  if (adminRole === "finance_admin") {
    return isRecordInAdminTask(record);
  }
  if (adminRole === "buyers_admin") {
    if (isBuyersPortalTaskRecord(record)) return true;
    if (isBuyersAdminOwnedRecord(record)) return true;
    return false;
  }
  return false;
}

function adminListWhereForRole(adminRole, includeFinished) {
  if (adminRole === "finance_admin") {
    if (includeFinished) {
      return { status: { in: ["archived", "history"] } };
    }
    return {
      status: ADMIN_TASK_STATUS,
      archivedAt: null,
      publishedAt: null,
    };
  }
  if (adminRole === "buyers_admin") {
    if (includeFinished) {
      return {
        OR: [
          { createdByRole: "buyers_admin", createdByAdmin: true },
          { createdByRole: "buyers", status: { in: ["archived", "history"] } },
        ],
      };
    }
    return {
      OR: [
        {
          createdByAdmin: false,
          status: ADMIN_TASK_STATUS,
          archivedAt: null,
          publishedAt: null,
          OR: [{ createdByRole: "buyers" }, { createdByRole: null }],
        },
        {
          createdByRole: "buyers_admin",
          createdByAdmin: true,
          status: { notIn: ["archived", "history"] },
          archivedAt: null,
          publishedAt: null,
        },
      ],
    };
  }
  return { id: "__none__" };
}

module.exports = {
  ADMIN_TASK_STATUS,
  effectiveCreatedByRole,
  isBuyersPortalTaskRecord,
  isBuyersAdminOwnedRecord,
  isRecordInAdminTask,
  isAdminCreatedRecord,
  isRecordLockedForEdit,
  isRecordVisibleToAdminRole,
  canAdminMutateRecord,
  adminListWhereForRole,
};
