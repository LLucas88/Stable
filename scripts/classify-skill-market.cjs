const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),bundle=path.join(root,'desktop/skills/filtered/bundle');
const rules=[
 ['职业与招聘','career|compensation|salary|hiring|recruit|interview preparation|job search|resume|职业|求职|招聘|薪酬|简历|面试|breaking into product'],
 ['团队与协作','leadership|coaching|org design|organization|organisational|stakeholder|meeting|collaboration|conflict|团队|组织|会议|协作|领导力|沟通|管理者'],
 ['销售与客户','sales|selling|crm|customer success|customer service|account management|销售|客户|客服|商机|成交|谈判'],
 ['会员与用户运营','membership|loyalty|retention|churn|community|会员|私域|社群|复购|留存|流失|用户运营'],
 ['营销与增长','marketing|growth|conversion|seo|advertising|campaign|brand|branding|positioning|营销|增长|转化|广告|品牌|推广|投放|获客'],
 ['电商与门店','ecommerce|e commerce|retail|merchandis|inventory|电商|门店|零售|选品|商品|库存|供应链|采购'],
 ['内容与写作','content creation|copywriting|writing|write article|social media|video|podcast|storytelling|内容|文案|写作|视频|直播|小红书|公众号|抖音|文风|文章|编辑'],
 ['视觉与体验设计','ux|ui design|visual design|design system|usability|design brief|user journey|视觉|界面|交互设计|体验设计|平面设计|图片|海报|设计规范|原型设计'],
 ['调研与洞察','research|interviews|user feedback|qualitative|discovery research|survey|competitive|competitor|调研|洞察|访谈|竞品|问卷|市场研究'],
 ['数据与分析','analytics|data analysis|statistics|forecast|sensitivity|metrics|instrumentation|ab test|a/b|sql|数据分析|统计|预测|指标|埋点|归因|数据清洗|分析模型'],
 ['AI与自动化','artificial intelligence|llm|agent|prompt|ai eval|ai product|ai assisted|automation|machine learning|人工智能|智能体|提示词|自动化|大模型'],
 ['开发与测试','code|coding|programming|debug|testing|software|architecture|technical|deployment|api|开发|编程|代码|测试|架构|部署|技术债'],
 ['文档与办公','document|spreadsheet|presentation|pdf|excel|ppt|notes|knowledge|tooling documentation|文档|表格|演示|办公|知识库|笔记|文件'],
 ['财务与合规','finance|financial|pricing|budget|legal|compliance|security|privacy|risk mitigation|财务|定价|预算|合规|法律|合同|安全|隐私|风控'],
 ['产品与策略','product|strategy|strategic|roadmap|prioriti|requirements|prd|user stories|trade off|validation|产品|策略|战略|需求|优先级|路线图|商业模式|目标|决策']
].map(([category,terms])=>({category,re:new RegExp(terms.split('|').map(t=>/^[a-z /]+$/.test(t)?'\\b'+t+'[a-z]*\\b':t).join('|'),'gi')}));
const overrides={
 'lenny-building-growth-team':'团队与协作','lenny-hiring-product-talent':'职业与招聘','lenny-negotiating-compensation':'职业与招聘','lenny-org-design':'团队与协作','lenny-product-taste':'产品与策略','lenny-product-reviews':'产品与策略','lenny-recovering-from-failure':'产品与策略','lenny-shipping-velocity':'开发与测试','lenny-ai-assisted-prototyping':'AI与自动化','lenny-ai-evals':'AI与自动化','lenny-ai-product-strategy':'AI与自动化'
};

// Reviewed purpose overrides for ambiguous vocabulary (e.g. job-to-be-done,
// technical SEO, schema, and source inventory are not recruiting or inventory).
const reviewed = {
 '网站与搜索优化': `kostja-blog-page-generator kostja-article-page-generator kostja-toc-generator kostja-url-slug-generator kostja-faq-page-generator kostja-glossary-page-generator kostja-grokipedia-recommendations kostja-howto-section-generator kostja-masonry kostja-rendering-strategies kostja-sidebar-generator kostja-site-crawlability kostja-tab-accordion kostja-about-page-generator kostja-breadcrumb-generator kostja-canonical-tag kostja-card kostja-carousel kostja-heading-structure kostja-comparison-table-generator kostja-core-web-vitals kostja-grid kostja-features-page-generator kostja-products-page-generator kostja-resources-page-generator kostja-serp-features kostja-showcase-page-generator kostja-tools-page-generator kostja-website-structure kostja-internal-links kostja-migration-page-generator kostja-schema-markup kostja-url-structure kostja-template-page-generator kostja-api-page-generator kostja-indexing kostja-integrations-page-generator kostja-open-graph kostja-social-share-generator kostja-status-page-generator kostja-xml-sitemap kostja-list kostja-404-page-generator kostja-robots-txt kostja-signup-login-page-generator kostja-featured-snippet kostja-trust-badges-generator kostja-page-metadata corey-schema corey-site-architecture aaron-technical-seo-checker aaron-serp-markup-builder aaron-site-structure-optimizer aaron-rank-tracker kostja-content-optimization`,
 '内容与写作': `corey-content-strategy alireza-content-strategy kostja-content-strategy alireza-content-production hub-513ecdd8-content-strategy kostja-tiktok-captions kostja-employee-generated-content alireza-copy-editing kostja-linkedin-posts kostja-pinterest-posts kostja-medium-posts kostja-reddit-posts kostja-twitter-x-posts kostja-translation aaron-story-bank-builder aaron-social-creative-builder aaron-narrative-cascade-planner aaron-narrative-baseline-mapper`,
 '视觉与体验设计': `hub-d6150a32-ai-poster-deck hub-92649350-semantic-motion-explainer hub-643b834d-china-poster-studio hub-3586fb85-photo-to-poster kostja-visual-content kostja-brand-visual-generator kostja-favicon-generator kostja-logo-generator alireza-apple-hig-expert alexe-assess-experience-quality alexe-manage-design-handoff`,
 '营销与增长': `kostja-tiktok-ads kostja-google-ads kostja-native-ads kostja-seo-strategy corey-public-relations alireza-linkedin-strategy aaron-press-media-relations alireza-linkedin-skills corey-offers kostja-creator-program kostja-rebranding-strategy corey-referrals alireza-launch-strategy corey-launch kostja-distribution-channels kostja-product-launch kostja-discount-marketing-strategy kostja-product-hunt-launch kostja-gtm-strategy kostja-paid-ads-strategy kostja-public-relations alireza-ad-creative alireza-partnerships-architect aaron-channel-portfolio-planner alireza-linkedin-engagement kostja-generative-engine-optimization kostja-education-program kostja-eeat-signals aaron-launch-registry aaron-launch-window-planner`,
 '数据与分析': `weisberg-source-inventory weisberg-clv-modeling weisberg-cohort-analysis weisberg-audience-segmentation weisberg-safe-experiment-design weisberg-reporting weisberg-experiment-decision-review weisberg-experiment-operating-model weisberg-experiment-report weisberg-analysis-intake weisberg-executive-evidence-brief weisberg-executive-readout weisberg-measurement-integration weisberg-early-signal-monitoring weisberg-dashboard-spec weisberg-metric-contract weisberg-null-results-registry weisberg-up-sell-analysis weisberg-analysis-brief weisberg-analyze-results weisberg-cross-sell-analysis weisberg-data-extraction weisberg-email-incrementality weisberg-metric-lineage weisberg-metric-movement-diagnostic weisberg-attribution-analysis weisberg-segment-diagnostics alireza-analytics-tracking alireza-campaign-analytics alireza-social-media-analyzer alireza-product-analytics alexe-analyze-unit-economics alexe-model-ltv-cac alexe-analyze-experiment-results alexe-formulate-experiment-hypothesis alexe-validate-experiment-quality alexe-estimate-sample-size alexe-build-decision-dashboard alexe-design-metric-alert-system alexe-detect-performance-signals alexe-frame-roi-analysis alexe-diagnose-metric-movement aaron-report-generator aaron-roi-calculator aaron-performance-monitor kostja-ai-traffic-tracking`,
 '团队与协作': `lenny-public-speaking alireza-scrum-master alireza-capacity-planner alexe-run-retrospective alexe-align-cross-team-communication alexe-build-operating-norms alexe-collaborate-with-engineering alexe-communicate-decisions-tradeoffs alexe-run-cross-functional-review`,
 '会员与用户运营': `alexe-plan-lifecycle-engagement corey-onboarding lenny-user-onboarding-activation alexe-monitor-adoption-health kostja-community-forum aaron-engagement-inbox-manager hub-9f51ff99-engagement-inbox-manager`,
 '产品与策略': `alexe-apply-jtbd-framework lenny-marketplace-fundamentals lenny-marketplace-liquidity-take-rates lenny-measuring-pmf alexe-build-business-case alireza-code-to-prd corey-paywalls`,
 '职业与招聘': `lenny-breaking-into-product alireza-linkedin-profile`,
 '财务与合规': `alireza-pricing-strategist alireza-pricing-strategy kostja-pricing-strategy lenny-fundraising alireza-contract-and-proposal-writer aaron-consent-registry weisberg-personalization-governance alexe-govern-responsible-ai alexe-apply-ethical-decision-framework alexe-design-risk-register`,
 '电商与门店': `alireza-procurement-optimizer alireza-vendor-management kostja-category-page-generator kostja-refund-page-generator kostja-shipping-page-generator`,
 '销售与客户': `alireza-sales-engineer aaron-cold-outbound-sequencer`,
 '调研与洞察': `alexe-synthesize-feedback-themes alexe-triage-feedback-loop alexe-run-voc-program lenny-continuous-discovery`,
 '文档与办公': `alexe-build-product-wiki`,
 'AI与自动化': `alexe-automate-workflow-governance alexe-assess-model-capabilities alexe-evaluate-ai-quality-monitoring alexe-ideate-ai-features alexe-make-model-tradeoff-decision alexe-run-ai-prototype-evaluation`,
 '开发与测试': `hub-e7fc7dcd-wagtail-django-cms alexe-assess-reliability-scalability alexe-design-developer-experience alexe-prioritize-architecture-aware`,
};
for(const [category,ids] of Object.entries(reviewed))for(const id of ids.split(/\s+/))overrides[id]=category;
const manifest=JSON.parse(fs.readFileSync(path.join(bundle,'manifest.json'),'utf8')),out={},audit=[];
const hits=(value,re)=>new Set((value.toLowerCase().match(re)||[]).map(x=>x.toLowerCase())).size;
for(const s of manifest.skills){
 const content=fs.readFileSync(path.join(bundle,s.path,'SKILL.md'),'utf8');
 const title=s.original_name.replace(/[-_]/g,' '),desc=s.description_original||'';
 const scores=rules.map(r=>({category:r.category,score:hits(title,r.re)*8+hits(desc,r.re)*4+Math.min(3,hits(content,r.re))})).sort((a,b)=>b.score-a.score);
 const category=overrides[s.id]||scores[0].category;
 out['filtered-'+s.id]={group:category,tags:[category]};
 audit.push({id:s.id,category,score:scores[0].score,margin:scores[0].score-scores[1].score,description:desc.slice(0,180)});
}
fs.writeFileSync(path.join(root,'src/skill-categories.json'),JSON.stringify(out,null,2)+'\n');
fs.mkdirSync(path.join(root,'.local'),{recursive:true});fs.writeFileSync(path.join(root,'.local/skill-classification-audit.json'),JSON.stringify(audit,null,2));
console.log(JSON.stringify(audit.reduce((a,s)=>(a[s.category]=(a[s.category]||0)+1,a),{})));
console.log(JSON.stringify(audit.filter(s=>s.score<10||s.margin<2).map(s=>({id:s.id,category:s.category,description:s.description})).slice(0,55),null,2));
