const test=require('node:test'),assert=require('node:assert/strict');
const categories=require('../src/skill-categories.json'),manifest=require('../desktop/skills/filtered/bundle/manifest.json');
test('all shipped skills have a purpose category and consistent tags',()=>{
 assert.equal(Object.keys(categories).length,manifest.skills.length);
 for(const s of manifest.skills){const value=categories['filtered-'+s.id];assert.ok(value,s.id);assert.ok(value.tags.includes(value.group));assert.ok(!/互联网业务|运营岗位| \/ /.test(value.group));}
});
test('ambiguous terms are classified by intended task',()=>{
 for(const [id,group] of Object.entries({'lenny-negotiating-compensation':'职业与招聘','lenny-org-design':'团队与协作','lenny-enterprise-sales-motion':'销售与客户','lenny-ai-evals':'AI与自动化','alexe-apply-jtbd-framework':'产品与策略','weisberg-source-inventory':'数据与分析','aaron-technical-seo-checker':'网站与搜索优化'}))assert.equal(categories['filtered-'+id].group,group,id);
});
