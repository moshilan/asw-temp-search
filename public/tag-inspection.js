export function correctionFor(item, records) {
  const record = records?.[item.hash];
  return record?.resolvedCategory && record.resolvedCategory !== record.originalCategory ? record : null;
}

export function onlyCorrected(items, records) {
  return items.filter(item => correctionFor(item, records));
}

export function correctionSummary(record) {
  const votes = record.tagVotes || {};
  return `${record.resolvedCategory}（原：${record.originalCategory}） · 标签纠正`;
}

export function voteSummary(record) {
  const votes = record.tagVotes || {};
  return `耽美${votes.耽美 || 0} / GL${votes.GL || 0} / 男生${votes.男生 || 0} / 言情${votes.言情 || 0}`;
}
