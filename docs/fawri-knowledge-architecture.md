# Fawri knowledge architecture

## Goal

Fawri must be useful from the merchant's first customer conversation. It must not begin as an empty bot that only becomes useful after repeated merchant training.

The knowledge system is layered. A lower layer may add safe general understanding, but it must never override a higher factual authority.

## Authority order

The decision order is:

1. **Live operational authority**
   - current price and promotion
   - inventory and location availability
   - order status and payment state
   - delivery quote, payment methods, and other structured merchant settings

2. **Merchant-specific policy and approved knowledge**
   - merchant Saved Answers
   - approved learned answers
   - merchant-confirmed corrections

3. **Fawri activity encyclopedia**
   - curated knowledge selected from the merchant's registered activity type
   - launch packs: fashion, electronics, food, perfumes, and jewelry

4. **Fawri global encyclopedia**
   - curated general commerce/product terminology useful across activities

5. **Constrained AI composition**
   - wording/composition only when grounded in trusted records supplied by the server

6. **Clarification or human handoff**
   - used when a safe answer cannot be established

A lower layer is never allowed to contradict or replace a higher layer.

## Fawri encyclopedia trust model

Encyclopedia entries use the fawri_curated provenance. They are not merchant_approved and are not openai_generated.

They are intended for stable, general knowledge such as terminology and product concepts, category-specific buying guidance, care/usage concepts that are not merchant-specific, and explanations such as RAM versus storage, EDT versus EDP, apparel sizing concepts, or jewelry karat terminology.

They must not become an authority for current price or promotion, current stock, order/customer-private state, merchant delivery/payment settings, merchant-specific return/warranty policy, or a product-specific specification that is absent from the catalog.

Operational questions are blocked from encyclopedia resolution before article retrieval.

## Activity selection

The merchant's server-side merchants.activity_type selects the activity pack. The current signup values map to:

- ملابس -> fashion
- إلكترونيات -> electronics
- مواد غذائية -> food
- عطور -> perfumes
- مجوهرات -> jewelry

Common Arabic, Sorani, and English aliases are also recognized. A custom activity gets the global encyclopedia until a dedicated pack is introduced.

The customer/browser does not choose the activity authority.

## Merchant override

Merchant-specific knowledge always outranks the encyclopedia.

If Fawri answers from the encyclopedia and the merchant later corrects that answer, the existing merchant-correction review flow may ask whether to adopt the correction. If approved, the correction becomes merchant-approved knowledge and therefore wins over the encyclopedia on future matching questions.

This provides specialization without editing the platform encyclopedia itself.

## Language

Each bootstrap article has curated Arabic, Sorani Kurdish, and English wording. Fawri answers directly in the detected customer language for these entries; the article does not depend on live translation to be useful on first activation.

The broader cross-language merchant-knowledge translation rules remain unchanged.

## Style is separate from facts

The system keeps **what Fawri knows** separate from **how Fawri says it**.

A merchant response-style profile is stored in the merchant's server-owned metadata under a dedicated versioned namespace. The profile is managed from the knowledge workspace and currently controls:

- tone: professional, friendly, warm, or direct;
- reply length: concise, balanced, or detailed;
- emoji preference: none, minimal, or expressive;
- bounded free-text style instructions.

The default profile is professional, balanced, and minimal, so a merchant can activate Fawri without configuring style first.

The profile is presentation-only. It is loaded by the server knowledge-policy resolver and passed to constrained AI as trusted merchant presentation data, while a higher-priority system rule states that style can never add, remove, weaken, strengthen, or contradict facts or safety constraints. Sensitive values in free-text style instructions are redacted before provider transport.

Merchant Saved Answers remain exact merchant-approved wording. Fawri encyclopedia answers remain curated wording unless the merchant adopts a correction, which creates higher-priority merchant knowledge. A later strictly grounded presentation rewriter may apply the global style to deterministic fact/encyclopedia wording, but only if it can preserve factual tokens and source authority.

Style may never alter a number, price, date, quantity, SKU, URL, or policy condition; turn general encyclopedia guidance into a merchant promise; override live operational authority; or weaken safety or grounding rules.

This separation allows the merchant to make Fawri sound like their own experienced employee without corrupting the factual knowledge base.

## Bootstrap corpus and expansion

The current version-controlled launch corpus contains **51 curated articles**: global commerce/product terminology plus expanded packs for fashion, electronics, food, perfumes, and jewelry. Coverage includes product identifiers and condition terminology, sizing and fabrics, display/storage/charging concepts, food labels and storage concepts, fragrance terminology, and jewelry materials/sizing/care.

This is a broad first-activation corpus, not a claim that every retail domain is complete. Custom activities receive global knowledge until a dedicated reviewed pack is introduced. The resolver contract is intentionally separate from the decision engine so the corpus can keep expanding or later move to a managed/vector-backed encyclopedia without changing authority order or reply contracts.

Expansion remains incremental and reviewed. Every new article must have a stable ID, a clear global/activity scope, multiple question phrasings, curated Arabic/Sorani/English answers, and content that does not depend on merchant-specific or live operational state.
