(function(root, factory){
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DBOutlook = api;
})(typeof window !== 'undefined' ? window : this, function(){
  var labels = ['Independent','Democrat','Republican','Progressive','Conservative','Liberal','Centrist','Libertarian','Socialist','Capitalist','Leftist','Right-wing','Green','Unaffiliated','Still exploring'];
  function label(value){ return labels.indexOf(value) >= 0 ? value : ''; }
  function text(value){ return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240) : ''; }
  function read(profile){
    var p = profile || {};
    return { label: label(p.publicIdeology), belief: p.publicBeliefPublished === true ? text(p.publicBelief) : '' };
  }
  function esc(s){ return String(s || '').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function html(outlook){
    var o = outlook || {};
    return (label(o.label) ? '<span class="outlook-label">'+esc(o.label)+'</span>' : '')
      + (text(o.belief) ? '<p class="outlook-belief">'+esc(text(o.belief))+'</p>' : '');
  }
  return { labels: labels, label: label, text: text, read: read, html: html, esc: esc };
});
