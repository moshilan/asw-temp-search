function recordFor(item, records) {
  const record = records?.[item.hash];
  return record?.resolvedCategory && record.resolvedCategory !== record.originalCategory ? record : null;
}

function danmeiScore(record) {
  return (record.tagVotes?.耽美 || 0) + (record.tagVotes?.GL || 0);
}

export function onlySuspected(items, records) {
  return items.filter(item => recordFor(item, records));
}

export function sortSuspected(items, records) {
  return [...items].sort((a, b) => danmeiScore(recordFor(b, records)) - danmeiScore(recordFor(a, records)) || (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
}

export function suspectedRecord(item, records) {
  return recordFor(item, records);
}

export function suggestedCategory(record) {
  return record.resolvedCategory;
}

export function voteSummary(record) {
  const votes = record.tagVotes || {};
  return `言情${votes.言情 || 0} / 耽美${votes.耽美 || 0} / GL${votes.GL || 0} / 男生${votes.男生 || 0}`;
}
