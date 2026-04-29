# Gotchas — Hard-Won Lessons

Failure patterns to document as we build RecipeKeepsake.

*Started: 2026-04-29*

---

## Telugu / Whisper

### Code-switching mid-recipe

**Pattern**: Grandma speaks Telugu but ingredient names and measurements are often English ("one cup", "baking powder", "half teaspoon"). Whisper handles this reasonably but can mis-transcribe.

**Rule**: Always pass `language="te"` to Whisper but expect English words to appear in the transcript. Call A (translation) must preserve these verbatim, not translate them back to Telugu.

---

## Vague measurements

**Pattern**: Traditional recipes use phrases like "konjam" (a little), "cheyyi nimpinchu" (fill your hand), "smell-ki vachchindi" (until it smells right). These are NOT errors — they are the recipe.

**Rule**: Call B (structuring) prompt must explicitly say: "Where quantity is vague (handful, pinch, to taste, until it smells right), preserve the vague term verbatim in a cook_notes field. Do NOT invent a measurement."

---

*(Add new patterns here as they're discovered during build)*
