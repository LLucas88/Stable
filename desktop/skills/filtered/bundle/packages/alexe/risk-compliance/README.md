# 🛡️ Risk, Compliance & Responsible Product Development

[← Back to all domains](../README.md)

Skills for running pre-mortems, assessing privacy and regulatory risks, planning mitigations, applying ethical frameworks, and governing responsible AI.

Nobody plans for failure — and that's exactly why initiatives fail. This domain gives your agent the adversarial thinking to surface what could go wrong before it does, the structured assessments to catch privacy and compliance gaps early, and the governance practices to ship AI responsibly.

---

## 📋 What's inside

This domain covers two connected tracks:

```text
Track 1: Risk management               Track 2: Compliance & AI governance

initiative defined                      feature with personal data
    ↓                                       ↓
pre-mortem                              privacy impact assessment
    ↓                                       ↓
risk register                           privacy/security/regulatory assessment
    ↓                                       ↓
risk mitigation plans                   ethical decision framework
                                            ↓
                                        AI audit
                                            ↓
                                        responsible AI governance
```

Track 1 is about product risk (will this initiative succeed?). Track 2 is about compliance and responsible development (are we doing this ethically and legally?). They intersect when risks include privacy, regulatory, or ethical dimensions.

---

## 🔗 How the skills connect

**Risk management track:**
- `run-pre-mortem` surfaces realistic failure modes → feeds `design-risk-register`
- `design-risk-register` formalizes risks with owners and triggers → feeds `plan-risk-mitigation`
- `plan-risk-mitigation` develops mitigation strategies and contingencies → feeds `plan-delivery-collaboration` (product-planning)

**Compliance & governance track:**
- `run-privacy-impact-assessment` maps data flows and privacy risks → feeds `assess-privacy-security-regulatory`
- `assess-privacy-security-regulatory` evaluates regulatory exposure → feeds `plan-risk-mitigation` and `write-requirements-prd` (product-planning)
- `apply-ethical-decision-framework` evaluates decisions for potential harms → feeds `govern-responsible-ai`
- `conduct-ai-audit` audits deployed AI against responsible standards → feeds `govern-responsible-ai` and `evaluate-ai-quality-monitoring` (ai-product)
- `govern-responsible-ai` establishes governance practices → feeds `evaluate-ai-quality-monitoring` (ai-product)

**Cross-domain connections:**
- Risk mitigation feeds `plan-delivery-collaboration` and `plan-product-launch` (product-planning, gtm)
- Privacy requirements feed `write-requirements-prd` (product-planning)
- AI governance connects to `evaluate-ai-quality-monitoring` and `design-human-in-loop-workflow` (ai-product)

---

## 🛠️ Skills in this domain

### 1. `run-pre-mortem`

Use this when a high-stakes initiative is about to be committed to and risks haven't been examined, or the team is overly confident and needs adversarial thinking.

What it does:
- Assumes the initiative has failed catastrophically 12 months from now
- Generates failure modes across categories: technical, market, execution, organizational, external
- Assesses likelihood and severity of each failure mode
- Produces input for formal risk planning

---

### 2. `design-risk-register`

Use this when risks have been identified (via pre-mortem or other analysis) and need ongoing tracking with ownership.

What it does:
- Defines risk categories relevant to the context
- For each risk: defines likelihood, impact, severity, trigger, owner, mitigation, and contingency
- Creates a living document, not a one-time list
- Ensures every risk has a named owner (group ownership = no ownership)

---

### 3. `plan-risk-mitigation`

Use this when a product initiative has identifiable risks that need managed with concrete strategies and owners.

What it does:
- Classifies risks: technical, market, execution, legal/compliance, ethical, organizational
- Defines the trigger for each risk: what event indicates it's materializing?
- Defines mitigation strategy: reduce, accept, transfer, or avoid
- Assigns owners and contingency plans

---

### 4. `assess-privacy-security-regulatory`

Use this when a feature collects or processes personal data, involves third-party data sharing, or operates in a regulated domain.

What it does:
- Identifies all personal, sensitive, or regulated data types involved
- Identifies applicable regulations by geography and data type
- Assesses privacy risks: collection, storage, access, sharing, retention
- Assesses security risks: attack surface, data exposure, access controls

---

### 5. `run-privacy-impact-assessment`

Use this when a formal PIA is needed for a feature that handles personal data, or regulatory requirements mandate it.

What it does:
- Maps the full data flow: collection → processing → storage → sharing → deletion
- Identifies applicable regulations and their requirements
- Assesses privacy risks at each stage
- Defines mitigations and produces a PIA document

---

### 6. `apply-ethical-decision-framework`

Use this when a product decision may harm certain user groups, optimize for engagement at the expense of wellbeing, or raise fairness concerns.

What it does:
- Identifies all affected user groups, including marginalized or vulnerable populations
- Identifies potential harms: psychological, financial, privacy, autonomy, fairness
- Evaluates through multiple ethical lenses: utility, rights, fairness, care
- Produces actionable recommendations, not just theoretical analysis

---

### 7. `conduct-ai-audit`

Use this when a deployed AI feature needs review against responsible AI standards, or regulatory/legal requirements mandate an audit.

What it does:
- Defines audit scope: which AI feature, which standards, what time period
- Gathers evidence: model documentation, training data, quality metrics, incident logs
- Audits against each dimension: fairness, transparency, accountability, safety, privacy
- Identifies gaps and produces remediation recommendations

---

### 8. `govern-responsible-ai`

Use this when establishing governance practices for AI features, or existing AI features lack accountability or monitoring mechanisms.

What it does:
- Defines AI governance principles (fairness, transparency, accountability, safety, privacy)
- Identifies governance requirements per principle
- Designs accountability structures: who owns AI governance, how decisions are made
- Designs transparency mechanisms: how users are informed about AI use

---

## 🧭 How to use this domain

### Option 1: Initiative risk planning

Use this when launching a new initiative that needs risk coverage.

Typical path:
1. `run-pre-mortem`
2. `design-risk-register`
3. `plan-risk-mitigation`

### Option 2: Privacy & compliance assessment

Use this when building a feature that touches personal data.

Typical path:
1. `run-privacy-impact-assessment`
2. `assess-privacy-security-regulatory`
3. Feed findings into `plan-risk-mitigation`

### Option 3: Responsible AI

Use this when building or auditing AI features.

Typical path:
1. `apply-ethical-decision-framework`
2. `conduct-ai-audit`
3. `govern-responsible-ai`

### Option 4: Enter in the middle

- Initiative is committed, risks not examined → start with `run-pre-mortem`
- Feature handles personal data → start with `run-privacy-impact-assessment`
- AI feature live, need audit → start with `conduct-ai-audit`
- Ethical concern raised → start with `apply-ethical-decision-framework`

---

## ⚠️ What this domain protects against

Common risk and compliance failure modes:

- **Overconfidence before launch.** Teams that don't imagine failure are surprised by it. `run-pre-mortem` forces adversarial thinking.
- **Risk registers that gather dust.** A document nobody reviews is not risk management. `design-risk-register` requires review cadence and named owners.
- **Privacy assessed after shipping.** Retroactive fixes are expensive and often insufficient. `run-privacy-impact-assessment` runs before launch, not after.
- **"But it's technically legal."** Legal compliance is necessary but not sufficient. `apply-ethical-decision-framework` evaluates harms beyond regulatory requirements.
- **AI governance as PR.** Principles without enforcement are decoration. `govern-responsible-ai` designs accountability structures, not just posters.

---

## 🚀 Where to start

If you're new to this domain:
1. Read this README
2. Pick the skill that matches your current situation
3. Read its SKILL.md
4. Check the examples — they show behavior with rich, light, and poor context
