/* Pure view selection: no network calls, no relation inference in the browser. */
(function (root) {
  const providers = ['google', 'yahoo', 'massive'];
  const pair = edge => [edge.source, edge.target].sort().join(':');
  function groups(payload) {
    if (payload.source_graphs) return payload.source_graphs;
    const out = {};
    for (const p of providers) {
      const articles = (payload.articles || []).filter(a => a.source.provider === p);
      const ids = new Set(articles.map(a => a.id));
      out[p] = { articles, relations: (payload.relations || []).filter(r => ids.has(r.source) && ids.has(r.target)), total_articles: articles.length };
    }
    return out;
  }
  function select(payload, selected, separate = false, limit = 800) {
    const sourceGraphs = groups(payload), available = selected.filter(p => sourceGraphs[p]);
    const picked = Object.fromEntries(available.map(p => [p, []]));
    // Round-robin prevents a high-volume provider from taking the entire view budget.
    let count = 0;
    for (let i = 0; count < limit; i++) {
      let added = false;
      for (const p of available) {
        const a = sourceGraphs[p].articles[i];
        if (a && count < limit) { picked[p].push(a); count++; added = true; }
      }
      if (!added) break;
    }
    const nodes = new Map(), edges = new Map();
    for (const p of available) {
      const ids = new Set(picked[p].map(a => a.id));
      for (const a of picked[p]) {
        const id = separate ? `${p}::${a.id}` : a.id;
        if (!nodes.has(id)) nodes.set(id, { ...a, id, article_id: a.id, display_provider: p, display_sources: [p] });
        else {
          const existing=nodes.get(id);existing.display_sources.push(p);
          existing.symbols=[...new Set([...(existing.symbols||[]),...(a.symbols||[])])];
          const entities=new Map((existing.entities||[]).map(e=>[e.id,e]));
          for(const e of a.entities||[])if(!entities.has(e.id)||e.method==='provider_ticker')entities.set(e.id,e);
          existing.entities=[...entities.values()];
          const channels=new Map((existing.channels||[]).map(c=>[c.id,c]));
          for(const c of a.channels||[])if(!channels.has(c.id)||c.score>channels.get(c.id).score)channels.set(c.id,c);
          existing.channels=[...channels.values()].sort((a,b)=>b.score-a.score);
          existing.primary_channel=existing.channels[0]?.id || 'other';
          existing.origins=[...new Map([...(existing.origins||[existing.source]),...(a.origins||[a.source])].map(origin=>[JSON.stringify(origin),origin])).values()];
        }
      }
      for (const r of sourceGraphs[p].relations || []) {
        if (!ids.has(r.source) || !ids.has(r.target)) continue;
        const key = separate ? `${p}:${pair(r)}` : pair(r);
        if (!edges.has(key)) edges.set(key, { ...r, id: key, raw_relation: r, scope: p, source_relations:[{provider:p,relation:r}],
          source: separate ? `${p}::${r.source}` : r.source, target: separate ? `${p}::${r.target}` : r.target });
        else edges.get(key).source_relations.push({provider:p,relation:r});
      }
    }
    if (!separate) {
      for (const r of payload.cross_relations || payload.relations || []) {
        if (r.cross_sources && !r.cross_sources.every(p=>selected.includes(p))) continue;
        if (!nodes.has(r.source) || !nodes.has(r.target) || edges.has(pair(r))) continue;
        edges.set(pair(r), { ...r, id: pair(r), raw_relation: r, scope: 'cross' });
      }
    }
    return { articles: [...nodes.values()], relations: [...edges.values()], counts: Object.fromEntries(available.map(p => [p, picked[p].length])) };
  }
  function snapshot(payload, view, selected, separate, search, positions = []) {
    const sourceGraphs = groups(payload), out = {};
    for (const p of selected) {
      const visible = new Set(view.articles.filter(a => a.display_sources.includes(p)).map(a => a.article_id));
      out[p] = { articles: (sourceGraphs[p]?.articles || []).filter(a => visible.has(a.id)),
        relations: view.relations.flatMap(r => (r.source_relations || (r.scope===p?[{provider:p,relation:r.raw_relation}]:[])).filter(item=>item.provider===p).map(item=>item.relation)) };
    }
    return { search, view: { sources: selected, separate, positions }, source_graphs: out,
      cross_relations: view.relations.filter(r => r.scope === 'cross').map(r => r.raw_relation) };
  }
  function linkStyle(edge, measuredLength) {
    const cross=edge.scope==='cross';
    const fallback=edge.type==='shared_entity'?45:80;
    return {distance:cross?Math.max(120,fallback*2):Number.isFinite(measuredLength)?Math.max(10,Math.min(1000,measuredLength)):fallback,strength:cross?.025:.14};
  }
  const api = { select, snapshot, groups, linkStyle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AtlasView = api;
})(globalThis);
