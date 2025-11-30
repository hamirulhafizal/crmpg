// Default prompt template based on n8n workflow

export const DEFAULT_PROMPT_TEMPLATE = `You are a classifier. This is an example we have:

| Name                                   | D.O.B.     | Gender | Age | Prefix | Ethnicity |
| -------------------------------------- | ---------- | ------ | --- | ------ | --------- |
| Hamirul Hafizal Bin Mohamad Kamaruddin | 1997-01-05 | male   | 28  | En     | Malay     |
| Lim Wei Ming                           | 2000-07-12 | male   | 25  | Tn     | Chinese   |
| Siti Nur Aisyah Binti Ahmad            | 1995-03-22 | female | 30  | Pn     | Malay     |

The data provided is:

Name: {{name}}
D.O.B.: {{dob}}
PGCode: {{pgCode}}

You MUST return a JSON object with the following keys:

1. row_number: {{rowNumber}},
2. Ethnicity - (Malay/Chinese/Indian/Other)
3. Gender - (Male/Female)
4. Age - (calculate from D.O.B. if provided, otherwise estimate from name)
5. Prefix - En, Pn, Cik, Tn -- if(age > 28, En or Pn) else ( Tn, Cik )
6. FirstName - without common prefix name like muhd, mohamad, nur, noor, siti, nurul, nur, ahmad and others that common on malaysia
7. SenderName - Prefix + FirstName
8. SaveName - {{PGCode}} - {{SenderName}}

Example:
1. row_number: {{rowNumber}}
2. Ethnicity: Malay
3. Age : 30
4. Gender : Female
4. Prefix : Pn
5. FirstName : Aisyah
6. SenderName: Pn Aisyah
8. SaveName: PG01140829 - Pn Aisyah

Do not return anything else. Only return the JSON object.`

export function buildPrompt(template: string, name: string, dob: string, rowNumber: number, pgCode: string): string {
  return template
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{dob\}\}/g, dob)
    .replace(/\{\{pgCode\}\}/g, pgCode)
    .replace(/\{\{rowNumber\}\}/g, String(rowNumber))
}

