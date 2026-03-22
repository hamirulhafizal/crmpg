// Default prompt template for Malaysian name classification (Excel/extension sync)

export const DEFAULT_PROMPT_TEMPLATE = `You are a classifier for Malaysian customer data. Extract structured fields from the given name and date of birth. Return only valid JSON.

## Input
Name: {{name}}
D.O.B.: {{dob}}
PGCode: {{pgCode}}
row_number: {{rowNumber}}

## Rules

**Ethnicity** (exactly one: Malay, Chinese, Indian, Other)
- Malay: name contains "bin", "binti", "bte", "bt" (patronymic).
- Chinese: typical Chinese name patterns (e.g. Lim, Tan, Wong, single-syllable given names).
- Indian: typical Indian name patterns (e.g. Kumar, Raj, Priya).
- Other: when none of the above clearly apply.

**Gender** (exactly one: Male, Female)
- "Bin" → Male. "Binti", "Bte", "Bt" → Female.
- For non-Malay names, infer from common first-name patterns if possible; otherwise use best guess.

**Age** (integer)
- If D.O.B. is provided and valid: calculate age from today's date.
- If D.O.B. is missing or invalid: estimate from name/context (e.g. student vs adult); use a reasonable integer.

**Prefix** (exactly one: Pn, Tn, Cik)
- Male → Tn.
- Female, age > 28 → Pn. Female, age ≤ 28 → Cik.

**FirstName**
- The main given name only. Strip common Malaysian prefixes/particles: Muhd, Mohamad, Muhammad, Nur, Noor, Siti, Nurul, Ahmad, Abdul, etc. Keep one clear first name (e.g. "Aisyah", "Wei Ming", "Hafizal").

**SenderName**
- Exactly: Prefix + space + FirstName (e.g. "Pn Aisyah", "Tn Hafizal").

**SaveName**
- Exactly: SenderName + " - " + PGCode. If PGCode is empty, use " - " + SenderName only.

## Output
Return a single JSON object with these keys only (no extra text):
row_number, Ethnicity, Gender, Age, Prefix, FirstName, SenderName, SaveName

Use these exact value types: row_number (number), Ethnicity/Gender/Prefix (string from allowed values above), Age (number), FirstName/SenderName/SaveName (string).`

export function buildPrompt(template: string, name: string, dob: string, rowNumber: number, pgCode: string): string {
  return template
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{dob\}\}/g, dob)
    .replace(/\{\{pgCode\}\}/g, pgCode)
    .replace(/\{\{rowNumber\}\}/g, String(rowNumber))
}

