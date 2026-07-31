/**
 * Parse optional page/limit query for list endpoints.
 * Without valid page+limit, returns null (full list, backward compatible).
 */
function parsePagination(query, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const pageRaw = query?.page;
  const limitRaw = query?.limit ?? query?.pageSize;
  if (pageRaw == null && limitRaw == null) return null;

  const page = Math.max(1, parseInt(String(pageRaw ?? "1"), 10) || 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, parseInt(String(limitRaw ?? String(defaultLimit)), 10) || defaultLimit),
  );
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
}

function paginationMeta(total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return {
    total,
    page,
    pageSize: limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

module.exports = {
  parsePagination,
  paginationMeta,
};
